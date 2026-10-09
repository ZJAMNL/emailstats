import { Resend } from "resend";
import type { AlertSeverity } from "./rules";

export type DigestAlert = { severity: AlertSeverity; label: string; title: string; detail: string; advice: string };

export function canSendAlertMail() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function digestSubject(tenantName: string, count: number, test = false) {
  return `${test ? "(test) " : ""}${count} ${count === 1 ? "alert" : "alerts"} voor ${tenantName}`;
}

/** One e-mail per customer with every new alert, critical ones first. */
export async function sendAlertDigest({ tenantName, recipients, alerts, appUrl, test = false }: { tenantName: string; recipients: string[]; alerts: DigestAlert[]; appUrl: string; test?: boolean }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  const sorted = [...alerts].sort((left, right) => Number(right.severity === "critical") - Number(left.severity === "critical"));
  const from = process.env.EMAIL_FROM ?? "E-mail Statistieken <noreply@enzo.email>";

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: recipients,
    subject: digestSubject(tenantName, alerts.length, test),
    text: [
      test ? "Dit is een testmail met de alerts die nu zouden afgaan.\n" : "",
      `Alerts voor ${tenantName}:`,
      ...sorted.map((alert) => `\n[${alert.severity === "critical" ? "Kritiek" : "Waarschuwing"}] ${alert.title}\n${alert.detail}\nAdvies: ${alert.advice}`),
      `\nBekijk het dashboard: ${appUrl}/login`,
    ].join("\n"),
    html: digestHtml({ tenantName, alerts: sorted, appUrl, test }),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

function digestHtml({ tenantName, alerts, appUrl, test }: { tenantName: string; alerts: DigestAlert[]; appUrl: string; test: boolean }) {
  const items = alerts.map((alert) => {
    const critical = alert.severity === "critical";
    return `<tr><td style="padding:0 0 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid ${critical ? "#c0392b" : "#c08a3e"};background:#f8fafc;border-radius:8px">
        <tr><td style="padding:14px 16px">
          <p style="margin:0 0 4px;color:${critical ? "#c0392b" : "#94702c"};font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${critical ? "Kritiek" : "Waarschuwing"} · ${escapeHtml(alert.label)}</p>
          <p style="margin:0 0 6px;font-size:15px;font-weight:bold">${escapeHtml(alert.title)}</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#33465a">${escapeHtml(alert.detail)}</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#5b6b7c"><strong>Advies:</strong> ${escapeHtml(alert.advice)}</p>
        </td></tr>
      </table>
    </td></tr>`;
  }).join("");

  return `<!doctype html>
<html lang="nl"><body style="margin:0;padding:24px;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#1b2a3a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;padding:32px">
      <tr><td>
        <p style="margin:0 0 4px;color:#237a63;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">E-mail Statistieken${test ? " · test" : ""}</p>
        <h1 style="margin:0 0 8px;font-size:22px">${escapeHtml(digestSubject(tenantName, alerts.length))}</h1>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#5b6b7c">${test ? "Dit is een testmail met de alerts die op dit moment zouden afgaan." : "Bij de nachtelijke controle van de database en de campagnes viel het volgende op."}</p>
      </td></tr>
      ${items}
      <tr><td style="padding-top:8px">
        <a href="${escapeHtml(appUrl)}/login" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#237a63;color:#ffffff;font-weight:bold;text-decoration:none">Dashboard bekijken</a>
        <p style="margin:18px 0 0;color:#8a99a8;font-size:12px">Je ontvangt deze e-mail omdat je als ontvanger van alerts voor ${escapeHtml(tenantName)} bent ingesteld. Je beheerder kan dit aanpassen.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
