"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin-access";
import { getAppUrl } from "@/lib/app-url";
import { sendPasswordMail } from "@/lib/password-reset";
import { getPrismaClient } from "@/lib/prisma";

const page = "/dashboard/admin/beheerders";
const adminRoles = ["ADMIN", "SUPERADMIN"] as const;

export async function createAdminAction(formData: FormData) {
  await requireSuperAdmin();
  const name = readField(formData, "name").slice(0, 120);
  const email = readField(formData, "email").toLowerCase().slice(0, 254);
  const role = readRole(formData);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) redirect(`${page}?error=invalid-admin`);

  let created;
  try {
    created = await getPrismaClient().user.create({
      // Unusable until the beheerder sets a password through the invitation link.
      data: { name, email, role, tenantId: null, passwordHash: await hash(`${crypto.randomUUID()}${crypto.randomUUID()}`, 12) },
    });
  } catch {
    redirect(`${page}?error=create-admin`);
  }

  try {
    await sendPasswordMail(created, "invite", await getAppUrl());
  } catch {
    redirect(`${page}?error=invite-failed`);
  }
  redirect(`${page}?notice=admin-invited`);
}

export async function updateAdminRoleAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const userId = readField(formData, "userId");
  const role = readRole(formData);
  if (!role) redirect(`${page}?error=invalid-admin`);
  // Demoting yourself could leave nobody who can manage beheerders.
  if (userId === session.userId) redirect(`${page}?error=own-account`);

  const updated = await getPrismaClient().user.updateMany({ where: { id: userId, role: { in: [...adminRoles] } }, data: { role } });
  if (!updated.count) redirect(`${page}?error=invalid-admin`);
  redirect(`${page}?notice=admin-updated`);
}

export async function deleteAdminAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const userId = readField(formData, "userId");
  const transferTo = readField(formData, "transferTo");
  if (userId === session.userId) redirect(`${page}?error=own-account`);

  const prisma = getPrismaClient();
  const [admin, target] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, role: { in: [...adminRoles] } }, select: { id: true } }),
    transferTo ? prisma.user.findFirst({ where: { id: transferTo, role: { in: [...adminRoles] } }, select: { id: true } }) : null,
  ]);
  if (!admin || (transferTo && (!target || target.id === admin.id))) redirect(`${page}?error=invalid-admin`);

  // Without a new beheerder the customers stay, unassigned, visible to superbeheerders only.
  await prisma.$transaction([
    prisma.tenant.updateMany({ where: { ownerId: admin.id }, data: { ownerId: target?.id ?? null } }),
    prisma.user.delete({ where: { id: admin.id } }),
  ]);
  redirect(`${page}?notice=admin-deleted`);
}

export async function sendAdminLoginLinkAction(formData: FormData) {
  await requireSuperAdmin();
  const user = await getPrismaClient().user.findFirst({ where: { id: readField(formData, "userId"), role: { in: [...adminRoles] } } });
  if (!user) redirect(`${page}?error=invalid-admin`);
  try {
    await sendPasswordMail(user, "invite", await getAppUrl());
  } catch {
    redirect(`${page}?error=login-link-failed`);
  }
  redirect(`${page}?notice=login-link-sent`);
}

function readRole(formData: FormData) {
  const role = readField(formData, "role");
  return role === "superadmin" ? "SUPERADMIN" as const : role === "admin" ? "ADMIN" as const : null;
}

function readField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
