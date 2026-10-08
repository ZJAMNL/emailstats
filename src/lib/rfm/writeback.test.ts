import { describe, expect, it } from "vitest";
import { clearedProfileFields, desiredProfileFields, planWriteBack } from "./writeback-plan";

const row = { segment: "at_risk", previousSegment: "loyal", r: 2, f: 4, m: 5, predictedClv: "184.37", probabilityAlive: 0.4321 };

describe("desiredProfileFields", () => {
  it("writes readable labels, the score and rounded predictions", () => {
    const { fields } = desiredProfileFields(row, "2026-10-09");
    expect(fields).toEqual({ RFM_Segment: "Risico", RFM_Score: "245", RFM_Vorig_Segment: "Loyale klanten", RFM_Klantwaarde: 184, RFM_Kans_Actief: 43, RFM_Gewijzigd: "2026-10-09" });
  });

  it("ignores small drift in value and probability, but not a segment change", () => {
    const base = desiredProfileFields(row, "2026-10-09").hash;
    expect(desiredProfileFields({ ...row, predictedClv: "182", probabilityAlive: 0.44 }, "2026-10-10").hash).toBe(base);
    // Crossing a €10 step counts as a change: at most one extra write, never a missed one.
    expect(desiredProfileFields({ ...row, predictedClv: "186" }, "2026-10-09").hash).not.toBe(base);
    expect(desiredProfileFields({ ...row, predictedClv: "260" }, "2026-10-09").hash).not.toBe(base);
    expect(desiredProfileFields({ ...row, segment: "cant_lose" }, "2026-10-09").hash).not.toBe(base);
  });

  it("handles customers without a prediction", () => {
    expect(desiredProfileFields({ ...row, predictedClv: null, probabilityAlive: null, previousSegment: null }, "2026-10-09").fields).toMatchObject({ RFM_Klantwaarde: 0, RFM_Kans_Actief: 0, RFM_Vorig_Segment: "" });
  });
});

describe("planWriteBack", () => {
  it("updates changed profiles and clears drop-outs once", () => {
    const plan = planWriteBack(new Map([["1", "a"], ["2", "b"], ["3", "c"]]), new Map([["1", "a"], ["2", "old"], ["4", "x"], ["5", "cleared"]]));
    expect(plan.update.sort()).toEqual(["2", "3"]);
    expect(plan.clear).toEqual(["4"]);
    expect(clearedProfileFields("2026-10-09").RFM_Segment).toBe("Geen recente aankoop");
  });
});
