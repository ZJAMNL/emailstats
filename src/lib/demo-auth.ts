import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { getPrismaClient } from "./prisma";
import { createSession, type SessionRole } from "./session";

const demoAccounts = {
  "admin@employ-mail.nl": {
    id: "admin-1",
    name: "Jasper de Vries",
    role: "admin" as const,
    tenantId: "platform",
    password: process.env.DEMO_ADMIN_PASSWORD ?? "admin-demo-2026",
  },
  "client@northwind.nl": {
    id: "customer-1",
    name: "Northwind B.V.",
    role: "customer" as const,
    tenantId: "northwind",
    password: process.env.DEMO_CUSTOMER_PASSWORD ?? "client-demo-2026",
  },
};

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (process.env.DATABASE_URL) {
    let user;
    try {
      user = await getPrismaClient().user.findUnique({
        where: { email },
        include: { tenant: true },
      });
    } catch {
      redirect("/login?error=invalid-credentials");
    }

    if (user && await compare(password, user.passwordHash) && (user.role === "ADMIN" || user.tenant?.status === "active")) {
      const role: SessionRole = user.role === "ADMIN" ? "admin" : "customer";
      await createSession({
        userId: user.id,
        email: user.email,
        role,
        tenantId: user.tenantId ?? "platform",
        name: user.name,
      });
      redirect(role === "admin" ? "/dashboard/admin" : "/dashboard/customer");
    }

    redirect("/login?error=invalid-credentials");
  }

  if (process.env.NODE_ENV === "production") {
    redirect("/login?error=invalid-credentials");
  }

  const account = demoAccounts[email as keyof typeof demoAccounts];

  if (!account || account.password !== password) {
    redirect("/login?error=invalid-credentials");
  }

  await createSession({
    userId: account.id,
    email,
    role: account.role,
    tenantId: account.tenantId,
    name: account.name,
  });

  redirect(account.role === "admin" ? "/dashboard/admin" : "/dashboard/customer");
}

export function getDemoAccounts() {
  return Object.entries(demoAccounts).map(([email, account]) => ({
    email,
    name: account.name,
    role: account.role as SessionRole,
    tenantId: account.tenantId,
  }));
}
