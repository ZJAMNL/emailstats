import { clvInputs, expectedOrderValue, expectedPurchases, fitBgNbd, fitGammaGamma, type BgNbdParams, type GammaGammaParams } from "../rfm/clv";
import type { PredictLine, PredictOrder } from "./features";

const dayMs = 24 * 60 * 60 * 1000;
/** A predicted order further away than this is too uncertain to send to Copernica. */
export const MAX_FORECAST_DAYS = 90;
/** At least this many repeat purchases of a product before its rhythm counts. */
const MIN_REPEATS = 5;

export type CustomerForecast = { profileId: string; expected30: number; expected90: number; orderValue: number };
export type ForecastTotals = { customers: number; orders30: number; revenue30: number; orders90: number; revenue90: number };

/**
 * Expected orders and revenue per existing customer for the next 30 and 90 days, from the same
 * BG/NBD (how often) and Gamma-Gamma (how much) models as the customer value. Null when there are
 * too few customers to fit them.
 */
export function forecastCustomers(orders: PredictOrder[], cutoff: Date): { perProfile: Map<string, CustomerForecast>; totals: ForecastTotals; orderValue: number } | null {
  const inputs = clvInputs(orders.filter((order) => order.date.getTime() < cutoff.getTime()), cutoff);
  if (inputs.length < 50) return null;
  let params: BgNbdParams;
  let gg: GammaGammaParams | null;
  try {
    params = fitBgNbd(inputs);
    gg = fitGammaGamma(inputs);
  } catch {
    return null;
  }
  const valued = inputs.filter((input) => input.orders > 0 && input.avgValue > 0);
  const populationValue = valued.length ? valued.reduce((sum, input) => sum + input.avgValue, 0) / valued.length : 0;
  const perProfile = new Map<string, CustomerForecast>();
  const totals: ForecastTotals = { customers: inputs.length, orders30: 0, revenue30: 0, orders90: 0, revenue90: 0 };
  for (const input of inputs) {
    const expected30 = expectedPurchases(params, input, 30 / 7);
    const expected90 = expectedPurchases(params, input, 90 / 7);
    const orderValue = gg ? expectedOrderValue(gg, input) : input.avgValue || populationValue;
    perProfile.set(input.profileId, { profileId: input.profileId, expected30, expected90, orderValue });
    totals.orders30 += expected30;
    totals.revenue30 += expected30 * orderValue;
    totals.orders90 += expected90;
    totals.revenue90 += expected90 * orderValue;
  }
  return { perProfile, totals, orderValue: populationValue };
}

/** Revenue of the given customers in the window after the cutoff, to check a forecast against. */
export function actualRevenue(orders: PredictOrder[], customers: Set<string>, cutoff: Date, days = 30) {
  const start = cutoff.getTime();
  return orders.filter((order) => customers.has(order.profileId) && order.date.getTime() >= start && order.date.getTime() < start + days * dayMs).reduce((sum, order) => sum + Math.max(0, order.amount), 0);
}

/** Typical days between two purchases of the same product by the same customer, for products bought again often enough. */
export function repurchaseIntervals(lines: PredictLine[], cutoff: Date) {
  const days = new Map<string, Map<string, number[]>>();
  for (const line of lines) {
    if (line.date.getTime() >= cutoff.getTime()) continue;
    const perProduct = days.get(line.productId) ?? new Map<string, number[]>();
    const list = perProduct.get(line.profileId) ?? [];
    list.push(Math.floor(line.date.getTime() / dayMs));
    perProduct.set(line.profileId, list);
    days.set(line.productId, perProduct);
  }
  const intervals = new Map<string, number>();
  for (const [productId, perProfile] of days) {
    const gaps: number[] = [];
    for (const list of perProfile.values()) {
      const sorted = [...new Set(list)].sort((left, right) => left - right);
      // Two lines a few days apart are one shopping moment, not a repeat purchase.
      for (let index = 1; index < sorted.length; index++) if (sorted[index] - sorted[index - 1] >= 7) gaps.push(sorted[index] - sorted[index - 1]);
    }
    if (gaps.length < MIN_REPEATS) continue;
    gaps.sort((left, right) => left - right);
    intervals.set(productId, gaps[Math.floor(gaps.length / 2)]);
  }
  return intervals;
}

export type DueProduct = { productId: string; due: Date };

/** Products a customer is due to buy again: last purchase plus the product's rhythm, from two weeks overdue up to 90 days ahead. */
export function dueProducts(lines: PredictLine[], intervals: Map<string, number>, now: Date) {
  const last = new Map<string, Map<string, number>>();
  for (const line of lines) {
    if (!intervals.has(line.productId) || line.date.getTime() > now.getTime()) continue;
    const perProfile = last.get(line.profileId) ?? new Map<string, number>();
    perProfile.set(line.productId, Math.max(perProfile.get(line.productId) ?? 0, line.date.getTime()));
    last.set(line.profileId, perProfile);
  }
  const due = new Map<string, DueProduct[]>();
  for (const [profileId, products] of last) {
    const list = [...products].map(([productId, time]) => ({ productId, due: new Date(time + intervals.get(productId)! * dayMs) }))
      .filter((item) => item.due.getTime() >= now.getTime() - 14 * dayMs && item.due.getTime() <= now.getTime() + MAX_FORECAST_DAYS * dayMs)
      .sort((left, right) => left.due.getTime() - right.due.getTime());
    if (list.length) due.set(profileId, list);
  }
  return due;
}
