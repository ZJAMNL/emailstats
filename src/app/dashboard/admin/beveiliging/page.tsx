import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { runSecurityScanAction } from "@/app/security-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireSuperAdmin } from "@/lib/admin-access";
import { getPrismaClient } from "@/lib/prisma";
import type { Finding, FindingStatus } from "@/lib/security/checks";

export const dynamic = "force-dynamic";

const statusLabel: Record<FindingStatus, string> = { ok: "In orde", warning: "Aandacht nodig", critical: "Kritiek" };
const statusIcon = { ok: ShieldCheck, warning: ShieldAlert, critical: ShieldX };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireSuperAdmin();
  const { notice } = await searchParams;
  const scans = process.env.DATABASE_URL ? await getPrismaClient().securityScan.findMany({ orderBy: { ranAt: "desc" }, take: 12 }) : [];
  const latest = scans[0];
  const findings = (latest?.findings ?? []) as unknown as Finding[];
  const status = (latest?.status ?? "ok") as FindingStatus;
  const StatusIcon = statusIcon[status];

  return (
    <DashboardShell role="admin" title="Beveiliging" subtitle="Elke maandagochtend wordt het platform getest; het rapport gaat per e-mail naar de superbeheerders.">
      {notice === "scanned" ? <p className="form-success" role="status">De beveiligingstest is uitgevoerd.</p> : null}
      <section className="panel security-summary">
        {latest ? <div className={`security-status is-${status}`}><StatusIcon size={28} /><div><p className="eyebrow">Laatste test</p><h2>{statusLabel[status]}</h2><p>{latest.ranAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })} · {latest.trigger === "cron" ? "wekelijkse test" : "handmatig"}{latest.emailedTo.length ? ` · gemaild naar ${latest.emailedTo.length} ${latest.emailedTo.length === 1 ? "superbeheerder" : "superbeheerders"}` : ""}</p></div></div>
          : <div className="security-status"><ShieldCheck size={28} /><div><p className="eyebrow">Nog geen test</p><h2>Er is nog geen beveiligingstest uitgevoerd</h2><p>De eerste wekelijkse test draait maandag; je kunt hem ook nu starten.</p></div></div>}
        <form action={runSecurityScanAction} className="security-run">
          <label className="mfa-confirm"><input name="mail" type="checkbox" /> Rapport ook mailen naar de superbeheerders</label>
          <button className="button button-primary" type="submit">Nu testen</button>
        </form>
      </section>

      {findings.length ? <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Resultaten</p><h2>Wat is er getest?</h2></div><span className="tab">{findings.filter((finding) => finding.status !== "ok").length} van {findings.length} vragen aandacht</span></div>
        <ul className="security-findings">
          {findings.map((finding) => (
            <li className={`is-${finding.status}`} key={finding.id}>
              <span className={`security-badge is-${finding.status}`}>{statusLabel[finding.status]}</span>
              <div><strong>{finding.title}</strong> <small>{finding.area}</small><p>{finding.detail}</p>{finding.advice && finding.status !== "ok" ? <p className="security-advice">Advies: {finding.advice}</p> : null}</div>
            </li>
          ))}
        </ul>
      </section> : null}

      {scans.length > 1 ? <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Geschiedenis</p><h2>Eerdere tests</h2></div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Soort</th><th>Resultaat</th><th>Punten</th></tr></thead>
          <tbody>{scans.map((scan) => {
            const items = scan.findings as unknown as Finding[];
            return <tr key={scan.id}><td>{scan.ranAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</td><td>{scan.trigger === "cron" ? "Wekelijks" : "Handmatig"}</td><td><span className={`security-badge is-${scan.status}`}>{statusLabel[scan.status as FindingStatus]}</span></td><td>{items.filter((finding) => finding.status !== "ok").map((finding) => finding.title).join(", ") || "—"}</td></tr>;
          })}</tbody>
        </table></div>
      </section> : null}
    </DashboardShell>
  );
}
