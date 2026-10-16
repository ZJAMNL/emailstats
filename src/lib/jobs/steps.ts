import { getTenantCopernica, syncTenantCopernicaData } from "../copernica";
import { measureJob } from "../costs/usage";
import { dropCache, ingestSlice, type IngestCursor } from "../data-cache/ingest";
import { cacheSources } from "../data-cache/sources";
import { writeForecastOrders } from "../predict/orders-writer";
import { runPredictions } from "../predict/run";
import { getPrismaClient } from "../prisma";
import { runRfm } from "../rfm/run";
import { writeRfmToCopernica } from "../rfm/writeback";

export type JobStep = "sync" | "ingest" | "rfm" | "rfm-write" | "predictions" | "forecast-write";
export const stepLabel: Record<JobStep, string> = {
  sync: "Synchroniseren met Copernica",
  ingest: "Orders en gedrag bijwerken",
  rfm: "RFM en klantwaarde berekenen",
  "rfm-write": "RFM naar Copernica schrijven",
  predictions: "Voorspellingen berekenen",
  "forecast-write": "Verwachte bestellingen naar Copernica",
};
export const allSteps: JobStep[] = ["sync", "ingest", "rfm", "rfm-write", "predictions", "forecast-write"];
/** Steps that keep their place in a cursor and can be spread over several slices. */
export const resumableSteps = new Set<JobStep>(["ingest", "rfm-write", "forecast-write"]);

/** Above this database size the cache does not grow (DB_CACHE_LIMIT_MB; Neon's free plan stops at 512 MB). */
const CACHE_LIMIT_MB = Number(process.env.DB_CACHE_LIMIT_MB) || 450;

async function databaseSizeMb() {
  const [row] = await getPrismaClient().$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`;
  return Number(row?.bytes ?? 0) / 1e6;
}

export type StepContext = { tenantId: string; cursor: unknown; params: { range?: { from?: string; to?: string } } | null; deadline: number };
export type StepResult = { done: boolean; cursor?: unknown; progress?: string };

/** Runs (part of) one step. A step that does not apply to this customer is done straight away. */
export async function runStep(step: JobStep, context: StepContext): Promise<StepResult> {
  const prisma = getPrismaClient();
  const { tenantId, deadline } = context;
  switch (step) {
    case "sync": {
      const result = await measureJob(tenantId, "copernica-sync", () => syncTenantCopernicaData(tenantId, context.params?.range));
      return { done: true, progress: `${result.selectionCount} selecties en ${result.campaignCount} campagnes bijgewerkt` };
    }
    case "ingest": {
      const sources = await cacheSources(tenantId);
      if (!sources.length) return { done: true, progress: "Geen orderdata gekoppeld" };
      // Above the size limit caches that never finished are removed: they only take space. New rows are
      // still added (little data, and the cache must stay current); full refreshes stop (see ingestSlice).
      if ((await databaseSizeMb()) > CACHE_LIMIT_MB && !context.cursor) {
        const finished = new Set((await prisma.dataCache.findMany({ where: { tenantId, fullRefreshAt: { not: null } }, select: { kind: true } })).map((state) => state.kind));
        for (const kind of ["orders", "lines", "events"] as const) if (!finished.has(kind)) await dropCache(tenantId, kind);
      }
      const connected = await getTenantCopernica(tenantId);
      if (!connected) return { done: true, progress: "Geen Copernica-koppeling" };
      const state = (context.cursor ?? { index: 0, inner: null }) as { index: number; inner: IngestCursor | null };
      let progress = "";
      for (let index = state.index; index < sources.length; index++) {
        const result = await measureJob(tenantId, "ingest", () => ingestSlice(tenantId, sources[index], connected.jwt, index === state.index ? state.inner : null, deadline, async () => (await databaseSizeMb()) > CACHE_LIMIT_MB));
        progress = result.progress;
        if (!result.done) return { done: false, cursor: { index, inner: result.cursor }, progress };
        if (Date.now() > deadline && index < sources.length - 1) return { done: false, cursor: { index: index + 1, inner: null }, progress };
      }
      return { done: true, progress };
    }
    case "rfm": {
      const config = await prisma.rfmConfig.findUnique({ where: { tenantId }, select: { enabled: true } });
      if (!config?.enabled) return { done: true, progress: "RFM staat uit" };
      const summary = await measureJob(tenantId, "rfm", () => runRfm(tenantId));
      return { done: true, progress: `${summary.value.customers.toLocaleString("nl-NL")} klanten berekend` };
    }
    case "rfm-write": {
      const config = await prisma.rfmConfig.findUnique({ where: { tenantId }, select: { enabled: true, writeBackEnabled: true } });
      if (!config?.enabled || !config.writeBackEnabled) return { done: true, progress: "Terugschrijven staat uit" };
      const summary = await measureJob(tenantId, "rfm-write", () => writeRfmToCopernica(tenantId, deadline));
      if (summary.error) throw new Error(summary.error);
      return { done: summary.remaining === 0, progress: `${summary.updated.toLocaleString("nl-NL")} profielen bijgewerkt${summary.remaining ? `, nog ${summary.remaining.toLocaleString("nl-NL")} te gaan` : ""}` };
    }
    case "predictions": {
      const config = await prisma.predictionConfig.findUnique({ where: { tenantId }, select: { enabled: true } });
      if (!config?.enabled) return { done: true, progress: "Voorspellen staat uit" };
      await measureJob(tenantId, "predictions", () => runPredictions(tenantId));
      return { done: true, progress: "Voorspellingen berekend" };
    }
    case "forecast-write": {
      const config = await prisma.predictionConfig.findUnique({ where: { tenantId }, select: { enabled: true, writeBackEnabled: true, forecastCollectionId: true } });
      if (!config?.enabled || !config.writeBackEnabled || !config.forecastCollectionId) return { done: true, progress: "Wegschrijven staat uit" };
      const summary = await measureJob(tenantId, "forecast-write", () => writeForecastOrders(tenantId, deadline));
      if (summary.error) throw new Error(summary.error);
      return { done: summary.remaining === 0, progress: `${(summary.created + summary.updated).toLocaleString("nl-NL")} records bijgewerkt${summary.remaining ? `, nog ${summary.remaining.toLocaleString("nl-NL")} te gaan` : ""}` };
    }
  }
}
