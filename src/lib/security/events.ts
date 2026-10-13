import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getPrismaClient } from "../prisma";

export type SecurityEventType =
  | "login_failed"
  | "login_success"
  | "mfa_failed"
  | "locked"
  | "password_reset_requested"
  | "password_set"
  | "mfa_enabled"
  | "mfa_reset";

const minute = 60 * 1000;
/** Failed passwords per account, failed passwords per IP, failed 2FA codes per account, reset mails per account. */
export const limits = {
  loginPerAccount: { max: 5, window: 15 * minute },
  loginPerIp: { max: 20, window: 15 * minute },
  mfaPerAccount: { max: 5, window: 15 * minute },
  resetPerAccount: { max: 3, window: 60 * minute },
} as const;

/** A hash of the client IP (Vercel sets x-forwarded-for), salted with the session secret so it cannot be reversed by lookup. */
export async function clientIpHash() {
  const headerStore = await headers();
  const ip = headerStore.get("x-real-ip") ?? headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

export async function recordSecurityEvent(type: SecurityEventType, data: { userId?: string | null; email?: string | null; ipHash?: string | null; detail?: string | null } = {}) {
  try {
    await getPrismaClient().securityEvent.create({ data: { type, userId: data.userId ?? null, email: data.email?.toLowerCase() ?? null, ipHash: data.ipHash ?? null, detail: data.detail?.slice(0, 500) ?? null } });
  } catch {
    // Logging must never block signing in.
  }
}

function countSince(type: SecurityEventType, where: { email?: string; ipHash?: string }, window: number) {
  return getPrismaClient().securityEvent.count({ where: { type, ...where, createdAt: { gte: new Date(Date.now() - window) } } });
}

/** Too many wrong passwords for this account or from this address: wait before trying again. */
export async function loginLocked(email: string, ipHash: string) {
  const [perAccount, perIp] = await Promise.all([
    countSince("login_failed", { email }, limits.loginPerAccount.window),
    countSince("login_failed", { ipHash }, limits.loginPerIp.window),
  ]);
  return perAccount >= limits.loginPerAccount.max || perIp >= limits.loginPerIp.max;
}

export async function mfaLocked(email: string) {
  return (await countSince("mfa_failed", { email }, limits.mfaPerAccount.window)) >= limits.mfaPerAccount.max;
}

export async function resetLimited(email: string) {
  return (await countSince("password_reset_requested", { email }, limits.resetPerAccount.window)) >= limits.resetPerAccount.max;
}

/** Records a failure, and a `locked` event when this failure reaches the limit (for the weekly report). */
export async function recordFailure(type: "login_failed" | "mfa_failed", data: { userId?: string | null; email: string; ipHash: string }) {
  await recordSecurityEvent(type, data);
  const limit = type === "login_failed" ? limits.loginPerAccount : limits.mfaPerAccount;
  if ((await countSince(type, { email: data.email }, limit.window)) === limit.max) await recordSecurityEvent("locked", { ...data, detail: type });
}
