import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getPrismaClient } from "./prisma";

export type SessionRole = "superadmin" | "admin" | "customer";

export type Session = {
  userId: string;
  email: string;
  role: SessionRole;
  tenantId: string;
  name: string;
  /** The user's sessionVersion when signing in; a higher version in the database ends this session. */
  sv?: number;
  impersonator?: {
    userId: string;
    email: string;
    name: string;
    role?: SessionRole;
  };
};

const SESSION_COOKIE = "email-stats-session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
/** Between the password and the authenticator code: who is signing in, valid for ten minutes. */
const MFA_COOKIE = "email-stats-mfa";
const MFA_TTL_SECONDS = 60 * 10;

function getSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session) {
  const cookieStore = await cookies();
  const sv = process.env.DATABASE_URL
    ? (await getPrismaClient().user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } }))?.sessionVersion ?? 0
    : 0;
  const token = await new SignJWT({ ...session, sv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = await jwtVerify(token, getSecret());
    return payload.payload as Session;
  } catch {
      // Avoid mutating cookies when the session token is invalid
    return null;
  }
}

/**
 * Whether the account behind a session may still use it: it exists, its sessions were not revoked
 * (new password, 2FA reset) and, for a customer, the customer account is still active.
 */
const sessionIsCurrent = cache(async (userId: string, sv: number | undefined, role: SessionRole) => {
  if (!process.env.DATABASE_URL) return true;
  const user = await getPrismaClient().user.findUnique({ where: { id: userId }, select: { sessionVersion: true, role: true, tenant: { select: { status: true } } } });
  if (!user || sv !== user.sessionVersion) return false;
  return role !== "customer" || (user.role === "CUSTOMER" && user.tenant?.status === "active");
});

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }
  // The cookie is still there, so /login would send it straight back; /uitloggen removes it first.
  if (!(await sessionIsCurrent(session.userId, session.sv, session.role))) redirect("/uitloggen");

  return session;
}

type MfaPending = { userId: string; setupSecret?: string };

/** After a correct password: remember who is signing in until the authenticator code is entered (or set up). */
export async function startMfa(pending: MfaPending) {
  const token = await new SignJWT({ purpose: "mfa", ...(pending.setupSecret ? { setupSecret: pending.setupSecret } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(pending.userId)
    .setIssuedAt()
    .setExpirationTime(`${MFA_TTL_SECONDS}s`)
    .sign(getSecret());
  (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/login", maxAge: MFA_TTL_SECONDS });
}

export async function getMfaPending(): Promise<MfaPending | null> {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== "mfa" || !payload.sub) return null;
    return { userId: payload.sub, setupSecret: typeof payload.setupSecret === "string" ? payload.setupSecret : undefined };
  } catch {
    return null;
  }
}

export async function endMfa() {
  (await cookies()).delete({ name: MFA_COOKIE, path: "/login" });
}

export async function requireRole(role: SessionRole) {
  const session = await requireSession();

  if (session.role !== role) {
    redirect("/login");
  }

  return session;
}

export function isAdminRole(role: SessionRole) {
  return role === "admin" || role === "superadmin";
}

export function dashboardPath(role: SessionRole) {
  return isAdminRole(role) ? "/dashboard/admin" : "/dashboard/customer";
}
