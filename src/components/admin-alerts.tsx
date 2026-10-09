"use client";

import { useState, useTransition } from "react";
import { BellRing, Plus, Send, X } from "lucide-react";
import { saveAlertSettingsAction, sendTestAlertAction } from "@/app/alert-actions";
import { alertGroups, alertRules } from "@/lib/alerts/rules";
import type { AlertSettingsValue } from "@/lib/alerts/settings";

export type AlertEventRow = { id: string; ruleLabel: string; severity: string; title: string; triggeredAt: string; sentAt: string | null };

const dateTime = (value: string) => new Date(value).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });

export function AdminAlerts({ tenantId, initial, events, lastDigestAt, mailConfigured }: { tenantId: string; initial: AlertSettingsValue; events: AlertEventRow[]; lastDigestAt: string | null; mailConfigured: boolean }) {
  const [settings, setSettings] = useState(initial);
  const [newRecipient, setNewRecipient] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [, startTransition] = useTransition();

  function update(change: (value: AlertSettingsValue) => AlertSettingsValue) {
    setSettings(change);
    setMessage(null);
  }

  function addRecipient() {
    const address = newRecipient.trim().toLowerCase();
    if (!address) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setMessage({ tone: "error", text: `‘${newRecipient.trim()}’ is geen geldig e-mailadres.` });
      return;
    }
    update((value) => ({ ...value, recipients: value.recipients.includes(address) ? value.recipients : [...value.recipients, address] }));
    setNewRecipient("");
  }

  function setRule(key: string, change: Partial<{ enabled: boolean; params: Record<string, number> }>) {
    update((value) => ({ ...value, rules: { ...value.rules, [key]: { ...value.rules[key], ...change, params: { ...value.rules[key].params, ...change.params } } } }));
  }

  function save() {
    setBusy("save");
    startTransition(async () => {
      const result = await saveAlertSettingsAction(tenantId, settings);
      setBusy(null);
      setMessage(result.ok ? { tone: "success", text: settings.enabled ? "Opgeslagen. De eerstvolgende controle is vannacht om 06:00." : "Opgeslagen. Alerts staan uit voor deze klant." } : { tone: "error", text: result.error });
    });
  }

  function test() {
    setBusy("test");
    startTransition(async () => {
      const result = await sendTestAlertAction(tenantId, settings);
      setBusy(null);
      setMessage(result.ok
        ? { tone: "success", text: `Testmail verstuurd naar ${settings.recipients.join(", ")} (${result.data.alerts ? `${result.data.alerts} ${result.data.alerts === 1 ? "alert gaat" : "alerts gaan"} nu af` : "er gaan nu geen alerts af"}).` }
        : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="admin-alerts">
      <div className="alerts-master">
        <label className="alerts-switch">
          <input checked={settings.enabled} onChange={(event) => update((value) => ({ ...value, enabled: event.target.checked }))} type="checkbox" />
          <span><strong>Alerts voor deze klant</strong><small>Elke ochtend na de sync één samenvatting met wat opviel. Dezelfde alert komt niet dagelijks terug.</small></span>
        </label>
        <p className="rfm-hint">{lastDigestAt ? `Laatste samenvatting verstuurd op ${dateTime(lastDigestAt)}.` : "Er is nog geen samenvatting verstuurd."}</p>
      </div>
      {mailConfigured ? null : <p className="form-error">E-mail versturen is niet ingesteld (RESEND_API_KEY ontbreekt): alerts worden wel vastgelegd, maar niet gemaild.</p>}

      <div className="alerts-recipients">
        <p className="eyebrow">Ontvangers</p>
        <div className="alerts-recipient-list">
          {settings.recipients.map((address) => (
            <span className="alerts-recipient" key={address}>{address}<button aria-label={`${address} verwijderen`} onClick={() => update((value) => ({ ...value, recipients: value.recipients.filter((item) => item !== address) }))} type="button"><X size={13} /></button></span>
          ))}
          {settings.recipients.length ? null : <span className="rfm-hint">Nog geen ontvangers.</span>}
        </div>
        <div className="alerts-recipient-add customer-form">
          <input aria-label="E-mailadres toevoegen" onChange={(event) => setNewRecipient(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addRecipient(); } }} placeholder="naam@bedrijf.nl" type="email" value={newRecipient} />
          <button className="button button-secondary" onClick={addRecipient} type="button"><Plus size={15} /> Toevoegen</button>
        </div>
      </div>

      <div className="alerts-groups">
        {alertGroups.map((group) => (
          <fieldset className="alerts-group" key={group.key}>
            <legend>{group.label}</legend>
            {alertRules.filter((rule) => rule.group === group.key).map((rule) => {
              const current = settings.rules[rule.key];
              return (
                <div className={`alerts-rule${current.enabled ? "" : " is-off"}`} key={rule.key}>
                  <label className="alerts-rule-head">
                    <input checked={current.enabled} onChange={(event) => setRule(rule.key, { enabled: event.target.checked })} type="checkbox" />
                    <strong>{rule.label}</strong>
                    <span className={`alerts-severity is-${rule.severity}`}>{rule.severity === "critical" ? "Kritiek" : "Waarschuwing"}</span>
                  </label>
                  <p>{rule.description}</p>
                  {rule.thresholds.length ? (
                    <div className="alerts-thresholds">
                      {rule.thresholds.map((field) => (
                        <label key={field.key}>{field.label}
                          <span><input disabled={!current.enabled} max={field.max} min={field.min} onChange={(event) => setRule(rule.key, { params: { [field.key]: Number(event.target.value) } })} step={field.step} type="number" value={current.params[field.key]} />{field.unit}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>

      {message ? <p className={message.tone === "success" ? "form-success" : "form-error"} role={message.tone === "success" ? "status" : "alert"}>{message.text}</p> : null}
      <div className="alerts-actions">
        <button className="button button-primary" disabled={busy !== null} onClick={save} type="button"><BellRing size={15} /> {busy === "save" ? "Opslaan…" : "Opslaan"}</button>
        <button className="button button-secondary" disabled={busy !== null || !settings.recipients.length || !mailConfigured} onClick={test} type="button"><Send size={15} /> {busy === "test" ? "Versturen…" : "Testmail versturen"}</button>
      </div>

      <div className="alerts-log">
        <p className="eyebrow">Recente alerts</p>
        {events.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Moment</th><th>Alert</th><th>Wat</th><th>Gemaild</th></tr></thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{dateTime(event.triggeredAt)}</td>
                    <td><span className={`alerts-severity is-${event.severity}`}>{event.ruleLabel}</span></td>
                    <td>{event.title}</td>
                    <td>{event.sentAt ? dateTime(event.sentAt) : "Nog niet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty-state">Nog geen alerts voor deze klant.</p>}
      </div>
    </div>
  );
}
