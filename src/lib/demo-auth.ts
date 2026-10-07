import { redirect } from "next/navigation";
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
