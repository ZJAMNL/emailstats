import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { getPrismaClient } from "./prisma";
import { clientIpHash, loginLocked, recordFailure } from "./security/events";
import { generateTotpSecret } from "./security/totp";
import { createSession, dashboardPath, startMfa, type SessionRole } from "./session";

/** Compared against when the address is unknown, so a wrong address takes as long as a wrong password. */
const UNKNOWN_USER_HASH = "$2b$12$4M6sRtbreMOPtFJ4O76d9.W43WY./BcKKZsCpgfXfA1u.Zs6BtDCa";

const demoAccounts = {
  "admin@employ-mail.nl": {
    id: "admin-1",
    name: "Jasper de Vries",
    role: "superadmin" as const,
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
    const ipHash = await clientIpHash();
    let user;
    let locked = false;
    try {
      locked = await loginLocked(email, ipHash);
      user = locked ? null : await getPrismaClient().user.findUnique({
        where: { email },
        include: { tenant: true },
      });
    } catch {
      redirect("/login?error=invalid-credentials");
    }
    if (locked) redirect("/login?error=locked");

    const passwordOk = await compare(password, user?.passwordHash ?? UNKNOWN_USER_HASH);
    if (!user || !passwordOk || (user.role === "CUSTOMER" && user.tenant?.status !== "active")) {
      await recordFailure("login_failed", { userId: user?.id, email, ipHash });
      redirect("/login?error=invalid-credentials");
    }

    // The password is right; the session only starts after the authenticator code (2FA is required for everyone).
    if (user.totpEnabledAt && user.totpSecret) {
      await startMfa({ userId: user.id });
      redirect("/login/verificatie");
    }
    await startMfa({ userId: user.id, setupSecret: generateTotpSecret() });
    redirect("/login/2fa-instellen");
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

  redirect(dashboardPath(account.role));
}

export function getDemoAccounts() {
  return Object.entries(demoAccounts).map(([email, account]) => ({
    email,
    name: account.name,
    role: account.role as SessionRole,
    tenantId: account.tenantId,
  }));
}
