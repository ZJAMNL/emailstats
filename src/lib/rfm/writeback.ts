import { CopernicaError, copernicaSend, getTenantCopernica, listDatabaseFields, mapInBatches } from "../copernica";
import { getPrismaClient } from "../prisma";
import { clearedHash, clearedProfileFields, desiredProfileFields, planWriteBack, rfmCopernicaFields } from "./writeback-plan";

export { noRecentPurchaseLabel, rfmCopernicaFields } from "./writeback-plan";

export type WriteBackSummary = { at: string; updated: number; cleared: number; failed: number; remaining: number; error?: string };

export async function ensureRfmFields(tenantId: string) {
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");
  const existing = new Set((await listDatabaseFields(connected.jwt, connected.connection.databaseId)).map((field) => field.name.toLowerCase()));
  const created: string[] = [];
  for (const field of rfmCopernicaFields) {
    if (existing.has(field.name.toLowerCase())) continue;
    await copernicaSend(connected.jwt, "POST", `database/${encodeURIComponent(connected.connection.databaseId)}/fields`, {
      name: field.name,
      type: field.type,
      description: field.description,
      ...("length" in field ? { length: field.length } : {}),
      index: field.index,
      displayed: field.name === "RFM_Segment",
    });
    created.push(field.name);
  }
  return { created, existing: rfmCopernicaFields.map((field) => field.name).filter((name) => existing.has(name.toLowerCase())) };
}

export async function listMissingRfmFields(tenantId: string) {
  const connected = await getTenantCopernica(tenantId);
  if (!connected) return null;
  const existing = new Set((await listDatabaseFields(connected.jwt, connected.connection.databaseId)).map((field) => field.name.toLowerCase()));
  return rfmCopernicaFields.map((field) => field.name).filter((name) => !existing.has(name.toLowerCase()));
}

/** Writes changed RFM values to Copernica until the deadline; the next run continues where this one stopped. */
export async function writeRfmToCopernica(tenantId: string, deadline: number): Promise<WriteBackSummary> {
  const prisma = getPrismaClient();
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");

  const today = new Date().toISOString().slice(0, 10);
  const [rows, writtenRows] = await Promise.all([
    prisma.rfmProfileScore.findMany({ where: { tenantId }, select: { copernicaProfileId: true, segment: true, previousSegment: true, r: true, f: true, m: true, predictedClv: true, probabilityAlive: true } }),
    prisma.rfmWriteBack.findMany({ where: { tenantId }, select: { copernicaProfileId: true, hash: true } }),
  ]);
  const desired = new Map(rows.map((row) => [row.copernicaProfileId, desiredProfileFields(row, today)]));
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
        const body = clear ? clearedProfileFields(today) : desired.get(profileId)!.fields;
        await copernicaSend(connected.jwt, "PUT", `profile/${encodeURIComponent(profileId)}/fields`, body);
        done.push({ profileId, hash: clear ? clearedHash : desired.get(profileId)!.hash });
        if (clear) summary.cleared++;
        else summary.updated++;
      } catch (error) {
        if (error instanceof CopernicaError && (error.status === 401 || error.status === 403)) forbidden = true;
        summary.failed++;
      }
    });
    const writtenAt = new Date();
    await prisma.$transaction(done.map((item) => prisma.rfmWriteBack.upsert({
      where: { tenantId_copernicaProfileId: { tenantId, copernicaProfileId: item.profileId } },
      create: { tenantId, copernicaProfileId: item.profileId, hash: item.hash, writtenAt },
      update: { hash: item.hash, writtenAt },
    })));
    summary.remaining -= batch.length;
    if (forbidden) {
      summary.error = "Copernica weigert het schrijven: het API-token heeft geen schrijfrechten.";
      summary.remaining = tasks.length - summary.updated - summary.cleared;
      break;
    }
  }
  summary.remaining = Math.max(0, tasks.length - summary.updated - summary.cleared);
  await prisma.rfmConfig.update({ where: { tenantId }, data: { lastWriteAt: new Date(), lastWriteSummary: summary } });
  return summary;
}
