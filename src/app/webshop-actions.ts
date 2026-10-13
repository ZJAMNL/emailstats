"use server";

import { hash } from "bcryptjs";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { getAppUrl } from "@/lib/app-url";
import { countProfilesForWebshop, getTenantCopernica, listDatabaseFields, sampleProfileFieldValues } from "@/lib/copernica";
import { sendPasswordMail } from "@/lib/password-reset";
import { getPrismaClient } from "@/lib/prisma";
import { adminForTenant } from "@/lib/admin-access";
import { resetTwoFactor } from "@/lib/security/mfa-reset";
import { saveSelectionGroups, type SelectionGroup } from "@/lib/tenant-settings";
import { requireRole } from "@/lib/session";
import { campaignMatchesWebshop, getAllowedScopes, SCOPE_COOKIE } from "@/lib/webshops";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const noAccess = { ok: false as const, error: "Je hebt geen toegang tot deze klant." };

export type WebshopInput = { id?: string; name: string; kind: "field" | "selections"; profileField: string; fieldValues: string[]; selectionIds: string[]; campaignTerms: string[] };
export type TenantUserInput = { name: string; email: string; allWebshops: boolean; webshopIds: string[] };

const list = (values: unknown, max = 20) => Array.isArray(values) ? [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].slice(0, max).map((value) => value.slice(0, 120)) : [];

const invalidWebshop = "Vul een naam in, en kies een profielveld met minstens één waarde of minstens één selectie.";

/** A webshop on a profile field needs the field and its values; one made of selections needs followed selections of this customer. */
async function validateWebshop(tenantId: string, input: WebshopInput) {
  const name = String(input?.name ?? "").trim().slice(0, 80);
  const campaignTerms = list(input?.campaignTerms);
  if (!name) return null;
  if (input?.kind === "selections") {
    const requested = list(input.selectionIds, 200);
    const selectionIds = (await getPrismaClient().copernicaSelection.findMany({ where: { tenantId, id: { in: requested } }, select: { id: true } })).map((selection) => selection.id);
    return selectionIds.length ? { name, kind: "selections", profileField: "", fieldValues: [], selectionIds, campaignTerms } : null;
  }
  const profileField = String(input?.profileField ?? "").trim().slice(0, 120);
  const fieldValues = list(input?.fieldValues);
  if (!profileField || !fieldValues.length) return null;
  return { name, kind: "field", profileField, fieldValues, selectionIds: [], campaignTerms };
}

// ---------------------------------------------------------------- webshops (admin)

export async function webshopFieldsAction(tenantId: string): Promise<Result<{ id: string; name: string; type: string }[]>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    const connected = await getTenantCopernica(tenantId);
    if (!connected) return { ok: false, error: "Deze klant heeft nog geen Copernica-koppeling." };
    return { ok: true, data: await listDatabaseFields(connected.jwt, connected.connection.databaseId) };
  } catch {
    return { ok: false, error: "De velden konden niet uit Copernica worden opgehaald." };
  }
}

export async function webshopSampleValuesAction(tenantId: string, field: string): Promise<Result<{ value: string; count: number }[]>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    const connected = await getTenantCopernica(tenantId);
    if (!connected) return { ok: false, error: "Deze klant heeft nog geen Copernica-koppeling." };
    return { ok: true, data: await sampleProfileFieldValues(connected.jwt, connected.connection.databaseId, String(field)) };
  } catch {
    return { ok: false, error: "Voorbeeldwaarden konden niet worden opgehaald." };
  }
}

