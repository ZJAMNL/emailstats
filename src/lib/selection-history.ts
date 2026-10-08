import { getPrismaClient } from "./prisma";

export type HistoryColumn = {
  index: number;
  header: string;
  values: number;
  suggestedSelectionId: string | null;
};

export type HistoryPreview = {
  columns: HistoryColumn[];
  selections: { id: string; name: string; enabled: boolean }[];
  dateCount: number;
  firstDate: string | null;
  lastDate: string | null;
  existingBySelection: Record<string, number>;
  errors: string[];
};

type ParsedHistory = {
  headers: string[];
  rows: { date: Date; label: string; cells: string[] }[];
  errors: string[];
};

const maxErrors = 10;

export function parseHistoryCsv(text: string): ParsedHistory {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [], errors: ["Het bestand bevat geen gegevensregels."] };

  const delimiter = [";", "\t", ","].find((candidate) => lines[0].includes(candidate)) ?? ";";
  const headers = lines[0].split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const errors: string[] = [];
  const rows: ParsedHistory["rows"] = [];

  for (const [lineIndex, line] of lines.slice(1).entries()) {
    const cells = line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const date = parseDate(cells[0]);
    if (!date) {
      if (errors.length < maxErrors) errors.push(`Regel ${lineIndex + 2}: ongeldige datum "${cells[0]}".`);
      continue;
    }
    rows.push({ date, label: cells[0], cells });
  }

  return { headers, rows, errors };
}

export function parseCount(raw: string | undefined) {
  const value = (raw ?? "").replace(/[.\s ]/g, "");
  if (!value) return null;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function parseDate(raw: string | undefined) {
  const value = (raw ?? "").trim();
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
  const yearFirst = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!dayFirst && !yearFirst) return null;
  const year = Number(dayFirst ? dayFirst[3] : yearFirst![1]);
  const month = Number(dayFirst ? dayFirst[2] : yearFirst![2]);
  const day = Number(dayFirst ? dayFirst[1] : yearFirst![3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export async function previewSelectionHistory(tenantId: string, text: string, scope = "all"): Promise<HistoryPreview> {
  const parsed = parseHistoryCsv(text);
  const selections = await getPrismaClient().copernicaSelection.findMany({
    where: { tenantId },
    select: { id: true, name: true, enabled: true },
    orderBy: { name: "asc" },
  });
  const byName = new Map<string, string | null>();
  for (const selection of selections) {
    const key = selection.name.trim().toLowerCase();
    // Ambiguous names (same name twice in Copernica) are not auto-matched.
    byName.set(key, byName.has(key) ? null : selection.id);
  }

  const errors = [...parsed.errors];
  const columns = parsed.headers.slice(1).map((header, offset) => {
    const index = offset + 1;
    let values = 0;
    for (const row of parsed.rows) {
      const count = parseCount(row.cells[index]);
      if (count === null) continue;
      if (Number.isNaN(count)) {
        if (errors.length < maxErrors) errors.push(`${row.label}, ${header}: "${row.cells[index]}" is geen geheel getal.`);
        continue;
      }
      values++;
    }
    return { index, header, values, suggestedSelectionId: byName.get(header.trim().toLowerCase()) ?? null };
  });

  const dates = parsed.rows.map((row) => row.date.getTime()).sort((a, b) => a - b);
  const existing = dates.length ? await getPrismaClient().selectionSnapshot.groupBy({
    by: ["selectionId"],
    where: { scope, selection: { tenantId }, measuredAt: { in: [...new Set(dates)].map((time) => new Date(time)) } },
    _count: { _all: true },
  }) : [];
  return {
    existingBySelection: Object.fromEntries(existing.map((group) => [group.selectionId, group._count._all])),
    columns,
    selections,
    dateCount: new Set(dates).size,
    firstDate: dates.length ? new Date(dates[0]).toISOString().slice(0, 10) : null,
    lastDate: dates.length ? new Date(dates[dates.length - 1]).toISOString().slice(0, 10) : null,
    errors,
  };
}

export async function importSelectionHistory(
  tenantId: string,
  text: string,
  mapping: Record<string, string>,
  followSelections: boolean,
  scope = "all",
) {
  const prisma = getPrismaClient();
  const parsed = parseHistoryCsv(text);
  const selectionIds = [...new Set(Object.values(mapping).filter(Boolean))];
  const owned = await prisma.copernicaSelection.findMany({ where: { tenantId, id: { in: selectionIds } }, select: { id: true } });
  if (owned.length !== selectionIds.length) throw new Error("Invalid selection mapping.");

  const records = new Map<string, { selectionId: string; scope: string; measuredAt: Date; profileCount: number }>();
  for (const row of parsed.rows) {
    for (const [index, selectionId] of Object.entries(mapping)) {
      if (!selectionId) continue;
      const count = parseCount(row.cells[Number(index)]);
      if (count === null || Number.isNaN(count)) continue;
      records.set(`${selectionId}|${row.date.getTime()}`, { selectionId, scope, measuredAt: row.date, profileCount: count });
    }
  }

  const existing = await prisma.selectionSnapshot.findMany({
    where: { scope, selectionId: { in: selectionIds }, measuredAt: { in: [...new Set(parsed.rows.map((row) => row.date.getTime()))].map((time) => new Date(time)) } },
    select: { id: true, selectionId: true, measuredAt: true },
  });
  const existingIds = new Map(existing.map((snapshot) => [`${snapshot.selectionId}|${snapshot.measuredAt.getTime()}`, snapshot.id]));
  const toCreate = [...records.entries()].filter(([key]) => !existingIds.has(key)).map(([, record]) => record);
  const toUpdate = [...records.entries()].filter(([key]) => existingIds.has(key)).map(([key, record]) => ({ id: existingIds.get(key)!, profileCount: record.profileCount }));

  await prisma.$transaction([
    prisma.selectionSnapshot.createMany({ data: toCreate, skipDuplicates: true }),
    ...toUpdate.map((update) => prisma.selectionSnapshot.update({ where: { id: update.id }, data: { profileCount: update.profileCount } })),
    ...(followSelections ? [prisma.copernicaSelection.updateMany({ where: { tenantId, id: { in: selectionIds } }, data: { enabled: true } })] : []),
  ]);

  return { created: toCreate.length, updated: toUpdate.length, selections: selectionIds.length };
}
