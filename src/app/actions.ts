"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { signInAction as signInDemoAccount } from "@/lib/demo-auth";
import { decryptCopernicaToken, encryptCopernicaToken, listCopernicaViews, syncTenantCopernicaData } from "@/lib/copernica";
import { getPrismaClient } from "@/lib/prisma";
import { createSession, requireRole, requireSession } from "@/lib/session";
import { importSelectionHistory, previewSelectionHistory } from "@/lib/selection-history";
import { saveSelectionWidget, saveSelectionWidgetOrder, saveTenantDashboardModules } from "@/lib/tenant-settings";

export async function signInAction(formData: FormData) {
  return signInDemoAccount(formData);
}

export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("email-stats-session");
  redirect("/login");
}

export async function impersonateCustomerAction(formData: FormData) {
  const admin = await requireRole("admin");
  const tenantId = readField(formData, "tenantId");

  if (!tenantId) redirect("/dashboard/admin/clients?error=impersonation-failed");

  try {
    const tenant = await getPrismaClient().tenant.findFirst({
      where: { id: tenantId, status: "active" },
      include: { users: { where: { role: "CUSTOMER" }, take: 1 } },
    });
    const customer = tenant?.users[0];

    if (!tenant || !customer) redirect("/dashboard/admin/clients?error=impersonation-failed");

    await createSession({
      userId: customer.id,
      email: customer.email,
      role: "customer",
      tenantId: tenant.id,
      name: customer.name,
      impersonator: { userId: admin.userId, email: admin.email, name: admin.name },
    });
  } catch {
    redirect("/dashboard/admin/clients?error=impersonation-failed");
  }

  redirect("/dashboard/customer");
}

export async function stopImpersonationAction() {
  const session = await requireSession();
  if (session.role !== "customer" || !session.impersonator) redirect("/dashboard/customer");

  await createSession({
    userId: session.impersonator.userId,
    email: session.impersonator.email,
    role: "admin",
    tenantId: "platform",
    name: session.impersonator.name,
  });

  redirect("/dashboard/admin/clients");
}

