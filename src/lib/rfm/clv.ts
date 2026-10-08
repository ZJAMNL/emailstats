/**
 * Predictive customer lifetime value for non-contractual purchases:
 * BG/NBD (Fader, Hardie & Lee 2005) for the number of future purchases and
 * Gamma-Gamma (Fader, Hardie & Lee 2005) for the value per purchase.
 * Time is measured in weeks.
 */

export type ClvInput = {
  profileId: string;
  /** Repeat purchases: distinct purchase days after the first one. */
  x: number;
  /** Weeks between the first and the last purchase. */
  tx: number;
  /** Weeks between the first purchase and now. */
  T: number;
  /** Number of orders and their average value, for Gamma-Gamma. */
  orders: number;
  avgValue: number;
};

export type BgNbdParams = { r: number; alpha: number; a: number; b: number };
export type GammaGammaParams = { p: number; q: number; v: number };

const dayMs = 24 * 60 * 60 * 1000;
const weekMs = 7 * dayMs;

/** Builds the per-customer BG/NBD and Gamma-Gamma inputs from usable orders. */
export function clvInputs(orders: { profileId: string; date: Date; amount: number }[], now: Date): ClvInput[] {
  const byProfile = new Map<string, { days: Set<number>; first: number; last: number; orders: number; revenue: number }>();
  for (const order of orders) {
    const time = order.date.getTime();
    const day = Math.floor(time / dayMs);
    const customer = byProfile.get(order.profileId) ?? { days: new Set<number>(), first: time, last: time, orders: 0, revenue: 0 };
    customer.days.add(day);
    customer.first = Math.min(customer.first, time);
    customer.last = Math.max(customer.last, time);
    if (order.amount > 0) {
      customer.orders++;
      customer.revenue += order.amount;
    }
    byProfile.set(order.profileId, customer);
  }
  return [...byProfile.entries()].map(([profileId, customer]) => ({
    profileId,
    x: customer.days.size - 1,
    tx: (customer.last - customer.first) / weekMs,
    T: Math.max((now.getTime() - customer.first) / weekMs, (customer.last - customer.first) / weekMs, 1 / 7),
    orders: customer.orders,
    avgValue: customer.orders ? customer.revenue / customer.orders : 0,
  }));
}

// ---------------------------------------------------------------- BG/NBD

export function bgNbdLogLikelihood({ r, alpha, a, b }: BgNbdParams, customers: ClvInput[]) {
  const constant = lnGamma(a + b) - lnGamma(b) - lnGamma(r) + r * Math.log(alpha);
  // The gamma terms depend on x only, and most customers share a handful of x values.
  const byX = new Map<number, number>();
  const gammaTerms = (x: number) => {
    let value = byX.get(x);
    if (value === undefined) {
      value = lnGamma(r + x) + lnGamma(b + x) - lnGamma(a + b + x);
      byX.set(x, value);
    }
    return value;
  };
  const logA = Math.log(a);
  let total = 0;
  for (const { x, tx, T } of customers) {
    const a3 = -(r + x) * Math.log(alpha + T);
    const value = x > 0
      ? logSumExp(a3, logA - Math.log(b + x - 1) - (r + x) * Math.log(alpha + tx))
      : a3;
    total += gammaTerms(x) + constant + value;
  }
  return total;
}

export function fitBgNbd(allCustomers: ClvInput[]): BgNbdParams {
  const customers = fitSample(allCustomers);
  const toParams = (v: number[]) => ({ r: Math.exp(v[0]), alpha: Math.exp(v[1]), a: Math.exp(v[2]), b: Math.exp(v[3]) });
  const objective = (v: number[]) => {
    // A small penalty keeps the optimiser away from degenerate extremes.
    const value = -bgNbdLogLikelihood(toParams(v), customers) + 1e-3 * v.reduce((sum, item) => sum + item * item, 0);
    return Number.isFinite(value) ? value : Number.MAX_VALUE;
  };
  const meanT = customers.reduce((sum, customer) => sum + customer.T, 0) / customers.length;
  const starts = [[0, Math.log(Math.max(meanT / 4, 1)), 0, 0], [Math.log(0.5), Math.log(Math.max(meanT / 10, 1)), Math.log(0.5), Math.log(2)], [Math.log(2), Math.log(Math.max(meanT, 1)), Math.log(2), Math.log(5)]];
  let best = { point: starts[0], value: Number.MAX_VALUE };
  for (const start of starts) {
    const result = nelderMead(objective, start);
    if (result.value < best.value) best = result;
  }
  return toParams(best.point);
}

export function probabilityAlive({ r, alpha, a, b }: BgNbdParams, { x, tx, T }: Pick<ClvInput, "x" | "tx" | "T">) {
  if (x === 0) return 1;
  return 1 / (1 + (a / (b + x - 1)) * Math.exp((r + x) * (Math.log(alpha + T) - Math.log(alpha + tx))));
}

/** Expected number of purchases in the next `weeks` weeks. */
export function expectedPurchases({ r, alpha, a, b }: BgNbdParams, { x, tx, T }: Pick<ClvInput, "x" | "tx" | "T">, weeks: number) {
  const safeA = Math.abs(a - 1) < 1e-6 ? a + 1e-6 : a;
  const z = weeks / (alpha + T + weeks);
  const hyper = hypergeometric2F1(r + x, b + x, safeA + b + x - 1, z);
  const numerator = ((safeA + b + x - 1) / (safeA - 1)) * (1 - Math.exp((r + x) * Math.log((alpha + T) / (alpha + T + weeks))) * hyper);
  const denominator = 1 + (x > 0 ? (safeA / (b + x - 1)) * Math.exp((r + x) * (Math.log(alpha + T) - Math.log(alpha + tx))) : 0);
  return Math.max(0, numerator / denominator);
}

