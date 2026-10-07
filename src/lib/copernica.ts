import { getPrismaClient } from "./prisma";
import { decryptCopernicaToken } from "./copernica-crypto";

export { decryptCopernicaToken, encryptCopernicaToken } from "./copernica-crypto";

const COPERNICA_AUTH_URL = "https://authenticate.copernica.com";
const COPERNICA_API_URL = "https://api.copernica.com/v4";
const REQUEST_TIMEOUT_MS = 12_000;

type CopernicaList<T> = {
  data: T[];
  total?: number;
};

export type CopernicaView = {
  ID: number | string;
  name: string;
  "has-children"?: boolean;
};

export type CopernicaMailing = {
  id: number | string;
  document_name?: string;
  template?: number | string;
  description?: string;
  subject?: string;
  timestamp?: string;
  destinations?: number | string;
  impressions?: number | string;
  clicks?: number | string;
  target?: { sources?: Array<{ id: number | string; type: string }> };
};

type CopernicaMailingStats = {
  destinations?: number | string;
  deliveries?: { total?: number | string };
  impressions?: { total?: number | string };
  clicks?: { total?: number | string };
};

export async function getCopernicaJwt(apiToken: string) {
  const response = await fetch(COPERNICA_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: apiToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`Copernica authentication failed (${response.status}).`);

  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const token = record.token ?? record.access_token ?? record.jwt;
      if (typeof token === "string") return token;
    }
  } catch {
    return body.trim();
  }

  throw new Error("Copernica returned an unexpected authentication response.");
}

