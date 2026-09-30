import { describe, expect, it } from "vitest";
import {
  bandFor,
  CALIBRATION,
  calibrationTargetFor,
  checkCalibration,
  CRITERIA,
  CRITERION_KEYS,
  evidenceAppearsIn,
  GATE_MAX,
  points,
  probeQuestions,
  scoreFor,
  scoreLevels,
  suggestedRole,
  type Criteria,
  type CriterionKey,
  type Level,
} from "../lib/rubric";

const L = (a: number, b: number, c: number, d: number, e: number, f: number) =>
  ({ a, b, c, d, e, f }) as Record<CriterionKey, number>;

function criteria(levels: Record<CriterionKey, number>, fSpm = levels.f): Criteria {
  const c = (level: number) => ({ level: level as Level, evidence: "no evidence in CV", rationale: "" });
  return {
    a: c(levels.a),
    b: c(levels.b),
    c: c(levels.c),
    d: c(levels.d),
    e: c(levels.e),
    f_pm: c(levels.f),
    f_spm: c(fSpm),
  };
}

describe("weights", () => {
  it("sum to 100, with (a)+(b) = 45", () => {
    expect(CRITERION_KEYS.reduce((s, k) => s + CRITERIA[k].weight, 0)).toBe(100);
    expect(GATE_MAX).toBe(45);
  });

  it("give whole-number points at every level", () => {
    for (const k of CRITERION_KEYS) for (let l = 0; l <= 5; l++) expect(Number.isInteger(points(k, l))).toBe(true);
  });
});

describe("documented calibration scores are reachable", () => {
  it("Lavanya: 98, Advance", () => {
    const r = scoreLevels(L(5, 5, 5, 5, 4, 5), "PM");
    expect(r.total).toBe(98);
    expect(r.band).toBe("ADVANCE");
    expect(r.gated).toBe(false);
  });

  it("Vikram (one scoring path): 46, Hold", () => {
    const r = scoreLevels(L(2, 2, 3, 1, 2, 4), "PM");
    expect(r.total).toBe(46);
    expect(r.band).toBe("HOLD");
    expect(r.gated).toBe(false);
  });

  it("Preetham: 41, Hold, gate triggered", () => {
    const r = scoreLevels(L(1, 2, 4, 3, 2, 1), "PM");
    expect(r.total).toBe(41);
    expect(r.gateScore).toBe(13);
    expect(r.gated).toBe(true);
    expect(r.band).toBe("HOLD");
  });
});

describe("bands and gate", () => {
  it("uses the documented boundaries", () => {
    expect(bandFor(70, false)).toBe("ADVANCE");
    expect(bandFor(69, false)).toBe("HOLD");
    expect(bandFor(40, false)).toBe("HOLD");
    expect(bandFor(39, false)).toBe("DECLINE");
  });

  it("caps a gated candidate at Hold but never lifts a Decline", () => {
    expect(bandFor(85, true)).toBe("HOLD");
    expect(bandFor(39, true)).toBe("DECLINE");
  });

  it("triggers the gate below 15/45 only", () => {
    expect(scoreLevels(L(2, 1, 5, 5, 5, 5), "PM").gated).toBe(true); // 10 + 4 = 14
    expect(scoreLevels(L(3, 0, 5, 5, 5, 5), "PM").gated).toBe(false); // 15 + 0 = 15
  });
});

describe("role-specific fit", () => {
  it("scores PM and SPM separately and suggests the better one", () => {
    const c = criteria(L(4, 4, 4, 4, 4, 2), 5);
    expect(scoreFor(c, "SPM").total - scoreFor(c, "PM").total).toBe(9);
    expect(suggestedRole(c)).toBe("SPM");
  });
});

describe("probe questions", () => {
  it("probes the two weakest criteria, heavier first on ties", () => {
    const c = criteria(L(5, 1, 5, 5, 1, 5));
    expect(probeQuestions(c, "PM")).toEqual([CRITERIA.b.probe, CRITERIA.e.probe]);
  });
});

describe("evidence check", () => {
  const cv = "Sole PM responsible for dock scheduling — carrier integration.\nShipped 6 features across 12 months";

  it("accepts verbatim quotes, ignoring dashes, quotes and spacing", () => {
    expect(evidenceAppearsIn("Sole PM responsible for dock scheduling - carrier integration", cv)).toBe(true);
    expect(evidenceAppearsIn('"Shipped 6 features   across 12 months"', cv)).toBe(true);
  });

  it("accepts multiple fragments joined with ...", () => {
    expect(evidenceAppearsIn("Sole PM responsible ... Shipped 6 features", cv)).toBe(true);
  });

  it("rejects quotes that are not in the CV", () => {
    expect(evidenceAppearsIn("Led a team of 40 engineers", cv)).toBe(false);
  });

  it("accepts the explicit no-evidence marker", () => {
    expect(evidenceAppearsIn("no evidence in CV", cv)).toBe(true);
  });
});

describe("calibration checks", () => {
  it("covers all 8 hires and matches by file name", () => {
    expect(CALIBRATION).toHaveLength(8);
    expect(calibrationTargetFor("cv_07_lavanya_iyer.docx")?.score).toBe(98);
    expect(calibrationTargetFor("someone_else.pdf")).toBeUndefined();
  });

  it("passes within tolerance and fails outside it", () => {
    const t = calibrationTargetFor("vikram.docx")!;
    expect(checkCalibration(t, scoreLevels(L(2, 2, 3, 1, 2, 4), "PM")).pass).toBe(true);
    const far = checkCalibration(t, scoreLevels(L(5, 5, 5, 5, 5, 5), "PM"));
    expect(far.pass).toBe(false);
    expect(far.reasons.length).toBeGreaterThan(0);
  });

  it("requires the gate where the rubric says so", () => {
    const t = calibrationTargetFor("preetham.docx")!;
    expect(checkCalibration(t, scoreLevels(L(3, 1, 4, 3, 2, 1), "PM")).reasons).toContain("gate should trigger");
  });

  it("only requires 'not Advance' for undocumented Meets hires", () => {
    const t = calibrationTargetFor("rahul.docx")!;
    expect(checkCalibration(t, scoreLevels(L(0, 3, 2, 4, 1, 1), "PM")).pass).toBe(true);
    expect(checkCalibration(t, scoreLevels(L(5, 5, 5, 5, 5, 5), "PM")).pass).toBe(false);
  });
});

describe("Gemini response schema", () => {
  it("is plain JSON Schema with the rubric fields and no $schema marker", async () => {
    const { jsonSchemaFor, ScoreSchema } = await import("../lib/llm");
    const s = jsonSchemaFor(ScoreSchema) as { $schema?: string; properties: Record<string, unknown>; required: string[] };
    expect(s.$schema).toBeUndefined();
    expect(s.required).toEqual(expect.arrayContaining(["a", "b", "c", "d", "e", "f_pm", "f_spm", "summary"]));
  });
});

describe("live-calibrated Vikram profile", () => {
  it("no ops + team-only process paperwork for (b) lands near 46 and trips the gate", () => {
    const r = scoreLevels(L(0, 3, 4, 2, 4, 3), "PM");
    expect(r.total).toBe(47);
    expect(r.gated).toBe(true);
    expect(r.band).toBe("HOLD");
    expect(checkCalibration(calibrationTargetFor("vikram.docx")!, r).pass).toBe(true);
  });
});
