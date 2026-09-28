// Kargo Hiring Rubric v1, the deterministic part.
// The model scores each dimension 0-3 and quotes evidence. Everything that is
// arithmetic or policy (weights, DNA score, band, probes) happens here, in code,
// so that it is reproducible and auditable.

export type DimensionKey = "D1" | "D2" | "D3" | "D4" | "D5";
export type Role = "PM" | "SPM";
export type Band = "SHORTLIST" | "REVIEW" | "DECLINE";
export type CheckResult = "PASS" | "FLAG" | "UNCLEAR";

export interface Layer1Check {
  check: string;
  result: CheckResult;
  reason: string;
}

export interface DimensionScore {
  score: 0 | 1 | 2 | 3;
  evidence: string;
  rationale: string;
  /** true when the quoted evidence was found verbatim in the anonymised CV */
  evidence_verified?: boolean;
}

export type Dimensions = Record<DimensionKey, DimensionScore>;

export const DIMENSIONS: Record<
  DimensionKey,
  { name: string; weight: number; probe: string }
> = {
  D1: {
    name: "Ground-level operations proximity",
    weight: 30,
    probe: "Walk me through a freight forwarder's worst morning. What breaks first?",
  },
  D2: {
    name: "Built the fix nobody asked for, and others adopted it",
    weight: 20,
    probe: "Tell me about something you built that nobody asked for. Who uses it now?",
  },
  D3: {
    name: "Owned outcomes without a safety net",
    weight: 20,
    probe: "What's a call you made with nobody above you to check it? How did it go?",
  },
  D4: {
    name: "Learns out loud from failure",
    weight: 15,
    probe: "What's something you shipped or pushed for that you later killed or regretted?",
  },
  D5: {
    name: "Steady under operational pressure",
    weight: 15,
    probe: "Describe the worst live incident you've handled, hour by hour.",
  },
};

export const DIMENSION_KEYS = Object.keys(DIMENSIONS) as DimensionKey[];

export const LAYER1_CHECKS: Record<Role, { check: string; label: string }[]> = {
  PM: [
    { check: "L1.1", label: "Experience (2-4 yrs PM, or PM + product ownership in ops)" },
    { check: "L1.2", label: "Shipping cadence (ships and kills/iterates in short cycles)" },
    { check: "L1.3", label: "Location (Mumbai or willing to relocate)" },
  ],
  SPM: [
    { check: "L1.1", label: "Experience (5-8 yrs PM, owned an area with no senior PM layer)" },
    { check: "L1.2", label: "Scope (platform, integration or data layers, complex environments)" },
    { check: "L1.3", label: "Early-stage (early-stage company or unwritten-rules environment)" },
    { check: "L1.4", label: "Location (Mumbai or willing to relocate)" },
  ],
};

export const ROLE_TITLES: Record<Role, string> = {
  PM: "Product Manager",
  SPM: "Senior Product Manager",
};

/** DNA score = sum of weight x (score / 3), rounded. Range 0-100. */
export function dnaScore(dims: Dimensions): number {
  const total = DIMENSION_KEYS.reduce(
    (sum, k) => sum + DIMENSIONS[k].weight * (dims[k].score / 3),
    0,
  );
  return Math.round(total);
}

export function bandFor(score: number): Band {
  if (score >= 75) return "SHORTLIST";
  if (score >= 50) return "REVIEW";
  return "DECLINE";
}

/**
 * The two probe questions for the candidate's weakest dimensions.
 * Ties are broken by weight (the heavier dimension is probed first), then by order.
 */
export function probeQuestions(dims: Dimensions): string[] {
  return [...DIMENSION_KEYS]
    .sort(
      (a, b) =>
        dims[a].score - dims[b].score ||
        DIMENSIONS[b].weight - DIMENSIONS[a].weight ||
        a.localeCompare(b),
    )
    .slice(0, 2)
    .map((k) => DIMENSIONS[k].probe);
}

/** Count of FLAG results, used to pick which role to invite for when unclear. */
export function flagCount(checks: Layer1Check[] | null | undefined): number {
  return (checks ?? []).filter((c) => c.result === "FLAG").length;
}

/**
 * Bias guardrail 5: "every score must quote the CV line it is based on".
 * We check that the quote actually appears in the anonymised CV
 * (whitespace/punctuation-insensitive) so fabricated evidence is visible to Arjun.
 */
export function evidenceAppearsIn(evidence: string, cv: string): boolean {
  if (/^no evidence in cv$/i.test(evidence.trim())) return true;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[‘’“”"'`]/g, "")
      .replace(/[–—-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const haystack = norm(cv);
  // The model may join several fragments with "..." / " | ". Each fragment must be present.
  const fragments = evidence
    .split(/\s*(?:\.\.\.|…|\s\|\s)\s*/)
    .map(norm)
    .filter((f) => f.length >= 8);
  if (fragments.length === 0) return false;
  return fragments.every((f) => haystack.includes(f));
}