export async function webshopCheckAction(tenantId: string, input: WebshopInput): Promise<Result<{ profiles: number | null; campaigns: number; totalCampaigns: number }>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const webshop = await validateWebshop(tenantId, input);
  if (!webshop) return { ok: false, error: invalidWebshop };
  try {
    const campaigns = await getPrismaClient().campaign.findMany({ where: { tenantId }, select: { name: true } });
    const matching = campaigns.filter((campaign) => campaignMatchesWebshop(campaign, { id: "", ...webshop, kind: webshop.kind === "selections" ? "selections" : "field" })).length;
    // A webshop made of selections has no profile count of its own: its selections are counted every night anyway.
    if (webshop.kind === "selections") return { ok: true, data: { profiles: null, campaigns: matching, totalCampaigns: campaigns.length } };
    const connected = await getTenantCopernica(tenantId);
    if (!connected) return { ok: false, error: "Deze klant heeft nog geen Copernica-koppeling." };
    const profiles = await countProfilesForWebshop(connected.jwt, `database/${encodeURIComponent(connected.connection.databaseId)}/profiles`, webshop);
    return { ok: true, data: { profiles, campaigns: matching, totalCampaigns: campaigns.length } };
  } catch {
    return { ok: false, error: "De controle is mislukt. Controleer het veld en de waarden." };
  }
}

export async function saveWebshopAction(tenantId: string, input: WebshopInput): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const webshop = await validateWebshop(tenantId, input);
  if (!webshop) return { ok: false, error: invalidWebshop };
  const prisma = getPrismaClient();
  try {
    if (input.id) {
      const updated = await prisma.webshop.updateMany({ where: { id: input.id, tenantId }, data: webshop });
      if (!updated.count) return { ok: false, error: "Deze webshop bestaat niet meer." };
    } else {
      const count = await prisma.webshop.count({ where: { tenantId } });
      await prisma.webshop.create({ data: { tenantId, sortOrder: count, ...webshop } });
    }
  } catch {
    return { ok: false, error: "Opslaan is mislukt. Bestaat er al een webshop met deze naam?" };
  }
  refresh();
  return { ok: true, data: null };
}

export async function deleteWebshopAction(tenantId: string, webshopId: string): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const prisma = getPrismaClient();
  const webshop = await prisma.webshop.findFirst({ where: { id: webshopId, tenantId }, select: { id: true } });
  if (!webshop) return { ok: false, error: "Deze webshop bestaat niet meer." };
  await prisma.$transaction([
    prisma.selectionSnapshot.deleteMany({ where: { scope: webshop.id, selection: { tenantId } } }),
    prisma.webshop.delete({ where: { id: webshop.id } }),
  ]);
  refresh();
  return { ok: true, data: null };
}

export async function saveTenantSelectionGroupsAction(tenantId: string, groups: SelectionGroup[]): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  try {
    await saveSelectionGroups(tenantId, groups);
  } catch {
    return { ok: false, error: "De groepen zijn niet opgeslagen. Probeer het opnieuw." };
  }
  refresh();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------- users (admin)

async function validateUserInput(tenantId: string, input: TenantUserInput) {
  const name = String(input?.name ?? "").trim().slice(0, 120);
  const email = String(input?.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const allWebshops = input.allWebshops === true;
  const requested = list(input.webshopIds, 100);
  const owned = allWebshops ? [] : (await getPrismaClient().webshop.findMany({ where: { tenantId, id: { in: requested } }, select: { id: true } })).map((webshop) => webshop.id);
  return { name, email, allWebshops, webshopIds: owned };
}

export async function createTenantUserAction(tenantId: string, input: TenantUserInput & { sendInvite: boolean }): Promise<Result<{ invited: boolean }>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const user = await validateUserInput(tenantId, input);
  if (!user) return { ok: false, error: "Vul een naam en een geldig e-mailadres in." };
  if (!user.allWebshops && !user.webshopIds.length) return { ok: false, error: "Kies ‘Alle webshops’ of minstens één webshop." };

  const prisma = getPrismaClient();
  let created;
  try {
    created = await prisma.user.create({
      data: {
        tenantId,
        role: "CUSTOMER",
        name: user.name,
        email: user.email,
        // Unusable until the user sets a password through the invitation link.
        passwordHash: await hash(`${crypto.randomUUID()}${crypto.randomUUID()}`, 12),
        allWebshops: user.allWebshops,
        webshops: { create: user.webshopIds.map((webshopId) => ({ webshopId })) },
      },
    });
  } catch {
    return { ok: false, error: "Toevoegen is mislukt. Wordt dit e-mailadres al gebruikt?" };
  }

  let invited = false;
  if (input.sendInvite) {
    try {
      await sendPasswordMail(created, "invite", await getAppUrl());
      invited = true;
    } catch {
      refresh();
      return { ok: false, error: "De gebruiker is toegevoegd, maar de uitnodiging kon niet worden verstuurd. Probeer ‘Inloglink mailen’." };
    }
  }
  refresh();
  return { ok: true, data: { invited } };
}

