import { getPrismaClient } from "@/lib/prisma";
import { loadAlertContext } from "./context";
import { canSendAlertMail, sendAlertDigest, type DigestAlert } from "./mail";
import { alertRules, alertRulesByKey, isInCooldown, type AlertFinding, type AlertRule } from "./rules";
import { readAlertRules, type AlertRuleSettings } from "./settings";

const dayMs = 24 * 60 * 60 * 1000;
/** Alerts whose digest failed are retried with the next digest for this long. */
const RETRY_UNSENT_DAYS = 3;

export type AlertRunResult = { tenantId: string; status: "sent" | "nothing-new" | "not-sent" | "failed" | "skipped"; alerts: number; error?: string };

/** Every enabled rule that fires right now, without looking at earlier alerts. */
export async function evaluateAlerts(tenantId: string, rules: Record<string, AlertRuleSettings>, now: Date) {
  const context = await loadAlertContext(tenantId, now);
  if (!context) return [];
  return alertRules.flatMap((rule) => {
    const settings = rules[rule.key];
    return settings?.enabled ? rule.evaluate(context, settings.params).map((finding) => ({ rule, finding })) : [];
  });
}

export function toDigestAlert(rule: AlertRule, finding: Pick<AlertFinding, "title" | "detail">): DigestAlert {
  return { severity: rule.severity, label: rule.label, title: finding.title, detail: finding.detail, advice: rule.advice };
}

/** Nightly run for one customer: new alerts (after cooldown) are stored and mailed as one digest. */
export async function runAlertsForTenant(tenantId: string, now: Date, appUrl: string): Promise<AlertRunResult> {
  const prisma = getPrismaClient();
  const settings = await prisma.alertSettings.findUnique({ where: { tenantId }, select: { enabled: true, recipients: true, rules: true, tenant: { select: { name: true } } } });
  if (!settings?.enabled || !settings.recipients.length) return { tenantId, status: "skipped", alerts: 0 };

  const findings = await evaluateAlerts(tenantId, readAlertRules(settings.rules), now);
  const previous = findings.length ? await prisma.alertEvent.groupBy({
    by: ["ruleKey", "subjectKey"],
    where: { tenantId, OR: findings.map(({ rule, finding }) => ({ ruleKey: rule.key, subjectKey: finding.subjectKey })) },
    _max: { triggeredAt: true },
  }) : [];
  const lastTriggered = new Map(previous.map((row) => [`${row.ruleKey}\u0000${row.subjectKey}`, row._max.triggeredAt]));
  const fresh = findings.filter(({ rule, finding }) => !isInCooldown(rule, lastTriggered.get(`${rule.key}\u0000${finding.subjectKey}`) ?? null, now));

  if (fresh.length) {
    await prisma.alertEvent.createMany({
      data: fresh.map(({ rule, finding }) => ({ tenantId, ruleKey: rule.key, subjectKey: finding.subjectKey, severity: rule.severity, title: finding.title, detail: finding.detail, value: finding.value, triggeredAt: now })),
    });
  }

  // Includes alerts from earlier runs whose e-mail failed.
  const unsent = await prisma.alertEvent.findMany({ where: { tenantId, sentAt: null, triggeredAt: { gte: new Date(now.getTime() - RETRY_UNSENT_DAYS * dayMs) } }, orderBy: { triggeredAt: "asc" } });
  if (!unsent.length) return { tenantId, status: "nothing-new", alerts: 0 };
  if (!canSendAlertMail()) return { tenantId, status: "not-sent", alerts: unsent.length };

  const alerts = unsent.flatMap((event) => {
    const rule = alertRulesByKey.get(event.ruleKey);
    return rule ? [toDigestAlert(rule, event)] : [];
  });
  try {
    await sendAlertDigest({ tenantName: settings.tenant.name, recipients: settings.recipients, alerts, appUrl });
  } catch (error) {
    return { tenantId, status: "failed", alerts: unsent.length, error: error instanceof Error ? error.message.slice(0, 200) : "Onbekende fout" };
  }
  const sentAt = new Date();
  await prisma.$transaction([
    prisma.alertEvent.updateMany({ where: { id: { in: unsent.map((event) => event.id) } }, data: { sentAt } }),
    prisma.alertSettings.update({ where: { tenantId }, data: { lastDigestAt: sentAt } }),
  ]);
  return { tenantId, status: "sent", alerts: unsent.length };
}
