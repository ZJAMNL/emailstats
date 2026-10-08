import Link from "next/link";
import { setPasswordAction } from "@/app/actions";
import { verifyPasswordToken } from "@/lib/password-reset";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wachtwoord instellen | E-mail Statistieken" };

const errorText: Record<string, string> = {
  "too-short": "Kies een wachtwoord van minimaal 12 tekens.",
  mismatch: "De twee wachtwoorden zijn niet gelijk.",
};

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const user = token && process.env.DATABASE_URL ? await verifyPasswordToken(token) : null;

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-panel auth-panel-large">
        <div className="auth-header"><span className="brand-mark">E</span><div><p className="eyebrow">E-mail Statistieken</p><h1>Wachtwoord instellen</h1></div></div>
        {user && token ? <>
          <p className="auth-intro">Kies een wachtwoord voor <strong>{user.email}</strong>. Gebruik minimaal 12 tekens.</p>
          <form action={setPasswordAction} className="auth-form">
            <input name="token" type="hidden" value={token} />
            <label>Nieuw wachtwoord<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
            <label>Herhaal wachtwoord<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></label>
            {error && errorText[error] ? <p className="form-error" role="alert">{errorText[error]}</p> : null}
            <button type="submit" className="button button-primary">Wachtwoord opslaan</button>
          </form>
        </> : <>
          <p className="form-error auth-message" role="alert">Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan.</p>
          <Link className="button button-primary auth-back" href="/wachtwoord-vergeten">Nieuwe link aanvragen</Link>
        </>}
      </section>
    </main>
  );
}
