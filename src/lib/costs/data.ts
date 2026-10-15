import { tenantWhere, type AdminSession } from "../admin-access";
import { getPrismaClient } from "../prisma";
import { readTenantDashboardModules } from "../tenant-settings";
import { readCostSettings, type CostSettings, type TenantUsage } from "./model";

const dayMs = 24 * 60 * 60 * 1000;
const SETTINGS_KEY = "cost-settings";
/** Tables that grow per customer, with how their rows belong to a customer. */
const tenantTables = ["RfmProfileScore", "ProfilePrediction", "PredictionOutcome", "Campaign", "CopernicaSelection", "AlertEvent", "InsightWriteBack", "RfmWriteBack", "RfmSegmentSnapshot", "CachedOrder", "CachedLine", "CachedEvent"] as const;

export async function loadCostSettings(): Promise<CostSettings> {
  const row = await getPrismaClient().platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
  return readCostSettings(row?.value);
}

export async function saveCostSettings(settings: CostSettings) {
  const value = JSON.parse(JSON.stringify(settings));
  await getPrismaClient().platformSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value }, update: { value } });
}

/**
 * Storage per customer: the rows each customer has in the growing tables times the average row size of
 * that table (including its indexes), from Postgres' own statistics.
 */
async function storagePerTenant() {
  const prisma = getPrismaClient();
  const sizes = await prisma.$queryRaw<{ table: string; bytes: bigint; rows: bigint }[]>`
    SELECT relname AS "table", pg_total_relation_size(relid) AS bytes, GREATEST(n_live_tup, 1) AS rows
    FROM pg_stat_user_tables WHERE relname = ANY(${[...tenantTables, "SelectionSnapshot"]})`;
  const rowSize = new Map(sizes.map((size) => [size.table, Number(size.bytes) / Number(size.rows)]));
  const counts = await prisma.$queryRaw<{ tenantId: string; table: string; rows: bigint }[]>`
    SELECT "tenantId", 'RfmProfileScore' AS "table", count(*) AS rows FROM "RfmProfileScore" GROUP BY 1
    UNION ALL SELECT "tenantId", 'ProfilePrediction', count(*) FROM "ProfilePrediction" GROUP BY 1
    UNION ALL SELECT "tenantId", 'PredictionOutcome', count(*) FROM "PredictionOutcome" GROUP BY 1
    UNION ALL SELECT "tenantId", 'Campaign', count(*) FROM "Campaign" GROUP BY 1
    UNION ALL SELECT "tenantId", 'CopernicaSelection', count(*) FROM "CopernicaSelection" GROUP BY 1
    UNION ALL SELECT "tenantId", 'AlertEvent', count(*) FROM "AlertEvent" GROUP BY 1
    UNION ALL SELECT "tenantId", 'InsightWriteBack', count(*) FROM "InsightWriteBack" GROUP BY 1
    UNION ALL SELECT "tenantId", 'RfmWriteBack', count(*) FROM "RfmWriteBack" GROUP BY 1
    UNION ALL SELECT "tenantId", 'RfmSegmentSnapshot', count(*) FROM "RfmSegmentSnapshot" GROUP BY 1
    UNION ALL SELECT "tenantId", 'CachedOrder', count(*) FROM "CachedOrder" GROUP BY 1
    UNION ALL SELECT "tenantId", 'CachedLine', count(*) FROM "CachedLine" GROUP BY 1
    UNION ALL SELECT "tenantId", 'CachedEvent', count(*) FROM "CachedEvent" GROUP BY 1
    UNION ALL SELECT c."tenantId", 'SelectionSnapshot', count(*) FROM "SelectionSnapshot" s JOIN "CopernicaSelection" c ON c.id = s."selectionId" GROUP BY 1`;
  const bytes = new Map<string, number>();
  const rows = new Map<string, Map<string, number>>();
  for (const count of counts) {
    bytes.set(count.tenantId, (bytes.get(count.tenantId) ?? 0) + Number(count.rows) * (rowSize.get(count.table) ?? 0));
    const perTable = rows.get(count.tenantId) ?? new Map<string, number>();
    perTable.set(count.table, Number(count.rows));
    rows.set(count.tenantId, perTable);
  }
  return { bytes, rows };
}

