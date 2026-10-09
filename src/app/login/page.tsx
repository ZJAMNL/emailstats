import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions";
import { dashboardPath, getSession } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const session = await getSession();
  if (session) {
    redirect(dashboardPath(session.role));
  }

  const { error, notice } = await searchParams;

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-panel auth-panel-large">
          <div className="auth-header"><span className="brand-mark">E</span><div><p className="eyebrow">E-mail Statistieken</p><h1>Welkom terug</h1></div></div>
        <p className="auth-intro">Log in op je managementomgeving en controleer je e-mailstatistieken.</p>
        {notice === "password-set" ? <p className="form-success auth-message" role="status">Je wachtwoord is opgeslagen. Je kunt nu inloggen.</p> : null}
        <form action={signInAction} className="auth-form">
          <label>Emailadres<input name="email" type="email" placeholder="naam@bedrijf.nl" autoComplete="email" required /></label>
          <label>Wachtwoord<input name="password" type="password" placeholder="Voer wachtwoord in" autoComplete="current-password" required /></label>
          {error ? <p className="form-error">De combinatie van e-mailadres en wachtwoord is onjuist.</p> : null}
          <button type="submit" className="button button-primary">Inloggen</button>
          <Link className="auth-link" href="/wachtwoord-vergeten">Wachtwoord vergeten?</Link>
        </form>
      </section>
    </main>
  );
}