export async function createCustomerAction(formData: FormData) {
  await requireRole("admin");

  const name = readField(formData, "name");
  const email = readField(formData, "email").toLowerCase();
  const password = readField(formData, "password");
  const logoDataUrl = await readLogo(formData);

  if (!name || !email.includes("@") || password.length < 12) {
    redirect("/dashboard/admin/clients?error=invalid-customer");
  }
  if (logoDataUrl === false) redirect("/dashboard/admin/clients?error=invalid-logo");

  try {
    const prisma = getPrismaClient();
    const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`;
    const passwordHash = await hash(password, 12);

    await prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.create({
        data: { name, slug, logoDataUrl: logoDataUrl ?? null, settings: { dashboardModules: readDashboardModules(formData) } },
      });
      await transaction.user.create({
        data: { name, email, passwordHash, tenantId: tenant.id, role: "CUSTOMER" },
      });
    });
  } catch {
    redirect("/dashboard/admin/clients?error=create-customer");
  }

  redirect("/dashboard/admin/clients?notice=customer-created");
}

export async function updateCustomerAction(formData: FormData) {
  await requireRole("admin");

  const tenantId = readField(formData, "tenantId");
  const name = readField(formData, "name");
  const email = readField(formData, "email").toLowerCase();
  const logoDataUrl = await readLogo(formData);

  if (!tenantId || !name || !email.includes("@")) {
    redirect("/dashboard/admin/clients?error=invalid-customer");
  }
  if (logoDataUrl === false) redirect("/dashboard/admin/clients?error=invalid-logo");

  try {
    const prisma = getPrismaClient();
    await prisma.$transaction(async (transaction) => {
      await transaction.tenant.update({
        where: { id: tenantId },
        data: { name, ...(logoDataUrl !== undefined ? { logoDataUrl } : {}) },
      });
      await transaction.user.updateMany({
        where: { tenantId, role: "CUSTOMER" },
        data: { name, email },
      });
    });
    await saveTenantDashboardModules(tenantId, readDashboardModules(formData));
  } catch {
    redirect("/dashboard/admin/clients?error=update-customer");
  }

  redirect("/dashboard/admin/clients?notice=customer-updated");
}

export async function deleteCustomerAction(formData: FormData) {
  await requireRole("admin");

  const tenantId = readField(formData, "tenantId");
  if (!tenantId) redirect("/dashboard/admin/clients?error=invalid-customer");

  try {
    await getPrismaClient().tenant.delete({ where: { id: tenantId } });
  } catch {
    redirect("/dashboard/admin/clients?error=delete-customer");
  }

  redirect("/dashboard/admin/clients?notice=customer-deleted");
}

export async function updateTenantDashboardModulesAction(formData: FormData) {
  await requireRole("admin");
  const tenantId = readField(formData, "tenantId");
  if (!tenantId) redirect("/dashboard/admin/clients?error=invalid-customer");

  try {
    await saveTenantDashboardModules(tenantId, readDashboardModules(formData));
  } catch {
    redirect(`/dashboard/admin/clients/${encodeURIComponent(tenantId)}?error=settings-save-failed`);
  }

  redirect(`/dashboard/admin/clients/${encodeURIComponent(tenantId)}?notice=settings-saved`);
}

const maxHistoryCsvLength = 500_000;

export async function previewSelectionHistoryAction(tenantId: string, csv: string) {
  await requireRole("admin");
  if (typeof csv !== "string" || csv.length > maxHistoryCsvLength) return { ok: false as const, error: "Het bestand is te groot (maximaal 500 KB)." };
  try {
    return { ok: true as const, preview: await previewSelectionHistory(tenantId, csv) };
  } catch {
    return { ok: false as const, error: "Het bestand kon niet worden gelezen." };
  }
}

export async function importSelectionHistoryAction(tenantId: string, csv: string, mapping: Record<string, string>, followSelections: boolean) {
  await requireRole("admin");
  if (typeof csv !== "string" || csv.length > maxHistoryCsvLength) return { ok: false as const, error: "Het bestand is te groot (maximaal 500 KB)." };
  try {
    const result = await importSelectionHistory(tenantId, csv, mapping, followSelections === true);
    refresh();
    return { ok: true as const, result };
  } catch {
    return { ok: false as const, error: "Importeren is niet gelukt. Er is niets opgeslagen." };
  }
}

export async function connectCopernicaAction(formData: FormData) {
  const session = await requireRole("customer");
  const databaseId = readField(formData, "databaseId");
  const apiToken = readField(formData, "apiToken");

  if (!databaseId) {
    redirect("/dashboard/customer/data?error=invalid-connection");
  }

  try {
    const prisma = getPrismaClient();
    const previousConnection = await prisma.copernicaConnection.findUnique({ where: { tenantId: session.tenantId } });
    const tokenToSave = apiToken || (previousConnection ? decryptCopernicaToken(previousConnection.encryptedApiToken) : "");
    if (!tokenToSave) redirect("/dashboard/customer/data?error=invalid-connection");
    const views = await listCopernicaViews(tokenToSave, databaseId);
    await prisma.copernicaConnection.upsert({
      where: { tenantId: session.tenantId },
      create: {
        tenantId: session.tenantId,
        databaseId,
        encryptedApiToken: encryptCopernicaToken(tokenToSave),
      },
      update: {
        databaseId,
        encryptedApiToken: encryptCopernicaToken(tokenToSave),
        connectedAt: new Date(),
      },
    });

    await Promise.all(views.map((view) => prisma.copernicaSelection.upsert({
      where: { tenantId_copernicaId: { tenantId: session.tenantId, copernicaId: String(view.ID) } },
      create: { tenantId: session.tenantId, copernicaId: String(view.ID), name: view.name },
      update: { name: view.name },
    })));
  } catch {
    redirect("/dashboard/customer/data?error=connection-failed");
  }

  redirect("/dashboard/customer/data?notice=connected");
}

export async function updateCopernicaSelectionsAction(formData: FormData) {
  const session = await requireRole("customer");
  const selectedIds = [...new Set(formData.getAll("selectionId").filter((value): value is string => typeof value === "string"))];
  const prisma = getPrismaClient();

  await prisma.copernicaSelection.updateMany({ where: { tenantId: session.tenantId }, data: { enabled: false } });
  if (selectedIds.length > 0) {
    await prisma.copernicaSelection.updateMany({
      where: { tenantId: session.tenantId, id: { in: selectedIds } },
      data: { enabled: true },
    });
  }

  redirect("/dashboard/customer/data?notice=selections-saved");
}

export async function updateSelectionWidgetAction(formData: FormData) {
  const session = await requireRole("customer");

  try {
    await saveSelectionWidget(session.tenantId, readField(formData, "selectionId"), {
      label: readField(formData, "label"),
      baseSelectionId: readField(formData, "baseSelectionId") || null,
      includeInTotal: formData.get("includeInTotal") === "on",
    });
  } catch {
    return { ok: false };
  }

  refresh();
  return { ok: true };
}

export async function reorderSelectionWidgetsAction(order: string[]) {
  const session = await requireRole("customer");
  if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) throw new Error("Invalid order.");
  await saveSelectionWidgetOrder(session.tenantId, order);
}

export async function syncCopernicaNowAction() {
  const session = await requireSession();
  if (session.role !== "customer") redirect("/login");

  try {
    await syncTenantCopernicaData(session.tenantId);
  } catch {
    redirect("/dashboard/customer/data?error=sync-failed");
  }

  redirect("/dashboard/customer/data?notice=synced");
}

export async function syncCampaignsAction(formData: FormData) {
  const session = await requireRole("customer");
  const from = readField(formData, "from");
  const to = readField(formData, "to");

  if (!isDateOnly(from) || !isDateOnly(to) || from > to) {
    redirect("/dashboard/customer/campaigns?error=invalid-date");
  }

  try {
    await syncTenantCopernicaData(session.tenantId, { from, to });
  } catch {
    redirect("/dashboard/customer/campaigns?error=sync-failed");
  }

  redirect(`/dashboard/customer/campaigns?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&notice=synced`);
}

function readField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readDashboardModules(formData: FormData) {
  return {
    databaseStats: formData.get("databaseStats") === "on",
    campaignStats: formData.get("campaignStats") === "on",
  };
}

async function readLogo(formData: FormData): Promise<string | null | undefined | false> {
  if (formData.get("removeLogo") === "on") return null;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > 512 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return false;

  const bytes = Buffer.from(await file.arrayBuffer());
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!(file.type === "image/png" && isPng) && !(file.type === "image/jpeg" && isJpeg) && !(file.type === "image/webp" && isWebp)) return false;

  return `data:${file.type};base64,${bytes.toString("base64")}`;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "klant";
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}