export async function updateTenantUserAction(tenantId: string, userId: string, input: TenantUserInput): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const user = await validateUserInput(tenantId, input);
  if (!user) return { ok: false, error: "Vul een naam en een geldig e-mailadres in." };
  if (!user.allWebshops && !user.webshopIds.length) return { ok: false, error: "Kies ‘Alle webshops’ of minstens één webshop." };
  const prisma = getPrismaClient();
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId, role: "CUSTOMER" }, select: { id: true } });
  if (!existing) return { ok: false, error: "Deze gebruiker bestaat niet meer." };
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.id }, data: { name: user.name, email: user.email, allWebshops: user.allWebshops } }),
      prisma.userWebshop.deleteMany({ where: { userId: existing.id } }),
      prisma.userWebshop.createMany({ data: user.webshopIds.map((webshopId) => ({ userId: existing.id, webshopId })) }),
    ]);
  } catch {
    return { ok: false, error: "Opslaan is mislukt. Wordt dit e-mailadres al gebruikt?" };
  }
  refresh();
  return { ok: true, data: null };
}

export async function deleteTenantUserAction(tenantId: string, userId: string): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const prisma = getPrismaClient();
  const users = await prisma.user.findMany({ where: { tenantId, role: "CUSTOMER" }, select: { id: true } });
  if (!users.some((user) => user.id === userId)) return { ok: false, error: "Deze gebruiker bestaat niet meer." };
  if (users.length <= 1) return { ok: false, error: "Een klant houdt minstens één gebruiker." };
  await prisma.user.delete({ where: { id: userId } });
  refresh();
  return { ok: true, data: null };
}

export async function sendUserLoginLinkAction(tenantId: string, userId: string): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const user = await getPrismaClient().user.findFirst({ where: { id: userId, tenantId, role: "CUSTOMER" } });
  if (!user) return { ok: false, error: "Deze gebruiker bestaat niet meer." };
  try {
    await sendPasswordMail(user, "invite", await getAppUrl());
  } catch {
    return { ok: false, error: "De inloglink kon niet worden verstuurd. Controleer de Resend-koppeling." };
  }
  return { ok: true, data: null };
}

export async function resetUserTwoFactorAction(tenantId: string, userId: string): Promise<Result<null>> {
  const admin = await adminForTenant(tenantId);
  if (!admin) return noAccess;
  const user = await getPrismaClient().user.findFirst({ where: { id: userId, tenantId, role: "CUSTOMER" }, select: { id: true } });
  if (!user) return { ok: false, error: "Deze gebruiker bestaat niet meer." };
  await resetTwoFactor(user.id, admin);
  refresh();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------- customer

export async function setWebshopScopeAction(scope: string): Promise<Result<null>> {
  const session = await requireRole("customer");
  const allowed = await getAllowedScopes(session);
  if (!allowed.some((option) => option.id === scope)) return { ok: false, error: "Je hebt geen toegang tot deze webshop." };
  const cookieStore = await cookies();
  cookieStore.set(SCOPE_COOKIE, scope, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  refresh();
  return { ok: true, data: null };
}
