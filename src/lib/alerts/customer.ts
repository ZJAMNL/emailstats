import { getPrismaClient } from "@/lib/prisma";
import { readTenantDashboardModules } from "@/lib/tenant-settings";
import { alertRulesByKey, type AlertGroup, type AlertSeverity } from "./rules";

export type CustomerAlert = { id: string; severity: AlertSeverity; label: string; title: string; detail: string; advice: string; triggeredAt: Date };

const dayMs = 24 * 60 * 60 * 1000;
export const CUSTOMER_ALERT_DAYS = 30;

/**
 * Recent alerts for the customer's own dashboard, or null when alerts are off for this customer.
 * Alerts about parts the customer cannot see (a hidden RFM model, switched-off statistics) are left out.
 */
export async function loadCustomerAlerts(tenantId: string, now = new Date()): Promise<CustomerAlert[] | null> {
  const prisma = getPrismaClient();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      settings: true,
      alertSettings: { select: { enabled: true } },
      rfmConfig: { select: { enabled: true, customerVisible: true } },
      alertEvents: { where: { triggeredAt: { gte: new Date(now.getTime() - CUSTOMER_ALERT_DAYS * dayMs) } }, orderBy: { triggeredAt: "desc" }, take: 50 },
    },
  });
  if (!tenant?.alertSettings?.enabled) return null;

  const modules = readTenantDashboardModules(tenant.settings);
  const visible: Record<AlertGroup, boolean> = {
    database: modules.databaseStats,
    campaigns: modules.campaignStats,
    deliverability: modules.campaignStats,
    rfm: Boolean(tenant.rfmConfig?.enabled && tenant.rfmConfig.customerVisible),
    technical: true,
  };

  return tenant.alertEvents.flatMap((event) => {
    const rule = alertRulesByKey.get(event.ruleKey);
    if (!rule || !visible[rule.group] || (rule.key === "rfm_failed" && !visible.rfm)) return [];
    return [{ id: event.id, severity: rule.severity, label: rule.label, title: event.title, detail: event.detail, advice: rule.advice, triggeredAt: event.triggeredAt }];
  }).slice(0, 10);
}
