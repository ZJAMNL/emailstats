import { Resend } from "resend";

export type DemoRequest = {
  name: string;
  company: string;
  email: string;
  phone: string;
  usesCopernica: string;
  message: string;
};

const copernicaLabels: Record<string, string> = {
  ja: "Ja",
  nee: "Nee",
  onbekend: "Weet ik niet",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

export async function sendDemoRequest(request: DemoRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DEMO_REQUEST_TO;
  if (!apiKey || !to) throw new Error("RESEND_API_KEY and DEMO_REQUEST_TO must be configured.");

  const from = process.env.EMAIL_FROM ?? "E-mail Statistieken <noreply@enzo.email>";
  const resend = new Resend(apiKey);
  const rows: [string, string][] = [
    ["Naam", request.name],
    ["Bedrijf", request.company],
    ["E-mail", request.email],
    ["Telefoon", request.phone || "—"],
    ["Werkt met Copernica", copernicaLabels[request.usesCopernica] ?? "—"],
    ["Bericht", request.message || "—"],
  ];

  const { error } = await resend.emails.send({
    from,
    to: to.split(",").map((address) => address.trim()).filter(Boolean),
    replyTo: request.email,
    subject: `Demo-aanvraag: ${request.company}`,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    html: `<h2 style="font-family:Arial,sans-serif">Nieuwe demo-aanvraag</h2><table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:6px 16px 6px 0;color:#5b6b7c;vertical-align:top">${label}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`).join("")}</table>`,
  });
  if (error) throw new Error(`Resend: ${error.message}`);

  // The confirmation is a courtesy; the request itself already reached the team.
  await resend.emails.send({
    from,
    to: [request.email],
    subject: "We hebben je demo-aanvraag ontvangen",
    text: `Hoi ${request.name},\n\nBedankt voor je interesse in het E-mail Statistieken-dashboard. We nemen binnen twee werkdagen contact met je op om een demo in te plannen.\n\nMet vriendelijke groet,\nTeam E-mail Statistieken`,
  }).catch(() => undefined);
}
