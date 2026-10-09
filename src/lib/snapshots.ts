export type Snapshot = { measuredAt: Date; profileCount: number };

const dayMs = 24 * 60 * 60 * 1000;

/** Snapshots are expected newest first. */
export function compareSnapshot(snapshots: Snapshot[], days: number) {
  const latest = snapshots[0];
  if (!latest) return null;
  const target = latest.measuredAt.getTime() - days * dayMs;
  const match = snapshots.find((snapshot) => snapshot.measuredAt.getTime() <= target);
  if (!match) return null;
  // Snapshots can be missing on some days; flag comparisons that land more than a day before the target.
  return { ...match, approximate: target - match.measuredAt.getTime() > dayMs };
}

export function snapshotOnOrBefore(snapshots: Snapshot[], time: number) {
  return snapshots.find((snapshot) => snapshot.measuredAt.getTime() <= time) ?? null;
}

// Share of `part` in `base` (as a percentage) measured `daysAgo` days before the latest measurement of `part`.
export function selectionRatio(part: Snapshot[], base: Snapshot[], daysAgo: number) {
  const latest = part[0];
  if (!latest) return null;
  const target = latest.measuredAt.getTime() - daysAgo * dayMs;
  const partSnapshot = snapshotOnOrBefore(part, target);
  const baseSnapshot = snapshotOnOrBefore(base, target);
  if (!partSnapshot || !baseSnapshot || baseSnapshot.profileCount === 0) return null;
  // Both measurements must come from roughly the same day to be comparable.
  if (Math.abs(partSnapshot.measuredAt.getTime() - baseSnapshot.measuredAt.getTime()) > dayMs) return null;
  return (partSnapshot.profileCount / baseSnapshot.profileCount) * 100;
}

/** Day totals, only for days on which every series has a measurement (a partial sum looks like a drop). Newest first. */
export function sumByDay(series: Snapshot[][]): Snapshot[] {
  const totals = new Map<number, { total: number; count: number }>();
  for (const snapshots of series) {
    for (const snapshot of snapshots) {
      const day = Math.floor(snapshot.measuredAt.getTime() / dayMs) * dayMs;
      const entry = totals.get(day) ?? { total: 0, count: 0 };
      totals.set(day, { total: entry.total + snapshot.profileCount, count: entry.count + 1 });
    }
  }
  return [...totals.entries()]
    .filter(([, entry]) => entry.count === series.length)
    .sort(([left], [right]) => right - left)
    .map(([day, entry]) => ({ measuredAt: new Date(day), profileCount: entry.total }));
}
