"use client";

import { useActionState, useRef } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { requestDemoAction, type DemoRequestState } from "@/app/actions";

const initialState: DemoRequestState = { status: "idle" };

export function DemoRequestForm() {
  const [state, formAction, isPending] = useActionState(requestDemoAction, initialState);
  const startedAtRef = useRef<HTMLInputElement>(null);

  if (state.status === "sent") {
    return (
      <div className="demo-success" role="status">
        <CheckCircle2 size={28} />
        <h3>Bedankt voor je aanvraag!</h3>
        <p>We nemen binnen twee werkdagen contact met je op om een demo in te plannen. Je ontvangt ook een bevestiging per e-mail.</p>
      </div>
    );
  }

  const error = (field: string) => state.fieldErrors?.[field];
  const value = (field: string) => state.values?.[field] ?? "";

  return (
    <form action={formAction} className="demo-form" noValidate onFocusCapture={() => {
      if (startedAtRef.current && !startedAtRef.current.value) startedAtRef.current.value = String(Date.now());
    }}>
      <input defaultValue={value("startedAt")} name="startedAt" ref={startedAtRef} type="hidden" />
      <label className="demo-honeypot" aria-hidden="true">Website<input autoComplete="off" name="website" tabIndex={-1} /></label>
      <label>Naam *<input aria-invalid={Boolean(error("name"))} autoComplete="name" maxLength={120} defaultValue={value("name")} name="name" required />{error("name") ? <small className="field-error">{error("name")}</small> : null}</label>
      <label>Bedrijfsnaam *<input aria-invalid={Boolean(error("company"))} autoComplete="organization" maxLength={160} defaultValue={value("company")} name="company" required />{error("company") ? <small className="field-error">{error("company")}</small> : null}</label>
      <label>Zakelijk e-mailadres *<input aria-invalid={Boolean(error("email"))} autoComplete="email" maxLength={254} defaultValue={value("email")} name="email" required type="email" />{error("email") ? <small className="field-error">{error("email")}</small> : null}</label>
      <label>Telefoonnummer<input autoComplete="tel" maxLength={40} defaultValue={value("phone")} name="phone" type="tel" /></label>
      <label className="demo-form-wide">Werk je al met Copernica?
        <select defaultValue={value("usesCopernica")} name="usesCopernica">
          <option value="">Maak een keuze</option>
          <option value="ja">Ja</option>
          <option value="nee">Nee</option>
          <option value="onbekend">Weet ik niet</option>
        </select>
      </label>
      <label className="demo-form-wide">Waar ben je benieuwd naar?<textarea defaultValue={value("message")} maxLength={2000} name="message" placeholder="Bijvoorbeeld: welke selecties wil je volgen, of hoeveel merken beheer je?" rows={4} /></label>
      {state.status === "error" && state.message ? <p className="form-error demo-form-wide" role="alert">{state.message}</p> : null}
      <div className="demo-form-footer demo-form-wide">
        <small>We gebruiken je gegevens alleen om contact met je op te nemen over de demo.</small>
        <button className="button button-primary" disabled={isPending} type="submit"><Send size={16} /> {isPending ? "Versturen…" : "Demo aanvragen"}</button>
      </div>
    </form>
  );
}
