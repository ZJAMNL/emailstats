"use server";

import { hash } from "bcryptjs";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { getAppUrl } from "@/lib/app-url";
import { countProfilesForWebshop, getTenantCopernica, listDatabaseFields, sampleProfileFieldValues } from "@/lib/copernica";
import { sendPasswordMail } from "@/lib/password-reset";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { campaignMatchesWebshop, getAllowedScopes, SCOPE_COOKIE } from "@/lib/webshops";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type WebshopInput = { id?: string; name: string; profileField: string; fieldValues: string[]; campaignTerms: string[] };
export type TenantUserInput = { name: string; email: string; allWebshops: boolean; webshopIds: string[] };

const list = (values: unknown, max = 20) => Array.isArray(values) ? [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].slice(0, max).map((value) => value.slice(0, 120)) : [];

function validateWebshop(input: WebshopInput) {
  const name = String(input?.name ?? "").trim().slice(0, 80);
  const profileField = String(input?.profileField ?? "").trim().slice(0, 120);
  const fieldValues = list(input?.fieldValues);
  if (!name || !profileField || !fieldValues.length) return null;
  return { name, profileField, fieldValues, campaignTerms: list(input?.campaignTerms) };
}

// ---------------------------------------------------------------- webshops (admin)

export async function webshopFieldsAction(tenantId: string): Promise<Result<{ id: string; name: string; type: string }[]>> {
  await requireRole("admin");
  try {
    const connected = await getTenantCopernica(tenantId);
    if (!connected) return { ok: false, error: "Deze klant heeft nog geen Copernica-koppeling." };
    return { ok: true, data: await listDatabaseFields(connected.jwt, connected.connection.databaseId) };
  } catch {
    return { ok: false, error: "De velden konden niet uit Copernica worden opgehaald." };
  }
}

export async function webshopSampleValuesAction(tenantId: string, field: string): Promise<Result<{ value: string; count: number }[]>> {
  await requireRole("admin");
  try {
    const connected = await getTenantCopernica(tenantId);
    if (!connected) return { ok: false, error: "Deze klant heeft nog geen Copernica-koppeling." };
    return { ok: true, data: await sampleProfileFieldValues(connected.jwt, connected.connection.databaseId, String(field)) };
  } catch {
    return { ok: false, error: "Voorbeeldwaarden konden niet worden opgehaald." };
  }
}

export async function webshopCheckAction(tenantId: string, input: WebshopInput): Promise<Result<{ profiles: number; campaigns: number; totalCampaigns: number }>> {
  await requireRole("admin");
  const webshop = validateWebshop(input);
  if (!webshop) return { ok: false, error: "Vul een naam, een profielveld en minstens één waarde in." };
  try {
    const connected = await getTenantCopernica(tenantId);
    if (!connected) return { ok: false, error: "Deze klant heeft nog geen Copernica-koppeling." };
    const [profiles, campaigns] = await Promise.all([
      countProfilesForWebshop(connected.jwt, `database/${encodeURIComponent(connected.connection.databaseId)}/profiles`, webshop),
      getPrismaClient().campaign.findMany({ where: { tenantId }, select: { name: true } }),
    ]);
    return { ok: true, data: { profiles, campaigns: campaigns.filter((campaign) => campaignMatchesWebshop(campaign, { id: "", ...webshop })).length, totalCampaigns: campaigns.length } };
  } catch {
    return { ok: false, error: "De controle is mislukt. Controleer het veld en de waarden." };
  }
}

export async function saveWebshopAction(tenantId: string, input: WebshopInput): Promise<Result<null>> {
  await requireRole("admin");
  const webshop = validateWebshop(input);
  if (!webshop) return { ok: false, error: "Vul een naam, een profielveld en minstens één waarde in." };
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
  await requireRole("admin");
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
  await requireRole("admin");
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
  await requireRole("admin");
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
  await requireRole("admin");
  const prisma = getPrismaClient();
  const users = await prisma.user.findMany({ where: { tenantId, role: "CUSTOMER" }, select: { id: true } });
  if (!users.some((user) => user.id === userId)) return { ok: false, error: "Deze gebruiker bestaat niet meer." };
  if (users.length <= 1) return { ok: false, error: "Een klant houdt minstens één gebruiker." };
  await prisma.user.delete({ where: { id: userId } });
  refresh();
  return { ok: true, data: null };
}

export async function sendUserLoginLinkAction(tenantId: string, userId: string): Promise<Result<null>> {
  await requireRole("admin");
  const user = await getPrismaClient().user.findFirst({ where: { id: userId, tenantId, role: "CUSTOMER" } });
  if (!user) return { ok: false, error: "Deze gebruiker bestaat niet meer." };
  try {
    await sendPasswordMail(user, "invite", await getAppUrl());
  } catch {
    return { ok: false, error: "De inloglink kon niet worden verstuurd. Controleer de Resend-koppeling." };
  }
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
