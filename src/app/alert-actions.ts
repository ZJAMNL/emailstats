"use server";

import { refresh } from "next/cache";
import { adminForTenant } from "@/lib/admin-access";
import { canSendAlertMail, sendAlertDigest } from "@/lib/alerts/mail";
import { evaluateAlerts, toDigestAlert } from "@/lib/alerts/run";
import { readAlertRules, validateAlertSettings } from "@/lib/alerts/settings";
import { getAppUrl } from "@/lib/app-url";
import { getPrismaClient } from "@/lib/prisma";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const noAccess = { ok: false as const, error: "Je hebt geen toegang tot deze klant." };

export async function saveAlertSettingsAction(tenantId: string, input: unknown): Promise<Result<null>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const validated = validateAlertSettings(input);
  if (!validated.ok) return validated;
  const { enabled, recipients, rules } = validated.value;
  await getPrismaClient().alertSettings.upsert({
    where: { tenantId },
    create: { tenantId, enabled, recipients, rules },
    update: { enabled, recipients, rules },
  });
  refresh();
  return { ok: true, data: null };
}

/**
 * Mails what would fire right now to the given recipients, ignoring the cooldown and storing nothing,
 * so a beheerder can check the e-mail and the thresholds before switching alerts on.
 */
export async function sendTestAlertAction(tenantId: string, input: unknown): Promise<Result<{ alerts: number }>> {
  if (!(await adminForTenant(tenantId))) return noAccess;
  const validated = validateAlertSettings({ ...(input && typeof input === "object" ? input : {}), enabled: false });
  if (!validated.ok) return validated;
  const { recipients, rules } = validated.value;
  if (!recipients.length) return { ok: false, error: "Vul minstens één ontvanger in." };
  if (!canSendAlertMail()) return { ok: false, error: "E-mail versturen is niet ingesteld (RESEND_API_KEY ontbreekt)." };

  try {
    const tenant = await getPrismaClient().tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const findings = await evaluateAlerts(tenantId, readAlertRules(rules), new Date());
    const alerts = findings.length
      ? findings.map(({ rule, finding }) => toDigestAlert(rule, finding))
      : [{ severity: "warning" as const, label: "Test", title: "Er gaan op dit moment geen alerts af", detail: "Met de huidige drempels is alles binnen de marges. Zo ziet een alert eruit wanneer er wel iets opvalt.", advice: "Je hoeft niets te doen." }];
    await sendAlertDigest({ tenantName: tenant?.name ?? "deze klant", recipients, alerts, appUrl: await getAppUrl(), test: true });
    return { ok: true, data: { alerts: findings.length } };
  } catch {
    return { ok: false, error: "De testmail kon niet worden verstuurd. Controleer de Resend-koppeling." };
  }
}
