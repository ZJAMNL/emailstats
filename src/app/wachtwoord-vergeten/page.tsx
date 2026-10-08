import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions";

export const metadata = { title: "Wachtwoord vergeten | E-mail Statistieken" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ verstuurd?: string }> }) {
  const { verstuurd } = await searchParams;

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-panel auth-panel-large">
        <div className="auth-header"><span className="brand-mark">E</span><div><p className="eyebrow">E-mail Statistieken</p><h1>Wachtwoord vergeten</h1></div></div>
        {verstuurd ? <>
          <p className="form-success auth-message" role="status">Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een e-mail met een link om een nieuw wachtwoord in te stellen. Kijk ook in je spamfolder.</p>
          <Link className="button button-secondary auth-back" href="/login">Terug naar inloggen</Link>
        </> : <>
          <p className="auth-intro">Vul het e-mailadres van je account in. Je ontvangt een link om een nieuw wachtwoord in te stellen.</p>
          <form action={requestPasswordResetAction} className="auth-form">
            <label>E-mailadres<input name="email" type="email" placeholder="naam@bedrijf.nl" autoComplete="email" required /></label>
            <button type="submit" className="button button-primary">Link versturen</button>
            <Link className="auth-link" href="/login">Terug naar inloggen</Link>
          </form>
        </>}
      </section>
    </main>
  );
}
