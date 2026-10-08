import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions";
import { getSession } from "@/lib/session";
import { getDemoAccounts } from "@/lib/demo-auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const session = await getSession();
  if (session) {
    redirect(session.role === "admin" ? "/dashboard/admin" : "/dashboard/customer");
  }

  const { error, notice } = await searchParams;
  const accounts = getDemoAccounts();

  return (
    <main className="auth-page">
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
      <aside className="auth-panel auth-panel-small">
        <p className="eyebrow">Demo-accounts</p>
        <h2>Ontdek beide rollen</h2>
        {accounts.map((account) => (
          <div key={account.email} className="demo-account"><div><strong>{account.name}</strong><span>{account.role === "admin" ? "Beheerder" : "Klant"}</span></div><code>{account.email}</code></div>
        ))}
        <p className="demo-note">Wachtwoorden worden alleen lokaal als demo-credentials gebruikt. In productie wordt een veilige identity-provider of passwordless login gebruikt.</p>
      </aside>
    </main>
  );
}
