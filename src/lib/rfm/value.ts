import { rfmSegments, type RfmSegmentKey } from "./segments";

type ScoredCustomer = { segment: RfmSegmentKey; orderCount: number; revenue: number; recencyDays: number };

export type RfmSegmentSummary = {
  key: RfmSegmentKey;
  customers: number;
  orders: number;
  revenue: number;
  avgOrderValue: number;
  ordersPerYear: number;
  avgRecencyDays: number;
  clv: number;
};

export type RfmValueSummary = {
  segments: RfmSegmentSummary[];
  customers: number;
  activeCustomers: number;
  orders: number;
  revenue: number;
  prospects: number;
  /** Share of customers that did not buy in the last 12 months; the basis for the expected lifespan. */
  churnRate: number;
  lifespanYears: number;
  /** Share of last year's first-time buyers relative to everyone who could have converted. */
  conversionRate: number;
  activeValue: number;
  prospectValue: number;
  databaseValue: number;
  /** Yearly revenue that inactive segments used to bring in: the value to win back. */
  dormantYearlyRevenue: number;
  /** Revenue share of the top 20% customers by revenue. */
  topCustomerRevenueShare: number;
};

const minLifespanYears = 1;
const maxLifespanYears = 5;

export function summarizeRfm(customers: ScoredCustomer[], options: { prospects: number; windowMonths: number; marginPercent: number }): RfmValueSummary {
  const years = options.windowMonths / 12;
  const margin = options.marginPercent / 100;
  const churned = customers.filter((customer) => customer.recencyDays > 365).length;
  const churnRate = customers.length ? churned / customers.length : 0;
  const lifespanYears = clamp(churnRate > 0 ? 1 / churnRate : maxLifespanYears, minLifespanYears, maxLifespanYears);

  const segments = rfmSegments.map((definition) => {
    const members = customers.filter((customer) => customer.segment === definition.key);
    const orders = sum(members.map((member) => member.orderCount));
    const revenue = sum(members.map((member) => member.revenue));
    const avgOrderValue = orders ? revenue / orders : 0;
    const ordersPerYear = members.length ? orders / members.length / years : 0;
    return {
      key: definition.key,
      customers: members.length,
      orders,
      revenue: round(revenue),
      avgOrderValue: round(avgOrderValue),
      ordersPerYear: round(ordersPerYear),
      avgRecencyDays: members.length ? Math.round(sum(members.map((member) => member.recencyDays)) / members.length) : 0,
      clv: round(avgOrderValue * ordersPerYear * lifespanYears * margin),
    };
  });

  const activeKeys = new Set(rfmSegments.filter((segment) => segment.active).map((segment) => segment.key));
  const activeSegments = segments.filter((segment) => activeKeys.has(segment.key));
  const activeValue = sum(activeSegments.map((segment) => segment.clv * segment.customers));

  const firstTimeBuyers = customers.filter((customer) => customer.orderCount === 1 && customer.recencyDays <= 365);
  const conversionBase = options.prospects + firstTimeBuyers.length;
  const conversionRate = conversionBase ? firstTimeBuyers.length / conversionBase : 0;
  const firstYearValue = firstTimeBuyers.length ? (sum(firstTimeBuyers.map((buyer) => buyer.revenue)) / firstTimeBuyers.length) * margin : 0;
  const prospectValue = options.prospects * conversionRate * firstYearValue;

  const revenues = customers.map((customer) => customer.revenue).sort((a, b) => b - a);
  const totalRevenue = sum(revenues);
  const topCount = Math.ceil(revenues.length * 0.2);

  return {
    segments,
    customers: customers.length,
    activeCustomers: sum(activeSegments.map((segment) => segment.customers)),
    orders: sum(segments.map((segment) => segment.orders)),
    revenue: round(totalRevenue),
    prospects: options.prospects,
    churnRate,
    lifespanYears: round(lifespanYears),
    conversionRate,
    activeValue: round(activeValue),
    prospectValue: round(prospectValue),
    databaseValue: round(activeValue + prospectValue),
    dormantYearlyRevenue: round(sum(segments.filter((segment) => !activeKeys.has(segment.key)).map((segment) => segment.revenue)) / years),
    topCustomerRevenueShare: totalRevenue > 0 ? sum(revenues.slice(0, topCount)) / totalRevenue : 0,
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
