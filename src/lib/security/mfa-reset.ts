import { getPrismaClient } from "../prisma";
import { recordSecurityEvent } from "./events";

/**
 * Turns 2FA off for an account that lost its phone and recovery codes, and signs out its sessions.
 * At the next sign-in the user sets up an authenticator app again (2FA stays required).
 */
export async function resetTwoFactor(userId: string, by: { userId: string; name: string }) {
  const user = await getPrismaClient().user.update({
    where: { id: userId },
    data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], sessionVersion: { increment: 1 } },
    select: { email: true },
  });
  await recordSecurityEvent("mfa_reset", { userId, email: user.email, detail: `door ${by.name} (${by.userId})` });
}
