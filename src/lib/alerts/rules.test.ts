import { describe, expect, it } from "vitest";
import { sumByDay } from "../snapshots";
import { alertRules, alertRulesByKey, isInCooldown, type AlertCampaign, type AlertContext } from "./rules";
import { cleanRecipients, readAlertRules, validateAlertSettings } from "./settings";

const now = new Date("2026-10-09T06:00:00Z");
const daysAgo = (days: number, hours = 0) => new Date(now.getTime() - days * 86_400_000 - hours * 3_600_000);
/** Daily snapshots, newest first: counts[0] is today. */
const series = (...counts: number[]) => counts.map((profileCount, index) => ({ measuredAt: daysAgo(index, 2), profileCount }));

function context(overrides: Partial<AlertContext> = {}): AlertContext {
  return {
    now,
    modules: { databaseStats: true, campaignStats: true },
    selections: [],
    total: null,
    ratios: [],
    campaigns: [],
    lastCampaignAt: daysAgo(1),
    rfm: { enabled: false, lastRunAt: null, lastRunStatus: null, snapshots: [] },
    copernica: { connected: true, lastSyncedAt: daysAgo(0, 2) },
    ...overrides,
  };
}

function campaign(overrides: Partial<AlertCampaign>): AlertCampaign {
  return { id: "c1", name: "Nieuwsbrief", sentAt: daysAgo(2), sentCount: 1000, openCount: 300, clickCount: 30, bounceCount: 0, unsubscribeCount: 0, complaintCount: 0, ...overrides };
}

const defaults = readAlertRules({});
const run = (key: string, ctx: AlertContext) => alertRulesByKey.get(key)!.evaluate(ctx, defaults[key].params);

describe("database rules", () => {
  it("flags a selection that dropped more than 5% since the previous measurement", () => {
    expect(run("selection_drop", context({ selections: [{ id: "s1", name: "Opt-ins", snapshots: series(940, 1000) }] }))).toHaveLength(1);
    expect(run("selection_drop", context({ selections: [{ id: "s1", name: "Opt-ins", snapshots: series(960, 1000) }] }))).toHaveLength(0);
  });

  it("ignores small selections and stale measurements", () => {
    expect(run("selection_drop", context({ selections: [{ id: "s1", name: "Klein", snapshots: series(10, 40) }] }))).toHaveLength(0);
    const stale = series(500, 1000).map((snapshot) => ({ ...snapshot, measuredAt: new Date(snapshot.measuredAt.getTime() - 5 * 86_400_000) }));
    expect(run("selection_drop", context({ selections: [{ id: "s1", name: "Oud", snapshots: stale }] }))).toHaveLength(0);
  });

  it("flags a suspicious jump", () => {
    expect(run("selection_spike", context({ selections: [{ id: "s1", name: "Alle", snapshots: series(1300, 1000) }] }))).toHaveLength(1);
    expect(run("selection_spike", context({ selections: [{ id: "s1", name: "Alle", snapshots: series(1100, 1000) }] }))).toHaveLength(0);
  });

  it("flags a database that shrank more than 2% in a week", () => {
    expect(run("database_shrink_week", context({ total: { name: "Totaal", snapshots: series(970, 980, 985, 990, 995, 998, 999, 1000) } }))).toHaveLength(1);
    expect(run("database_shrink_week", context({ total: { name: "Totaal", snapshots: series(990, 992, 994, 996, 997, 998, 999, 1000) } }))).toHaveLength(0);
  });

  it("flags a ratio that fell more than 2 points in a week", () => {
    const base = series(...Array(8).fill(1000));
    expect(run("ratio_drop", context({ ratios: [{ id: "r", name: "Opt-ins", baseName: "Alle", part: series(470, 480, 480, 490, 490, 495, 500, 500), base }] }))).toHaveLength(1);
    expect(run("ratio_drop", context({ ratios: [{ id: "r", name: "Opt-ins", baseName: "Alle", part: series(490, 492, 494, 496, 497, 498, 499, 500), base }] }))).toHaveLength(0);
  });

  it("skips database rules when database statistics are off", () => {
    expect(run("selection_drop", context({ modules: { databaseStats: false, campaignStats: true }, selections: [{ id: "s1", name: "Opt-ins", snapshots: series(500, 1000) }] }))).toHaveLength(0);
  });
});

describe("campaign rules", () => {
  const history = Array.from({ length: 4 }, (_, index) => campaign({ id: `h${index}`, sentAt: daysAgo(10 + index), openCount: 300, clickCount: 30 }));

  it("flags a low open rate below the minimum or far below average", () => {
    expect(run("low_open_rate", context({ campaigns: [...history, campaign({ openCount: 120 })] }))).toHaveLength(1);
    // 20% is above the 15% minimum but more than 25% under the 30% average.
    expect(run("low_open_rate", context({ campaigns: [...history, campaign({ openCount: 200 })] }))).toHaveLength(1);
    expect(run("low_open_rate", context({ campaigns: [...history, campaign({ openCount: 280 })] }))).toHaveLength(0);
  });

  it("only judges mailings sent 24 to 72 hours ago", () => {
    expect(run("low_open_rate", context({ campaigns: [campaign({ openCount: 10, sentAt: daysAgo(0, 5) })] }))).toHaveLength(0);
    expect(run("low_open_rate", context({ campaigns: [campaign({ openCount: 10, sentAt: daysAgo(5) })] }))).toHaveLength(0);
  });

  it("flags a low click rate", () => {
    expect(run("low_click_rate", context({ campaigns: [campaign({ clickCount: 5 })] }))).toHaveLength(1);
    expect(run("low_click_rate", context({ campaigns: [campaign({ clickCount: 30 })] }))).toHaveLength(0);
  });

  it("flags when no mailing went out for too long", () => {
    expect(run("no_recent_campaign", context({ lastCampaignAt: daysAgo(20) }))).toHaveLength(1);
    expect(run("no_recent_campaign", context({ lastCampaignAt: daysAgo(10) }))).toHaveLength(0);
  });
});

