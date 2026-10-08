import { clvInputs, expectedOrderValue, expectedPurchases, fitBgNbd, fitGammaGamma, probabilityAlive, type BgNbdParams, type GammaGammaParams } from "./clv";
import { rfmSegments, type RfmSegmentKey } from "./segments";

export const clvHorizonWeeks = 52;
const minCustomers = 200;
const minRepeatCustomers = 50;

export type ClvSummary =
  | { status: "insufficient"; message: string; customers: number; repeatCustomers: number }
  | {
      status: "ok";
      customers: number;
      repeatCustomers: number;
      params: { bgNbd: BgNbdParams; gammaGamma: GammaGammaParams };
      /** Predicted value of all known buyers over the next 12 months, after margin. */
      totalClv: number;
      expectedOrders: number;
      prospects: number;
      prospectValue: number;
      customerEquity: number;
      /** Share of the predicted value held by the top 10% of customers. */
      top10Share: number;
      populationOrderValue: number;
      segments: { key: RfmSegmentKey; customers: number; totalClv: number; avgClv: number; avgProbabilityAlive: number }[];
      /** Buyers whose last order lies outside the RFM window: little value left, but not zero. */
      outsideWindow: { customers: number; totalClv: number };
      aliveBands: { label: string; customers: number }[];
    };

export type ProfilePrediction = { clv: number; expectedOrders: number; probabilityAlive: number };

export function predictClv(
  orders: { profileId: string; date: Date; amount: number }[],
  segmentByProfile: Map<string, RfmSegmentKey>,
  options: { now: Date; marginPercent: number; totalProfiles: number; prospectValuePerProfile: number },
): { summary: ClvSummary; perProfile: Map<string, ProfilePrediction> } {
  const inputs = clvInputs(orders, options.now);
  const repeatCustomers = inputs.filter((input) => input.x > 0).length;
  const perProfile = new Map<string, ProfilePrediction>();
  if (inputs.length < minCustomers || repeatCustomers < minRepeatCustomers) {
    return { perProfile, summary: { status: "insufficient", customers: inputs.length, repeatCustomers, message: `Voor een betrouwbare voorspelling zijn minstens ${minCustomers} kopers nodig, waarvan ${minRepeatCustomers} met een herhaalaankoop. Nu: ${inputs.length} kopers, ${repeatCustomers} met een herhaalaankoop.` } };
  }

  const bgNbd = fitBgNbd(inputs);
  const gammaGamma = fitGammaGamma(inputs);
  if (!gammaGamma) {
    return { perProfile, summary: { status: "insufficient", customers: inputs.length, repeatCustomers, message: "De orderbedragen laten geen betrouwbare schatting van de besteding per order toe (te weinig klanten met twee of meer betaalde orders)." } };
  }

  const margin = options.marginPercent / 100;
  for (const input of inputs) {
    const expected = expectedPurchases(bgNbd, input, clvHorizonWeeks);
    perProfile.set(input.profileId, {
      clv: Math.round(expected * expectedOrderValue(gammaGamma, input) * margin * 100) / 100,
      expectedOrders: expected,
      probabilityAlive: probabilityAlive(bgNbd, input),
    });
  }

  const predictions = [...perProfile.entries()];
  const values = predictions.map(([, prediction]) => prediction.clv).sort((left, right) => right - left);
  const totalClv = sum(values);
  const prospects = Math.max(0, options.totalProfiles - inputs.length);
  const prospectValue = prospects * options.prospectValuePerProfile;

  const segments = rfmSegments.map((segment) => {
    const members = predictions.filter(([profileId]) => segmentByProfile.get(profileId) === segment.key).map(([, prediction]) => prediction);
    const total = sum(members.map((member) => member.clv));
    return {
      key: segment.key,
      customers: members.length,
      totalClv: round(total),
      avgClv: members.length ? round(total / members.length) : 0,
      avgProbabilityAlive: members.length ? sum(members.map((member) => member.probabilityAlive)) / members.length : 0,
    };
  });
  const outside = predictions.filter(([profileId]) => !segmentByProfile.has(profileId)).map(([, prediction]) => prediction);
  const bands = [
    { label: "Vrijwel zeker actief (≥ 80%)", test: (value: number) => value >= 0.8 },
    { label: "Waarschijnlijk actief (50–80%)", test: (value: number) => value >= 0.5 && value < 0.8 },
    { label: "Twijfelachtig (20–50%)", test: (value: number) => value >= 0.2 && value < 0.5 },
    { label: "Waarschijnlijk afgehaakt (< 20%)", test: (value: number) => value < 0.2 },
  ];

  return {
    perProfile,
    summary: {
      status: "ok",
      customers: inputs.length,
      repeatCustomers,
      params: { bgNbd, gammaGamma },
      totalClv: round(totalClv),
      expectedOrders: round(sum(predictions.map(([, prediction]) => prediction.expectedOrders))),
      prospects,
      prospectValue: round(prospectValue),
      customerEquity: round(totalClv + prospectValue),
      top10Share: totalClv > 0 ? sum(values.slice(0, Math.ceil(values.length * 0.1))) / totalClv : 0,
      populationOrderValue: round((gammaGamma.p * gammaGamma.v) / (gammaGamma.q - 1)),
      segments,
      outsideWindow: { customers: outside.length, totalClv: round(sum(outside.map((prediction) => prediction.clv))) },
      aliveBands: bands.map((band) => ({ label: band.label, customers: predictions.filter(([, prediction]) => band.test(prediction.probabilityAlive)).length })),
    },
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
