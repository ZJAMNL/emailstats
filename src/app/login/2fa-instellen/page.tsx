import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { MfaSetupForm } from "@/components/mfa-setup-form";
import { getPrismaClient } from "@/lib/prisma";
import { formatSecret, otpauthUrl } from "@/lib/security/totp";
import { getMfaPending } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tweestapsverificatie instellen | E-mail Statistieken" };

export default async function MfaSetupPage() {
  const pending = await getMfaPending();
  if (!pending?.setupSecret) redirect("/login?error=expired");
  const user = await getPrismaClient().user.findUnique({ where: { id: pending.userId }, select: { email: true, totpEnabledAt: true } });
  if (!user) redirect("/login?error=expired");
  // Already set up (for instance after a reload): sign in with a code from the app.
  if (user.totpEnabledAt) redirect("/login/verificatie");

  const svg = await QRCode.toString(otpauthUrl(pending.setupSecret, user.email), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1626", light: "#ffffff" } });

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-panel auth-panel-large">
        <div className="auth-header"><span className="brand-mark">E</span><div><p className="eyebrow">Tweestapsverificatie</p><h1>Beveilig je account</h1></div></div>
        <p className="auth-intro">Voor E-mail Statistieken is tweestapsverificatie verplicht. Naast je wachtwoord log je voortaan in met een code uit een authenticator-app op je telefoon.</p>
        <MfaSetupForm email={user.email} qrDataUrl={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} secret={formatSecret(pending.setupSecret)} />
      </section>
    </main>
  );
}
