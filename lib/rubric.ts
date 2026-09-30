// Kargo Hiring Rubric v2, the deterministic part (see RUBRIC.md).
// The model assigns each criterion a level 0-5 and quotes evidence. Everything
// that is arithmetic or policy (points, gate, totals, bands, probes) happens
// here, in code, so it is reproducible and auditable.

export const RUBRIC_VERSION = "v2";

export type CriterionKey = "a" | "b" | "c" | "d" | "e" | "f";
export type Role = "PM" | "SPM";
export type Band = "ADVANCE" | "HOLD" | "DECLINE";
export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export interface CriterionScore {
  level: Level;
  evidence: string;
  rationale: string;
  /** true when the quoted evidence was found verbatim in the anonymised CV */
  evidence_verified?: boolean;
}

/** a-e are role-independent; f (role-scope fit) is scored separately for each role. */
export interface Criteria {
  a: CriterionScore;
  b: CriterionScore;
  c: CriterionScore;
  d: CriterionScore;
  e: CriterionScore;
  f_pm: CriterionScore;
  f_spm: CriterionScore;
}

export const CRITERIA: Record<CriterionKey, { name: string; short: string; weight: number; probe: string }> = {
  a: {
    name: "Operational domain fluency",
    short: "Ops",
    weight: 25,
    probe: "Walk me through a freight forwarder's worst morning. What breaks first, and who feels it?",
  },
  b: {
    name: "Zero-to-one ownership",
    short: "0→1",
    weight: 20,
    probe: "Tell me about something you built from nothing that nobody asked for. Who uses it now?",
  },
  c: {
    name: "Shipped-and-measured outcomes",
    short: "Shipped",
    weight: 15,
    probe: "Pick one thing you shipped. What number moved, how did you measure it, and what did you kill or change because of the data?",
  },
  d: {
    name: "Independent judgment",
    short: "Judgment",
    weight: 15,
    probe: "What's a call you made with nobody above you to check it? How did it go, and what would you do differently?",
  },
  e: {
    name: "Multiplier effect",
    short: "Multiplier",
    weight: 10,
    probe: "What's something you created that other people or teams now work from? How did it spread?",
  },
  f: {
    name: "Role-scope fit",
    short: "Fit",
    weight: 15,
    probe: "This role owns the roadmap with no PM layer above you. Which part of that scope have you already done, and which part would be new?",
  },
};

export const CRITERION_KEYS = Object.keys(CRITERIA) as CriterionKey[];
export const MAX_LEVEL = 5;

/** Gate: if (a) + (b) points are below this (out of 45), the candidate cannot Advance. */
export const GATE_THRESHOLD = 15;
export const GATE_MAX = CRITERIA.a.weight + CRITERIA.b.weight; // 45

export const ADVANCE_AT = 70;
export const HOLD_AT = 40;

export const ROLE_TITLES: Record<Role, string> = {
  PM: "Product Manager",
  SPM: "Senior Product Manager",
};

export const BAND_LABELS: Record<Band, string> = {
  ADVANCE: "Advance",
  HOLD: "Hold",
  DECLINE: "Decline",
};

/** Points for one criterion: weight x level / 5. All weights are multiples of 5, so points are integers. */
export function points(key: CriterionKey, level: number): number {
  return (CRITERIA[key].weight * level) / MAX_LEVEL;
}

/** The six levels that apply for a given role (f is role-specific). */
export function levelsFor(criteria: Criteria, role: Role): Record<CriterionKey, number> {
  return {
    a: criteria.a.level,
    b: criteria.b.level,
    c: criteria.c.level,
    d: criteria.d.level,
    e: criteria.e.level,
    f: role === "PM" ? criteria.f_pm.level : criteria.f_spm.level,
  };
}

export interface RoleResult {
  role: Role;
  points: Record<CriterionKey, number>;
  total: number;
  gateScore: number;
  gated: boolean;
  band: Band;
}

export function bandFor(total: number, gated: boolean): Band {
  if (total < HOLD_AT) return "DECLINE";
  if (gated) return "HOLD"; // capped: can never Advance, but a Decline stays a Decline
  return total >= ADVANCE_AT ? "ADVANCE" : "HOLD";
}

export function scoreLevels(levels: Record<CriterionKey, number>, role: Role): RoleResult {
  const pts = {} as Record<CriterionKey, number>;
  for (const k of CRITERION_KEYS) pts[k] = points(k, levels[k]);
  const total = Math.round(CRITERION_KEYS.reduce((s, k) => s + pts[k], 0));
  const gateScore = pts.a + pts.b;
  const gated = gateScore < GATE_THRESHOLD;
  return { role, points: pts, total, gateScore, gated, band: bandFor(total, gated) };
}

