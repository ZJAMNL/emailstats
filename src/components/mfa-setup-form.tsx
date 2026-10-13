"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { confirmMfaSetupAction, finishMfaSetupAction, type MfaSetupState } from "@/app/mfa-actions";

/** Scan, confirm with a code, then save the recovery codes before going on. */
export function MfaSetupForm({ email, qrDataUrl, secret }: { email: string; qrDataUrl: string; secret: string }) {
  const [state, action, pending] = useActionState<MfaSetupState, FormData>(confirmMfaSetupAction, { status: "idle" });
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  if (state.status === "done") {
    const text = state.codes.join("\n");
    return (
      <div className="mfa-setup">
        <p className="form-success" role="status">Tweestapsverificatie staat aan.</p>
        <h2>Bewaar je herstelcodes</h2>
        <p className="mfa-hint">Ben je je telefoon kwijt, dan log je in met een van deze codes. Elke code werkt één keer. Bewaar ze op een veilige plek, bijvoorbeeld in je wachtwoordmanager. Ze worden niet opnieuw getoond.</p>
        <ol className="mfa-codes">{state.codes.map((code) => <li key={code}><code>{code}</code></li>)}</ol>
        <div className="mfa-actions">
          <button className="button button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }} type="button">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Gekopieerd" : "Kopieer codes"}</button>
          <a className="button button-secondary" download="herstelcodes-email-statistieken.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Herstelcodes E-mail Statistieken (${email})\n\n${text}\n`)}`}>Download als bestand</a>
        </div>
        <label className="mfa-confirm"><input checked={saved} onChange={(event) => setSaved(event.target.checked)} type="checkbox" /> Ik heb mijn herstelcodes bewaard</label>
        <form action={finishMfaSetupAction}><button className="button button-primary" disabled={!saved} type="submit">Naar het dashboard</button></form>
      </div>
    );
  }

  return (
    <div className="mfa-setup">
      <ol className="mfa-steps">
        <li><strong>Installeer een authenticator-app</strong>, bijvoorbeeld Google Authenticator, Microsoft Authenticator of de app van je wachtwoordmanager.</li>
        <li>
          <strong>Scan deze QR-code</strong> met de app.
          <div className="mfa-qr"><Image alt="QR-code voor je authenticator-app" height={176} src={qrDataUrl} unoptimized width={176} /></div>
          <details className="mfa-manual"><summary>Kun je niet scannen? Voer de sleutel in</summary><p>Account: {email}</p><code>{secret}</code></details>
        </li>
        <li><strong>Voer de code uit de app in</strong> om te bevestigen.</li>
      </ol>
      <form action={action} className="auth-form">
        <label>Code uit de app<input autoComplete="one-time-code" inputMode="numeric" maxLength={7} name="code" pattern="[0-9 ]{6,7}" placeholder="123 456" required /></label>
        {state.status === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
        <button className="button button-primary" disabled={pending} type="submit">{pending ? "Controleren…" : "Bevestigen en inloggen"}</button>
      </form>
    </div>
  );
}