describe("deliverability rules", () => {
  it.each([
    ["high_bounce", { bounceCount: 30 }, { bounceCount: 15 }],
    ["high_unsubscribe", { unsubscribeCount: 8 }, { unsubscribeCount: 4 }],
    ["spam_complaints", { complaintCount: 1 }, { complaintCount: 0 }],
  ] as const)("%s fires above its threshold only", (key, above, below) => {
    expect(run(key, context({ campaigns: [campaign(above)] }))).toHaveLength(1);
    expect(run(key, context({ campaigns: [campaign(below)] }))).toHaveLength(0);
  });

  it("ignores mailings with too few recipients", () => {
    expect(run("high_bounce", context({ campaigns: [campaign({ sentCount: 50, bounceCount: 20 })] }))).toHaveLength(0);
  });
});

describe("RFM and technical rules", () => {
  const rfm = (atRiskThen: number, atRiskNow: number) => ({
    enabled: true, lastRunAt: daysAgo(0), lastRunStatus: "ok",
    snapshots: [
      { measuredAt: daysAgo(30), segment: "at_risk", customers: atRiskThen },
      { measuredAt: daysAgo(30), segment: "champions", customers: 100 },
      { measuredAt: daysAgo(0), segment: "at_risk", customers: atRiskNow },
      { measuredAt: daysAgo(0), segment: "champions", customers: 85 },
    ],
  });

  it("flags growth of customers at risk and fewer champions", () => {
    expect(run("rfm_at_risk_growth", context({ rfm: rfm(100, 120) }))).toHaveLength(1);
    expect(run("rfm_at_risk_growth", context({ rfm: rfm(100, 105) }))).toHaveLength(0);
    expect(run("rfm_champions_drop", context({ rfm: rfm(100, 100) }))).toHaveLength(1);
  });

  it("flags a stale sync and a failed RFM run", () => {
    expect(run("sync_stale", context({ copernica: { connected: true, lastSyncedAt: daysAgo(2) } }))).toHaveLength(1);
    expect(run("sync_stale", context())).toHaveLength(0);
    expect(run("rfm_failed", context({ rfm: { enabled: true, lastRunAt: daysAgo(0), lastRunStatus: "Copernica gaf een fout", snapshots: [] } }))).toHaveLength(1);
    expect(run("rfm_failed", context({ rfm: { enabled: true, lastRunAt: daysAgo(0), lastRunStatus: "ok", snapshots: [] } }))).toHaveLength(0);
  });
});

describe("cooldown", () => {
  it("blocks a repeat within the cooldown and campaign alerts for good", () => {
    const weekly = alertRulesByKey.get("selection_drop")!;
    expect(isInCooldown(weekly, null, now)).toBe(false);
    expect(isInCooldown(weekly, daysAgo(3), now)).toBe(true);
    // The cron starts a few seconds later or earlier each day; a week later must alert again.
    expect(isInCooldown(weekly, new Date(daysAgo(7).getTime() + 30_000), now)).toBe(false);
    expect(isInCooldown(alertRulesByKey.get("high_bounce")!, daysAgo(60), now)).toBe(true);
  });
});

describe("settings", () => {
  it("fills in defaults and clamps thresholds", () => {
    const rules = readAlertRules({ selection_drop: { enabled: false, params: { percent: 500 } } });
    expect(rules.selection_drop).toEqual({ enabled: false, params: { percent: 90 } });
    expect(rules.no_recent_campaign.enabled).toBe(false);
    expect(Object.keys(rules)).toHaveLength(alertRules.length);
  });

  it("cleans recipients and rejects invalid ones", () => {
    expect(cleanRecipients([" A@Example.nl ", "a@example.nl", ""])).toEqual(["a@example.nl"]);
    expect(cleanRecipients(["geen-adres"])).toBeNull();
    expect(validateAlertSettings({ enabled: true, recipients: [] })).toMatchObject({ ok: false });
    expect(validateAlertSettings({ enabled: true, recipients: ["x@example.nl"] })).toMatchObject({ ok: true });
  });

  it("only sums days on which every selection was measured", () => {
    const a = series(100, 100);
    const b = series(50);
    expect(sumByDay([a, b])).toEqual([{ measuredAt: new Date(Math.floor(a[0].measuredAt.getTime() / 86_400_000) * 86_400_000), profileCount: 150 }]);
  });
});
