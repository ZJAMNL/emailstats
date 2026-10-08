import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { Resend } from "resend";
import { getPrismaClient } from "./prisma";

const TOKEN_TTL = "24h";
const TOKEN_PURPOSE = "set-password";

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  return new TextEncoder().encode(secret);
}

// Ties a token to the current password hash, so it stops working once the password changes (one-time use).
function passwordFingerprint(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 22);
}

export async function createPasswordToken(user: { id: string; passwordHash: string }) {
  return new SignJWT({ purpose: TOKEN_PURPOSE, fp: passwordFingerprint(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret());
}

export async function verifyPasswordToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== TOKEN_PURPOSE || !payload.sub || typeof payload.fp !== "string") return null;
    const user = await getPrismaClient().user.findUnique({ where: { id: payload.sub }, include: { tenant: true } });
    if (!user || passwordFingerprint(user.passwordHash) !== payload.fp) return null;
    return user;
  } catch {
    return null;
  }
}

type PasswordMailKind = "invite" | "reset";

export async function sendPasswordMail(user: { id: string; email: string; name: string; passwordHash: string }, kind: PasswordMailKind, appUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const link = `${appUrl}/wachtwoord-instellen?token=${encodeURIComponent(await createPasswordToken(user))}`;
  const from = process.env.EMAIL_FROM ?? "E-mail Statistieken <noreply@enzo.email>";
  const subject = kind === "invite" ? "Je account voor E-mail Statistieken" : "Stel een nieuw wachtwoord in";
  const intro = kind === "invite"
    ? "Er is een account voor je aangemaakt op het E-mail Statistieken-dashboard. Kies via de knop hieronder je wachtwoord om in te loggen."
    : "We hebben een verzoek ontvangen om je wachtwoord opnieuw in te stellen. Kies via de knop hieronder een nieuw wachtwoord. Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.";
  const button = kind === "invite" ? "Wachtwoord instellen" : "Nieuw wachtwoord instellen";

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: [user.email],
    subject,
    text: `Hoi ${user.name},\n\n${intro}\n\n${button}: ${link}\n\nDeze link is 24 uur geldig en werkt één keer.\nInlognaam: ${user.email}\n`,
    html: passwordMailHtml({ name: user.name, email: user.email, intro, button, link }),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

function passwordMailHtml({ name, email, intro, button, link }: { name: string; email: string; intro: string; button: string; link: string }) {
  return `<!doctype html>
<html lang="nl"><body style="margin:0;padding:24px;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#1b2a3a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px">
      <tr><td>
        <p style="margin:0 0 4px;color:#237a63;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">E-mail Statistieken</p>
        <h1 style="margin:0 0 20px;font-size:22px">Hoi ${escapeHtml(name)},</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.55">${escapeHtml(intro)}</p>
        <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#237a63;color:#ffffff;font-weight:bold;text-decoration:none">${escapeHtml(button)}</a></p>
        <p style="margin:0 0 6px;color:#5b6b7c;font-size:13px">Deze link is 24 uur geldig en werkt één keer.</p>
        <p style="margin:0;color:#5b6b7c;font-size:13px">Inlognaam: ${escapeHtml(email)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