export async function copernicaGet<T>(jwt: string, path: string, params?: URLSearchParams) {
  const url = new URL(`${COPERNICA_API_URL}/${path.replace(/^\//, "")}`);
  params?.forEach((value, key) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Copernica request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export async function listCopernicaViews(apiToken: string, databaseId: string) {
  const jwt = await getCopernicaJwt(apiToken);
  return listCopernicaViewsWithJwt(jwt, databaseId);
}

async function listCopernicaViewsWithJwt(jwt: string, databaseId: string) {
  const result = await copernicaGet<CopernicaList<CopernicaView>>(
    jwt,
    `database/${encodeURIComponent(databaseId)}/views`,
    new URLSearchParams({ start: "0", limit: "1000", total: "true" }),
  );
  const allViews = [...(result.data ?? [])];
  const seen = new Set(allViews.map((view) => String(view.ID)));
  let parents = allViews.filter((view) => view["has-children"]);

  while (parents.length > 0) {
    const childrenByParent = await mapInBatches(parents, 8, (parent) =>
      copernicaGet<CopernicaList<CopernicaView>>(
        jwt,
        `view/${encodeURIComponent(String(parent.ID))}/views`,
        new URLSearchParams({ start: "0", limit: "1000", total: "true" }),
      ),
    );
    const children = childrenByParent.flatMap((childList) => childList.data ?? [])
      .filter((view) => !seen.has(String(view.ID)));
    children.forEach((view) => seen.add(String(view.ID)));
    allViews.push(...children);
    parents = children.filter((view) => view["has-children"]);
  }

  return allViews;
}

export async function fetchCopernicaProfileCount(apiToken: string, viewId: string) {
  const jwt = await getCopernicaJwt(apiToken);
  return fetchCopernicaProfileCountWithJwt(jwt, viewId);
}

async function fetchCopernicaProfileCountWithJwt(jwt: string, viewId: string) {
  const result = await copernicaGet<CopernicaList<unknown>>(
    jwt,
    `view/${encodeURIComponent(viewId)}/profiles`,
    new URLSearchParams({ start: "0", limit: "1", total: "true" }),
  );
  return Number(result.total ?? result.data?.length ?? 0);
}

export async function getTenantCopernica(tenantId: string) {
  const connection = await getPrismaClient().copernicaConnection.findUnique({ where: { tenantId } });
  if (!connection) return null;

  const apiToken = decryptCopernicaToken(connection.encryptedApiToken);
  return {
    connection,
    apiToken,
    jwt: await getCopernicaJwt(apiToken),
  };
}

export async function syncTenantCopernicaData(
  tenantId: string,
  range?: { from?: string; to?: string },
) {
  const prisma = getPrismaClient();
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");

  const { connection, jwt } = connected;
  const views = await listCopernicaViewsWithJwt(jwt, connection.databaseId);
  await Promise.all(views.map((view) => prisma.copernicaSelection.upsert({
    where: { tenantId_copernicaId: { tenantId, copernicaId: String(view.ID) } },
    create: { tenantId, copernicaId: String(view.ID), name: view.name },
    update: { name: view.name },
  })));

  const enabledSelections = await prisma.copernicaSelection.findMany({
    where: { tenantId, enabled: true },
  });
  const measuredAt = new Date();
  measuredAt.setUTCHours(0, 0, 0, 0);
  await Promise.all(enabledSelections.map(async (selection) => {
    const profileCount = await fetchCopernicaProfileCountWithJwt(jwt, selection.copernicaId);
    await prisma.selectionSnapshot.upsert({
      where: { selectionId_measuredAt: { selectionId: selection.id, measuredAt } },
      create: { selectionId: selection.id, measuredAt, profileCount },
      update: { profileCount },
    });
  }));

  const params = new URLSearchParams({ start: "0", limit: "1000", total: "true", type: "mass", followups: "both" });
  if (range?.from) params.set("fromdate", `${range.from} 00:00:00`);
  if (range?.to) params.set("todate", `${range.to} 23:59:59`);

  const [htmlMailings, dragMailings] = await Promise.all([
    copernicaGet<CopernicaList<CopernicaMailing>>(jwt, "html/emailings", params),
    copernicaGet<CopernicaList<CopernicaMailing>>(jwt, "draganddrop/emailings", params),
  ]);
  const scopedMailings = [
    ...(htmlMailings.data ?? []).map((mailing) => ({ mailing, channel: "html" })),
    ...(dragMailings.data ?? []).map((mailing) => ({ mailing, channel: "draganddrop" })),
  ].filter(({ mailing }) => mailing.target?.sources?.some((source) => String(source.id) === connection.databaseId));

  await mapInBatches(scopedMailings, 8, async ({ mailing, channel }) => {
    const copernicaId = `${channel}:${mailing.id}`;
    const sentAt = mailing.timestamp ? new Date(mailing.timestamp.replace(" ", "T") + "Z") : null;
    const stats = await copernicaGet<CopernicaMailingStats>(
      jwt,
      `${channel}/emailing/${encodeURIComponent(String(mailing.id))}/statistics`,
    );
    const sentCount = countValue(stats.deliveries?.total ?? stats.destinations ?? mailing.destinations);
    const openCount = countValue(stats.impressions?.total ?? mailing.impressions);
    const clickCount = countValue(stats.clicks?.total ?? mailing.clicks);

    await prisma.campaign.upsert({
      where: { tenantId_copernicaId: { tenantId, copernicaId } },
      create: {
        tenantId,
        copernicaId,
        name: mailing.subject || mailing.description || mailing.document_name || `Campagne ${mailing.id}`,
        status: "SENT",
        sentCount,
        openCount,
        clickCount,
        revenue: 0,
        sentAt,
      },
      update: {
        name: mailing.subject || mailing.description || mailing.document_name || `Campagne ${mailing.id}`,
        sentCount,
        openCount,
        clickCount,
        sentAt,
      },
    });
  });

  await prisma.copernicaConnection.update({
    where: { tenantId },
    data: { lastSyncedAt: new Date() },
  });

  return { selectionCount: enabledSelections.length, campaignCount: scopedMailings.length };
}

async function mapInBatches<T, Result>(items: T[], batchSize: number, callback: (item: T) => Promise<Result>) {
  const results: Result[] = [];
  for (let offset = 0; offset < items.length; offset += batchSize) {
    results.push(...await Promise.all(items.slice(offset, offset + batchSize).map(callback)));
  }
  return results;
}

function countValue(value: number | string | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
}
