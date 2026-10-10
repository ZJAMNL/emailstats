import { CopernicaError, copernicaSend, getTenantCopernica, listDatabaseFields, mapInBatches } from "../copernica";
import { getPrismaClient } from "../prisma";
import { clearedHash, planWriteBack } from "../rfm/writeback-plan";
import type { WriteBackSummary } from "../rfm/writeback";
import { clearedPredictionFields, desiredPredictionFields, predictionCopernicaFields } from "./writeback-plan";

export async function ensurePredictionFields(tenantId: string) {
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");
  const existing = new Set((await listDatabaseFields(connected.jwt, connected.connection.databaseId)).map((field) => field.name.toLowerCase()));
  const created: string[] = [];
  for (const field of predictionCopernicaFields) {
    if (existing.has(field.name.toLowerCase())) continue;
    await copernicaSend(connected.jwt, "POST", `database/${encodeURIComponent(connected.connection.databaseId)}/fields`, {
      name: field.name,
      type: field.type,
      description: field.description,
      ...("length" in field ? { length: field.length } : {}),
      index: field.index,
      displayed: false,
    });
    created.push(field.name);
  }
  return { created };
}

export async function listMissingPredictionFields(tenantId: string) {
  const connected = await getTenantCopernica(tenantId);
  if (!connected) return null;
  const existing = new Set((await listDatabaseFields(connected.jwt, connected.connection.databaseId)).map((field) => field.name.toLowerCase()));
  return predictionCopernicaFields.map((field) => field.name).filter((name) => !existing.has(name.toLowerCase()));
}

/** Writes changed AI_ values to Copernica until the deadline; the next run continues where this one stopped. */
export async function writePredictionsToCopernica(tenantId: string, deadline: number): Promise<WriteBackSummary> {
  const prisma = getPrismaClient();
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");

  const today = new Date().toISOString().slice(0, 10);
  const [rows, writtenRows] = await Promise.all([
    prisma.profilePrediction.findMany({ where: { tenantId }, select: { copernicaProfileId: true, isBuyer: true, purchaseProbability: true, intentBand: true, favoriteCategory: true, nextCategory: true, recommendations: true } }),
    prisma.predictionWriteBack.findMany({ where: { tenantId }, select: { copernicaProfileId: true, hash: true } }),
  ]);
  const desired = new Map(rows.map((row) => [row.copernicaProfileId, desiredPredictionFields(row, today)]));
  const plan = planWriteBack(new Map([...desired].map(([profileId, value]) => [profileId, value.hash])), new Map(writtenRows.map((row) => [row.copernicaProfileId, row.hash])));
  const tasks = [...plan.update.map((profileId) => ({ profileId, clear: false })), ...plan.clear.map((profileId) => ({ profileId, clear: true }))];

  const summary: WriteBackSummary = { at: new Date().toISOString(), updated: 0, cleared: 0, failed: 0, remaining: tasks.length };
  for (let index = 0; index < tasks.length && Date.now() < deadline; index += 200) {
    const batch = tasks.slice(index, index + 200);
    const done: { profileId: string; hash: string }[] = [];
    let forbidden = false;
    await mapInBatches(batch, 8, async ({ profileId, clear }) => {
      if (forbidden) return;
      try {
        await copernicaSend(connected.jwt, "PUT", `profile/${encodeURIComponent(profileId)}/fields`, clear ? clearedPredictionFields(today) : desired.get(profileId)!.fields);
        done.push({ profileId, hash: clear ? clearedHash : desired.get(profileId)!.hash });
        if (clear) summary.cleared++;
        else summary.updated++;
      } catch (error) {
        if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) forbidden = true;
        summary.failed++;
      }
    });
    const writtenAt = new Date();
    await prisma.$transaction(done.map((item) => prisma.predictionWriteBack.upsert({
      where: { tenantId_copernicaProfileId: { tenantId, copernicaProfileId: item.profileId } },
      create: { tenantId, copernicaProfileId: item.profileId, hash: item.hash, writtenAt },
      update: { hash: item.hash, writtenAt },
    })));
    if (forbidden) {
      summary.error = "Copernica weigert het schrijven: het API-token heeft geen schrijfrechten.";
      break;
    }
  }
  summary.remaining = Math.max(0, tasks.length - summary.updated - summary.cleared);
  await prisma.predictionConfig.update({ where: { tenantId }, data: { lastWriteAt: new Date(), lastWriteSummary: summary } });
  return summary;
}
