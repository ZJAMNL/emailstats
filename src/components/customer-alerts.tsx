import { BellRing, CircleCheck } from "lucide-react";
import { CUSTOMER_ALERT_DAYS, type CustomerAlert } from "@/lib/alerts/customer";

export function CustomerAlerts({ alerts }: { alerts: CustomerAlert[] }) {
  return (
    <section className="panel table-panel customer-alerts" aria-labelledby="customer-alerts-title">
      <div className="panel-heading"><div><p className="eyebrow">Signalering</p><h2 id="customer-alerts-title">Alerts</h2></div><span className="tab">Afgelopen {CUSTOMER_ALERT_DAYS} dagen</span></div>
      {alerts.length ? (
        <ul className="customer-alert-list">
          {alerts.map((alert) => (
            <li className={`customer-alert is-${alert.severity}`} key={alert.id}>
              <div className="customer-alert-head">
                <span className={`alerts-severity is-${alert.severity}`}>{alert.severity === "critical" ? "Kritiek" : "Waarschuwing"}</span>
                <span className="customer-alert-label">{alert.label}</span>
                <time dateTime={alert.triggeredAt.toISOString()}>{alert.triggeredAt.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" })}</time>
              </div>
              <strong>{alert.title}</strong>
              <p>{alert.detail}</p>
              <details>
                <summary>Wat kun je doen?</summary>
                <p>{alert.advice}</p>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="customer-alerts-empty"><CircleCheck size={17} /> Geen alerts: je database en campagnes bleven binnen de marges.</p>
      )}
      <p className="customer-alerts-note"><BellRing size={14} /> We controleren elke ochtend je database en campagnes. Vragen over een alert? Neem contact op met je beheerder.</p>
    </section>
  );
}