export function scoreFor(criteria: Criteria, role: Role): RoleResult {
  return scoreLevels(levelsFor(criteria, role), role);
}

/**
 * The two probe questions for the candidate's weakest criteria for this role.
 * "Weakest" = lowest share of the criterion's max; ties go to the heavier criterion.
 */
export function probeQuestions(criteria: Criteria, role: Role): string[] {
  const levels = levelsFor(criteria, role);
  return [...CRITERION_KEYS]
    .sort(
      (x, y) =>
        levels[x] - levels[y] ||
        CRITERIA[y].weight - CRITERIA[x].weight ||
        x.localeCompare(y),
    )
    .slice(0, 2)
    .map((k) => CRITERIA[k].probe);
}

/** For an UNCLEAR application, which role fits better (used only as a suggestion to Arjun). */
export function suggestedRole(criteria: Criteria): Role {
  const pm = scoreFor(criteria, "PM").total;
  const spm = scoreFor(criteria, "SPM").total;
  return spm > pm ? "SPM" : "PM";
}

/**
 * Every score must quote the CV line it is based on. Check the quote really
 * appears in the anonymised CV (whitespace/punctuation-insensitive) so a
 * fabricated quote is visible to Arjun.
 */
export function evidenceAppearsIn(evidence: string, cv: string): boolean {
  if (/^no evidence in cv\.?$/i.test(evidence.trim())) return true;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[‘’“”"'`]/g, "")
      .replace(/[–—-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const haystack = norm(cv);
  // The model may join several fragments with "..." or " | ". Each fragment must be present.
  const fragments = evidence
    .split(/\s*(?:\.\.\.|…|\s\|\s)\s*/)
    .map(norm)
    .filter((f) => f.length >= 8);
  if (fragments.length === 0) return false;
  return fragments.every((f) => haystack.includes(f));
}

// ---------------- Calibration (RUBRIC.md §6) ----------------

export interface CalibrationTarget {
  key: string;
  label: string;
  outcome: "Exceeds" | "Meets" | "Below";
  /** Exact score target where the rubric documents one; otherwise only the band is checked. */
  score?: number;
  band: Band | "NOT_ADVANCE";
  gated?: boolean;
}

export const CALIBRATION_TOLERANCE = 5;

export const CALIBRATION: CalibrationTarget[] = [
  { key: "lavanya", label: "Lavanya Iyer (PM)", outcome: "Exceeds", score: 98, band: "ADVANCE", gated: false },
  { key: "vikram", label: "Vikram Nair (PM)", outcome: "Meets", score: 46, band: "HOLD", gated: false },
  { key: "preetham", label: "Preetham Rao (Backend Eng)", outcome: "Below", score: 41, band: "HOLD", gated: true },
  { key: "rohan", label: "Rohan Desai (Head of Eng)", outcome: "Exceeds", band: "ADVANCE" },
  { key: "sunita", label: "Sunita Krishnamurthy (Ops Lead)", outcome: "Exceeds", band: "ADVANCE" },
  { key: "aditya", label: "Aditya Shetty (Sales Lead)", outcome: "Exceeds", band: "ADVANCE" },
  { key: "meghna", label: "Meghna Tiwari (CSM)", outcome: "Exceeds", band: "ADVANCE" },
  { key: "rahul", label: "Rahul Bose (Growth)", outcome: "Meets", band: "NOT_ADVANCE" },
];

export function calibrationTargetFor(fileName: string): CalibrationTarget | undefined {
  const f = fileName.toLowerCase();
  return CALIBRATION.find((t) => f.includes(t.key));
}

export interface CalibrationCheck {
  pass: boolean;
  reasons: string[];
}

/** Calibration hires are scored as PM (the role the rubric's documented scores use). */
export function checkCalibration(target: CalibrationTarget, result: RoleResult): CalibrationCheck {
  const reasons: string[] = [];
  if (target.score !== undefined && Math.abs(result.total - target.score) > CALIBRATION_TOLERANCE) {
    reasons.push(`score ${result.total}, expected ${target.score} ±${CALIBRATION_TOLERANCE}`);
  }
  if (target.band === "NOT_ADVANCE") {
    if (result.band === "ADVANCE") reasons.push("should not Advance");
  } else if (result.band !== target.band) {
    reasons.push(`band ${result.band}, expected ${target.band}`);
  }
  if (target.gated !== undefined && result.gated !== target.gated) {
    reasons.push(target.gated ? "gate should trigger" : "gate should not trigger");
  }
  return { pass: reasons.length === 0, reasons };
}
