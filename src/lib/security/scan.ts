import { connect } from "node:tls";
import { Resend } from "resend";
import lock from "../../../package-lock.json";
import { getPrismaClient } from "../prisma";
import {
  evaluateAccess, evaluateAccounts, evaluateActivity, evaluateCertificate, evaluateConfig, evaluateDependencies, evaluateHeaders, evaluateMfa,
  sortFindings, worstStatus, type AccessProbe, type Finding, type FindingStatus, type Vulnerability,
} from "./checks";

const day = 86_400_000;
/** Sign-in events are kept half a year: long enough to look back on an incident. */
const EVENT_RETENTION_DAYS = 180;
const protectedPages = ["/dashboard/admin", "/dashboard/admin/beheerders", "/dashboard/customer", "/dashboard/customer/data"];
const cronRoutes = ["/api/cron/copernica", "/api/cron/alerts", "/api/cron/security", "/api/jobs/run"];

async function probe(baseUrl: string, path: string, expected: AccessProbe["expected"]): Promise<AccessProbe> {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return { path, expected, status: response.status, location: response.headers.get("location") };
  } catch {
    return { path, expected, status: 0, location: null };
  }
}

async function websiteFindings(baseUrl: string): Promise<Finding[]> {
  let headers: Finding;
  try {
    const response = await fetch(`${baseUrl}/login`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    headers = evaluateHeaders(Object.fromEntries(response.headers.entries()));
  } catch {
    headers = { id: "headers", area: "Website", title: "Beveiligingsheaders", status: "warning", detail: `${baseUrl}/login was niet bereikbaar.` };
  }
  const probes = await Promise.all([
    ...protectedPages.map((path) => probe(baseUrl, path, "login-redirect")),
    ...cronRoutes.map((path) => probe(baseUrl, path, "unauthorized")),
  ]);
  const certificate = baseUrl.startsWith("https://") ? evaluateCertificate(await certificateExpiry(new URL(baseUrl).hostname)) : null;
  return [headers, evaluateAccess(probes), ...(certificate ? [certificate] : [])];
}

function certificateExpiry(host: string) {
  return new Promise<Date | null>((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const validTo = socket.getPeerCertificate()?.valid_to;
      socket.end();
      resolve(validTo ? new Date(validTo) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
  });
}

async function accountFindings(): Promise<Finding[]> {
  const prisma = getPrismaClient();
  const since = new Date(Date.now() - 7 * day);
  const [users, events, failedPerIp] = await Promise.all([
    prisma.user.findMany({ select: { email: true, role: true, totpEnabledAt: true, lastLoginAt: true, createdAt: true } }),
    prisma.securityEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.securityEvent.groupBy({ by: ["ipHash"], where: { type: "login_failed", createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const count = (type: string) => events.find((event) => event.type === type)?._count._all ?? 0;
  const staleBefore = Date.now() - 90 * day;
  return [
    evaluateMfa(users.filter((user) => !user.totpEnabledAt), users.length),
    evaluateActivity({
      loginFailed: count("login_failed"), loginSuccess: count("login_success"), mfaFailed: count("mfa_failed"), locked: count("locked"),
      resets: count("password_reset_requested"), mfaResets: count("mfa_reset"),
      maxFailedPerIp: Math.max(0, ...failedPerIp.map((row) => row._count._all)), distinctFailedIps: failedPerIp.length,
    }),
    ...evaluateAccounts(
      users.filter((user) => (user.lastLoginAt ?? user.createdAt).getTime() < staleBefore),
      users.filter((user) => user.role !== "CUSTOMER" && user.createdAt >= since),
      users.filter((user) => user.role === "SUPERADMIN").length,
    ),
  ];
}

/** Every production package from the lockfile, checked against the OSV database (the source npm audit uses too). */
async function dependencyFinding(): Promise<Finding> {
  const packages = Object.entries((lock as { packages: Record<string, { version?: string; dev?: boolean; devOptional?: boolean }> }).packages)
    .filter(([path, info]) => path.startsWith("node_modules/") && info.version && !info.dev && !info.devOptional)
    .map(([path, info]) => ({ name: path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length), version: info.version! }));
  try {
    const response = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: packages.map((item) => ({ package: { name: item.name, ecosystem: "npm" }, version: item.version })) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return evaluateDependencies(null, packages.length);
    const { results } = await response.json() as { results: { vulns?: { id: string }[] }[] };
    const found = results.flatMap((result, index) => (result.vulns ?? []).map((vuln) => ({ id: vuln.id, ...packages[index] })));
    const vulnerabilities: Vulnerability[] = await Promise.all(found.slice(0, 20).map(async (item) => {
      try {
        const detail = await (await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(item.id)}`, { signal: AbortSignal.timeout(15_000) })).json() as { summary?: string; database_specific?: { severity?: string } };
        return { id: item.id, packageName: item.name, version: item.version, summary: detail.summary ?? "", severity: detail.database_specific?.severity ?? "" };
      } catch {
        return { id: item.id, packageName: item.name, version: item.version, summary: "", severity: "" };
      }
    }));
    return evaluateDependencies(vulnerabilities, packages.length);
  } catch {
    return evaluateDependencies(null, packages.length);
  }
}

export type ScanResult = { id: string; status: FindingStatus; findings: Finding[]; emailedTo: string[] };

/** The weekly security test: run every check, keep the result, and mail the superbeheerders when asked. */
export async function runSecurityScan({ baseUrl, trigger, sendMail }: { baseUrl: string; trigger: "cron" | "handmatig"; sendMail: boolean }): Promise<ScanResult> {
  const prisma = getPrismaClient();
  const findings = sortFindings([
    ...evaluateConfig(process.env),
    ...(await websiteFindings(baseUrl)),
    ...(await accountFindings()),
    await dependencyFinding(),
  ]);
  const status = worstStatus(findings);
  await prisma.securityEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - EVENT_RETENTION_DAYS * day) } } });

  let emailedTo: string[] = [];
  if (sendMail && process.env.RESEND_API_KEY) {
    const superadmins = await prisma.user.findMany({ where: { role: "SUPERADMIN" }, select: { email: true } });
    emailedTo = superadmins.map((user) => user.email);
    if (emailedTo.length) {
      try {
        await sendScanMail(emailedTo, status, findings, baseUrl);
      } catch {
        emailedTo = [];
      }
    }
  }
  const scan = await prisma.securityScan.create({ data: { status, findings: findings as unknown as object, emailedTo, trigger } });
  return { id: scan.id, status, findings, emailedTo };
}

const statusLabel: Record<FindingStatus, string> = { ok: "In orde", warning: "Aandacht nodig", critical: "Kritiek" };
const statusColor: Record<FindingStatus, string> = { ok: "#237a63", warning: "#a8701f", critical: "#b3343c" };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

async function sendScanMail(to: string[], status: FindingStatus, findings: Finding[], baseUrl: string) {
  const issues = findings.filter((finding) => finding.status !== "ok");
  const subject = `Beveiligingstest: ${statusLabel[status].toLowerCase()}${issues.length ? ` (${issues.length} ${issues.length === 1 ? "punt" : "punten"})` : ""}`;
  const rows = findings.map((finding) => `<tr><td style="padding:10px 0;border-top:1px solid #e3e8ee;vertical-align:top;width:120px"><span style="display:inline-block;padding:2px 8px;border-radius:99px;background:${statusColor[finding.status]};color:#fff;font-size:12px;font-weight:bold">${statusLabel[finding.status]}</span></td><td style="padding:10px 0 10px 12px;border-top:1px solid #e3e8ee"><strong>${escapeHtml(finding.title)}</strong> <span style="color:#5b6b7c">· ${escapeHtml(finding.area)}</span><br><span style="font-size:14px;line-height:1.5">${escapeHtml(finding.detail)}</span>${finding.advice && finding.status !== "ok" ? `<br><span style="font-size:13px;color:#5b6b7c">Advies: ${escapeHtml(finding.advice)}</span>` : ""}</td></tr>`).join("");
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM ?? "E-mail Statistieken <noreply@enzo.email>",
    to,
    subject,
    text: [`Wekelijkse beveiligingstest: ${statusLabel[status]}`, "", ...findings.map((finding) => `[${statusLabel[finding.status]}] ${finding.title}: ${finding.detail}${finding.advice && finding.status !== "ok" ? `\n  Advies: ${finding.advice}` : ""}`), "", `Alle rapporten: ${baseUrl}/dashboard/admin/beveiliging`].join("\n"),
    html: `<!doctype html><html lang="nl"><body style="margin:0;padding:24px;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#1b2a3a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:14px;padding:28px"><tr><td><p style="margin:0 0 4px;color:#237a63;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">E-mail Statistieken · Beveiliging</p><h1 style="margin:0 0 6px;font-size:22px">Wekelijkse beveiligingstest</h1><p style="margin:0 0 18px;font-size:15px">Resultaat: <strong style="color:${statusColor[status]}">${statusLabel[status]}</strong>${issues.length ? ` – ${issues.length} ${issues.length === 1 ? "punt vraagt" : "punten vragen"} aandacht.` : " – alle controles zijn in orde."}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table><p style="margin:20px 0 0"><a href="${escapeHtml(baseUrl)}/dashboard/admin/beveiliging" style="display:inline-block;padding:11px 18px;border-radius:9px;background:#237a63;color:#fff;font-weight:bold;text-decoration:none">Bekijk alle rapporten</a></p></td></tr></table></td></tr></table></body></html>`,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