/** Everything the cost dashboard needs per customer this beheerder may see, plus the platform-wide customer count. */
export async function loadTenantUsage(session: AdminSession, now = new Date()) {
  const prisma = getPrismaClient();
  const since = new Date(now.getTime() - 30 * dayMs);
  const [tenants, activeCustomers, storage, jobs, failures, firstJobs, alertsSent] = await Promise.all([
    prisma.tenant.findMany({
      where: tenantWhere(session),
      select: {
        id: true, name: true, status: true, settings: true,
        owner: { select: { name: true } },
        copernica: { select: { lastSyncedAt: true } },
        users: { select: { lastLoginAt: true } },
        rfmConfig: { select: { lastRunStatus: true } },
        predictionConfig: { select: { lastRunStatus: true, lastRunSummary: true } },
        alertSettings: { select: { recipients: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.count({ where: { status: "active" } }),
    storagePerTenant(),
    prisma.jobRun.groupBy({ by: ["tenantId"], where: { startedAt: { gte: since } }, _sum: { durationMs: true } }),
    prisma.jobRun.groupBy({ by: ["tenantId"], where: { startedAt: { gte: since }, ok: false }, _count: { _all: true } }),
    prisma.jobRun.groupBy({ by: ["tenantId"], _min: { startedAt: true } }),
    prisma.alertEvent.findMany({ where: { sentAt: { gte: since } }, select: { tenantId: true, sentAt: true }, distinct: ["tenantId", "sentAt"] }),
  ]);

  const usages: TenantUsage[] = tenants.map((tenant) => {
    const tables = storage.rows.get(tenant.id) ?? new Map<string, number>();
    const measuredMs = jobs.find((job) => job.tenantId === tenant.id)?._sum.durationMs ?? 0;
    const first = firstJobs.find((job) => job.tenantId === tenant.id)?._min.startedAt;
    // Measuring started recently: scale what was measured up to a full month.
    const measuredDays = first ? Math.max(1, Math.min(30, (now.getTime() - Math.max(first.getTime(), since.getTime())) / dayMs)) : 0;
    const digests = alertsSent.filter((event) => event.tenantId === tenant.id).length;
    const summary = tenant.predictionConfig?.lastRunSummary as { buyers?: { usable?: boolean }; prospects?: { usable?: boolean } } | null | undefined;
    const lastLogin = tenant.users.map((user) => user.lastLoginAt?.getTime() ?? 0).reduce((max, time) => Math.max(max, time), 0);
    return {
      id: tenant.id,
      name: tenant.name,
      active: tenant.status === "active",
      owner: tenant.owner?.name ?? null,
      modules: readTenantDashboardModules(tenant.settings),
      profiles: Math.max(tables.get("RfmProfileScore") ?? 0, tables.get("ProfilePrediction") ?? 0),
      storageBytes: storage.bytes.get(tenant.id) ?? 0,
      jobHoursPerMonth: measuredDays ? (measuredMs / 3_600_000) * (30 / measuredDays) : 0,
      measuredDays: Math.round(measuredDays),
      jobFailures: failures.find((failure) => failure.tenantId === tenant.id)?._count._all ?? 0,
      emailsPerMonth: digests * Math.max(1, tenant.alertSettings?.recipients.length ?? 1),
      lastSyncAt: tenant.copernica?.lastSyncedAt ?? null,
      lastLoginAt: lastLogin ? new Date(lastLogin) : null,
      rfmReady: (tables.get("RfmProfileScore") ?? 0) > 0,
      predictionsReady: (tables.get("ProfilePrediction") ?? 0) > 0,
      modelPassed: summary ? Boolean(summary.buyers?.usable || summary.prospects?.usable) : null,
      hasOrderData: Boolean(tenant.rfmConfig) && (tables.get("RfmProfileScore") ?? 0) > 0,
    };
  });
  return { usages, activeCustomers };
}
