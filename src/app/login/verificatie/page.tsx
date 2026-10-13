import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyMfaAction } from "@/app/mfa-actions";
import { getMfaPending } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificatie | E-mail Statistieken" };

const errorText: Record<string, string> = {
  invalid: "Deze code klopt niet. Gebruik de nieuwste code uit je app, of een ongebruikte herstelcode.",
  locked: "Te veel onjuiste codes. Wacht een kwartier en probeer het opnieuw.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await getMfaPending())) redirect("/login?error=expired");
  const { error } = await searchParams;

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-panel auth-panel-large">
        <div className="auth-header"><span className="brand-mark">E</span><div><p className="eyebrow">Tweestapsverificatie</p><h1>Voer je code in</h1></div></div>
        <p className="auth-intro">Open je authenticator-app en voer de 6-cijferige code in voor E-mail Statistieken.</p>
        <form action={verifyMfaAction} className="auth-form">
          <label>Code uit de app<input autoComplete="one-time-code" autoFocus inputMode="numeric" maxLength={7} name="code" pattern="[0-9 ]{6,7}" placeholder="123 456" required /></label>
          {error && errorText[error] ? <p className="form-error" role="alert">{errorText[error]}</p> : null}
          <button className="button button-primary" type="submit">Inloggen</button>
        </form>
        <details className="mfa-recovery">
          <summary>Telefoon kwijt? Gebruik een herstelcode</summary>
          <form action={verifyMfaAction} className="auth-form">
            <label>Herstelcode<input autoComplete="off" name="code" placeholder="ABCD-EFGH" required /></label>
            <p className="mfa-hint">Elke herstelcode werkt één keer. Geen codes meer? Vraag je beheerder om de tweestapsverificatie te resetten.</p>
            <button className="button button-secondary" type="submit">Inloggen met herstelcode</button>
          </form>
        </details>
        <Link className="auth-link mfa-back" href="/login">Terug naar inloggen</Link>
      </section>
    </main>
  );
}
