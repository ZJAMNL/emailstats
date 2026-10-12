"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { refreshSelectionsAction } from "@/app/actions";

const number = new Intl.NumberFormat("nl-NL");

/** Fetches the Copernica selections again, so selections made in Copernica since the last sync show up. */
export function RefreshSelectionsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function refresh() {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshSelectionsAction();
      if (!result.ok) setMessage({ tone: "error", text: result.error });
      else setMessage({ tone: "success", text: result.added ? `${number.format(result.added)} ${result.added === 1 ? "nieuwe selectie" : "nieuwe selecties"} opgehaald.` : "Geen nieuwe selecties; de lijst is bijgewerkt." });
    });
  }

  return (
    <div className="refresh-selections">
      {message ? <span className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</span> : null}
      <button className="button button-secondary" disabled={pending} onClick={refresh} type="button"><RefreshCw className={pending ? "spin" : undefined} size={15} /> {pending ? "Ophalen…" : "Opnieuw ophalen"}</button>
    </div>
  );
}
