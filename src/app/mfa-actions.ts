"use server";

import { redirect } from "next/navigation";
import { decryptSecret, encryptSecret } from "@/lib/copernica-crypto";
import { getPrismaClient } from "@/lib/prisma";
import { clientIpHash, mfaLocked, recordFailure, recordSecurityEvent } from "@/lib/security/events";
import { consumeRecoveryCode, generateRecoveryCodes } from "@/lib/security/recovery";
import { verifyTotp } from "@/lib/security/totp";
import { createSession, dashboardPath, endMfa, getMfaPending, type SessionRole } from "@/lib/session";

type PendingUser = NonNullable<Awaited<ReturnType<typeof loadPendingUser>>>;

async function loadPendingUser() {
  const pending = await getMfaPending();
  if (!pending) return null;
  const user = await getPrismaClient().user.findUnique({ where: { id: pending.userId }, include: { tenant: { select: { status: true } } } });
  if (!user || (user.role === "CUSTOMER" && user.tenant?.status !== "active")) return null;
  return { ...user, setupSecret: pending.setupSecret };
}

/** Both factors are right: start the real session. */
async function completeSignIn(user: PendingUser, ipHash: string) {
  const role: SessionRole = user.role === "SUPERADMIN" ? "superadmin" : user.role === "ADMIN" ? "admin" : "customer";
  await endMfa();
  await getPrismaClient().user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordSecurityEvent("login_success", { userId: user.id, email: user.email, ipHash });
  await createSession({ userId: user.id, email: user.email, role, tenantId: user.tenantId ?? "platform", name: user.name });
  return dashboardPath(role);
}

/** Second step of signing in: a code from the authenticator app, or one of the recovery codes. */
export async function verifyMfaAction(formData: FormData) {
  const user = await loadPendingUser();
  if (!user?.totpSecret || !user.totpEnabledAt) redirect("/login?error=expired");
  const ipHash = await clientIpHash();
  if (await mfaLocked(user.email)) redirect("/login/verificatie?error=locked");

  const code = String(formData.get("code") ?? "").trim();
  const prisma = getPrismaClient();
  let accepted = false;
  if (/^\d[\d\s]*$/.test(code)) {
    const step = verifyTotp(decryptSecret(user.totpSecret), code, user.totpLastStep);
    // Only one request can claim a step: a code used twice at the same moment is refused the second time.
    if (step !== null) accepted = (await prisma.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } })).count === 1;
  } else {
    const remaining = consumeRecoveryCode(user.recoveryCodes, code);
    if (remaining) {
      accepted = (await prisma.user.updateMany({ where: { id: user.id, recoveryCodes: { equals: user.recoveryCodes } }, data: { recoveryCodes: remaining } })).count === 1;
      if (accepted) await recordSecurityEvent("login_success", { userId: user.id, email: user.email, ipHash, detail: `herstelcode gebruikt, nog ${remaining.length} over` });
    }
  }

  if (!accepted) {
    await recordFailure("mfa_failed", { userId: user.id, email: user.email, ipHash });
    redirect("/login/verificatie?error=invalid");
  }
  redirect(await completeSignIn(user, ipHash));
}

export type MfaSetupState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; codes: string[] };

/**
 * First sign-in with 2FA: the code proves the app was set up correctly; then the recovery codes are shown once.
 * No cookies change here (that would reload the page and hide the codes); the session starts in finishMfaSetupAction.
 */
export async function confirmMfaSetupAction(_previous: MfaSetupState, formData: FormData): Promise<MfaSetupState> {
  const user = await loadPendingUser();
  if (!user?.setupSecret || user.totpEnabledAt) return { status: "error", message: "Je inlogsessie is verlopen. Log opnieuw in." };
  const ipHash = await clientIpHash();
  if (await mfaLocked(user.email)) return { status: "error", message: "Te veel onjuiste codes. Wacht een kwartier en log opnieuw in." };

  const step = verifyTotp(user.setupSecret, String(formData.get("code") ?? ""), null);
  if (step === null) {
    await recordFailure("mfa_failed", { userId: user.id, email: user.email, ipHash });
    return { status: "error", message: "Deze code klopt niet. Controleer of de tijd op je telefoon goed staat en probeer de nieuwste code." };
  }

  const { codes, hashes } = generateRecoveryCodes();
  // Only when 2FA is still off, so two tabs cannot each set up their own app.
  const saved = await getPrismaClient().user.updateMany({
    where: { id: user.id, totpEnabledAt: null },
    data: { totpSecret: encryptSecret(user.setupSecret), totpEnabledAt: new Date(), totpLastStep: step, recoveryCodes: hashes },
  });
  if (saved.count !== 1) return { status: "error", message: "Tweestapsverificatie is al ingesteld. Log opnieuw in." };
  await recordSecurityEvent("mfa_enabled", { userId: user.id, email: user.email, ipHash });
  return { status: "done", codes };
}

/** After the recovery codes were saved: sign in, but only in the sign-in attempt that set up this very app. */
export async function finishMfaSetupAction() {
  const user = await loadPendingUser();
  if (!user?.setupSecret || !user.totpSecret || !user.totpEnabledAt || decryptSecret(user.totpSecret) !== user.setupSecret) redirect("/login?error=expired");
  redirect(await completeSignIn(user, await clientIpHash()));
}
