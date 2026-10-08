export type CohortRow = {
  /** First-purchase month, "YYYY-MM". */
  month: string;
  customers: number;
  /** Share of the cohort that bought again in month 1, 2, … after the first purchase month; null = not observed yet. */
  retention: (number | null)[];
  /** Cumulative revenue per customer within the first 1, 3, 6, 12 and 24 months; null = not observed yet. */
  revenuePerCustomer: (number | null)[];
};

export const cohortRevenueMonths = [1, 3, 6, 12, 24];

const monthIndex = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();
const monthLabel = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

/** Groups customers by the month of their first purchase and follows each group over time. */
export function buildCohorts(orders: { profileId: string; date: Date; amount: number }[], now: Date, { cohorts = 24, offsets = 12 } = {}): CohortRow[] {
  const byProfile = new Map<string, { first: number; months: Map<number, number> }>();
  for (const order of orders) {
    const month = monthIndex(order.date);
    const customer = byProfile.get(order.profileId) ?? { first: month, months: new Map<number, number>() };
    customer.first = Math.min(customer.first, month);
    customer.months.set(month, (customer.months.get(month) ?? 0) + Math.max(0, order.amount));
    byProfile.set(order.profileId, customer);
  }

  const current = monthIndex(now);
  const firstShown = current - cohorts + 1;
  const groups = new Map<number, { first: number; months: Map<number, number> }[]>();
  for (const customer of byProfile.values()) {
    if (customer.first < firstShown) continue;
    const group = groups.get(customer.first) ?? [];
    group.push(customer);
    groups.set(customer.first, group);
  }

  return [...groups.entries()].sort(([left], [right]) => right - left).map(([first, members]) => {
    const observed = current - first;
    const retention = Array.from({ length: offsets }, (_, index) => {
      const offset = index + 1;
      // The current month is still running, so its retention would read too low.
      if (offset >= observed) return null;
      return members.filter((member) => member.months.has(first + offset)).length / members.length;
    });
    const revenuePerCustomer = cohortRevenueMonths.map((months) => {
      // A window counts once the cohort has lived through it completely (the current month is still running).
      if (months > observed) return null;
      const total = members.reduce((sum, member) => {
        let revenue = 0;
        for (const [month, amount] of member.months) if (month < first + months) revenue += amount;
        return sum + revenue;
      }, 0);
      return Math.round((total / members.length) * 100) / 100;
    });
    return { month: monthLabel(first), customers: members.length, retention, revenuePerCustomer };
  });
}