// ---------------------------------------------------------- Gamma-Gamma

export function gammaGammaLogLikelihood({ p, q, v }: GammaGammaParams, customers: { orders: number; avgValue: number }[]) {
  const byX = new Map<number, number>();
  const gammaTerms = (x: number) => {
    let value = byX.get(x);
    if (value === undefined) {
      value = lnGamma(p * x + q) - lnGamma(p * x) - lnGamma(q) + p * x * Math.log(x);
      byX.set(x, value);
    }
    return value;
  };
  const qLogV = q * Math.log(v);
  let total = 0;
  for (const { orders: x, avgValue: m } of customers) {
    total += gammaTerms(x) + qLogV + (p * x - 1) * Math.log(m) - (p * x + q) * Math.log(x * m + v);
  }
  return total;
}

/** Fits on customers with at least two orders and a positive average value, as the model prescribes. */
export function fitGammaGamma(customers: ClvInput[]): GammaGammaParams | null {
  const sample = fitSample(customers.filter((customer) => customer.orders >= 2 && customer.avgValue > 0));
  if (sample.length < 20) return null;
  const toParams = (point: number[]) => ({ p: Math.exp(point[0]), q: Math.exp(point[1]), v: Math.exp(point[2]) });
  const meanValue = sample.reduce((sum, customer) => sum + customer.avgValue, 0) / sample.length;
  const objective = (point: number[]) => {
    const value = -gammaGammaLogLikelihood(toParams(point), sample) + 1e-3 * point.reduce((sum, item) => sum + item * item, 0);
    return Number.isFinite(value) ? value : Number.MAX_VALUE;
  };
  const starts = [[Math.log(2), Math.log(3), Math.log(meanValue)], [Math.log(6), Math.log(4), Math.log(meanValue * 2)], [0, Math.log(2), Math.log(Math.max(meanValue / 2, 1))]];
  let best = { point: starts[0], value: Number.MAX_VALUE };
  for (const start of starts) {
    const result = nelderMead(objective, start);
    if (result.value < best.value) best = result;
  }
  const params = toParams(best.point);
  return params.q > 1 ? params : null;
}

export function expectedOrderValue({ p, q, v }: GammaGammaParams, { orders, avgValue }: { orders: number; avgValue: number }) {
  if (orders <= 0 || avgValue <= 0) return (p * v) / (q - 1);
  return (p * (v + orders * avgValue)) / (p * orders + q - 1);
}

// ------------------------------------------------------------- helpers

/** A deterministic, evenly spread sample: fitting on 15,000 customers is as accurate as on all of them and much faster. */
export function fitSample<T>(items: T[], size = 15_000) {
  if (items.length <= size) return items;
  const step = items.length / size;
  return Array.from({ length: size }, (_, index) => items[Math.floor(index * step)]);
}

/** Gauss hypergeometric function 2F1(a, b; c; z) for |z| < 1 by its power series. */
export function hypergeometric2F1(a: number, b: number, c: number, z: number) {
  let term = 1;
  let sum = 1;
  for (let j = 0; j < 5000; j++) {
    term *= ((a + j) * (b + j)) / ((c + j) * (j + 1)) * z;
    sum += term;
    if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
  }
  return sum;
}

/** Lanczos approximation of ln Γ(x) for x > 0. */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const g = 7;
  const coefficients = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  const shifted = x - 1;
  let series = coefficients[0];
  for (let index = 1; index < g + 2; index++) series += coefficients[index] / (shifted + index);
  const t = shifted + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

function logSumExp(left: number, right: number) {
  const max = Math.max(left, right);
  return max + Math.log(Math.exp(left - max) + Math.exp(right - max));
}

/** Nelder–Mead simplex minimisation. */
export function nelderMead(f: (point: number[]) => number, start: number[], { maxIterations = 4000, tolerance = 1e-9, step = 0.5 } = {}) {
  const n = start.length;
  let simplex = [start, ...start.map((_, index) => start.map((value, position) => (position === index ? value + step : value)))].map((point) => ({ point, value: f(point) }));

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    simplex.sort((left, right) => left.value - right.value);
    const best = simplex[0];
    const worst = simplex[n];
    if (Math.abs(worst.value - best.value) <= tolerance * (Math.abs(best.value) + tolerance)) break;

    const centroid = Array.from({ length: n }, (_, position) => simplex.slice(0, n).reduce((sum, vertex) => sum + vertex.point[position], 0) / n);
    const along = (factor: number) => centroid.map((value, position) => value + factor * (worst.point[position] - value));
    const reflected = { point: along(-1), value: 0 };
    reflected.value = f(reflected.point);

    if (reflected.value < best.value) {
      const expanded = { point: along(-2), value: 0 };
      expanded.value = f(expanded.point);
      simplex[n] = expanded.value < reflected.value ? expanded : reflected;
    } else if (reflected.value < simplex[n - 1].value) {
      simplex[n] = reflected;
    } else {
      const contracted = { point: along(reflected.value < worst.value ? -0.5 : 0.5), value: 0 };
      contracted.value = f(contracted.point);
      if (contracted.value < Math.min(worst.value, reflected.value)) {
        simplex[n] = contracted;
      } else {
        simplex = simplex.map((vertex, index) => {
          if (index === 0) return vertex;
          const point = vertex.point.map((value, position) => best.point[position] + 0.5 * (value - best.point[position]));
          return { point, value: f(point) };
        });
      }
    }
  }
  simplex.sort((left, right) => left.value - right.value);
  return simplex[0];
}
