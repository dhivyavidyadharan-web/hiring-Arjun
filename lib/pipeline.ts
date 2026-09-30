import { extractCandidate, MODEL, scoreCandidate, writeBrief, type Scored } from "./llm";
import { finaliseInvite, inviteSubject, rejectBody, rejectSubject } from "./emails";
import { redact } from "./redact";
import {
  evidenceAppearsIn,
  probeQuestions,
  ROLE_TITLES,
  RUBRIC_VERSION,
  scoreFor,
  type Band,
  type Criteria,
  type CriterionScore,
  type Level,
  type Role,
} from "./rubric";

/** Attach the evidence check to each criterion. */
export function toCriteria(scored: Scored, anonymizedCv: string): Criteria {
  const one = (c: Scored["a"]): CriterionScore => ({
    level: c.level as Level,
    evidence: c.evidence,
    rationale: c.rationale,
    evidence_verified: evidenceAppearsIn(c.evidence, anonymizedCv),
  });
  return {
    a: one(scored.a),
    b: one(scored.b),
    c: one(scored.c),
    d: one(scored.d),
    e: one(scored.e),
    f_pm: one(scored.f_pm),
    f_spm: one(scored.f_spm),
  };
}

export interface ScoreFields {
  criteria: Criteria;
  score_pm: number;
  score_spm: number;
  band_pm: Band;
  band_spm: Band;
  gated: boolean;
}

export function scoreFields(criteria: Criteria): ScoreFields {
  const pm = scoreFor(criteria, "PM");
  const spm = scoreFor(criteria, "SPM");
  return {
    criteria,
    score_pm: pm.total,
    score_spm: spm.total,
    band_pm: pm.band,
    band_spm: spm.band,
    gated: pm.gated, // the gate only uses (a)+(b), so it is the same for both roles
  };
}

export interface ScoredCandidate extends ScoreFields {
  candidate_file: string;
  candidate_name: string | null;
  email: string | null;
  phone: string | null;
  role_applied: "PM" | "SPM" | "UNCLEAR";
  role_reason: string;
  anonymized_cv: string;
  summary: string;
  model: string;
  rubric_version: string;
}

/**
 * Steps 1-2 for one CV: extract contact details + anonymise (model), deterministic
 * redaction (code), blind scoring of the anonymised text only (model), points/gate/bands (code).
 */
export async function scoreCv(fileName: string, cvText: string): Promise<ScoredCandidate> {
  const extracted = await extractCandidate(fileName, cvText);
  const anonymized = redact(extracted.anonymized_cv, {
    name: extracted.candidate_name,
    email: extracted.email,
    phone: extracted.phone,
  });
  const scored = await scoreCandidate(anonymized, extracted.role_applied);
  const criteria = toCriteria(scored, anonymized);

  return {
    candidate_file: fileName,
    candidate_name: extracted.candidate_name,
    email: extracted.email,
    phone: extracted.phone,
    role_applied: extracted.role_applied,
    role_reason: extracted.role_reason,
    anonymized_cv: anonymized,
    summary: scored.summary,
    model: MODEL,
    rubric_version: RUBRIC_VERSION,
    ...scoreFields(criteria),
  };
}

export interface DraftFields {
  target_role: Role;
  score: number;
  band: Band;
  probe_questions: string[];
  interview_brief: string;
  invite_subject: string;
  invite_body: string;
  reject_subject: string;
  reject_body: string;
}

/** Step 3, once the role is known: interview brief + invite draft (model), rejection template (code). */
export async function draftFor(
  c: { anonymized_cv: string; criteria: Criteria; summary: string; candidate_name: string | null },
  role: Role,
): Promise<DraftFields> {
  const result = scoreFor(c.criteria, role);
  const probes = probeQuestions(c.criteria, role);
  const { f_pm, f_spm, ...rest } = c.criteria;
  const brief = await writeBrief({
    anonymizedCv: c.anonymized_cv,
    targetRoleTitle: ROLE_TITLES[role],
    scoringJson: JSON.stringify(
      {
        total: result.total,
        band: result.band,
        gate: { a_plus_b_points: result.gateScore, of: 45, triggered: result.gated },
        points: result.points,
        criteria: { ...rest, f_role_fit: role === "PM" ? f_pm : f_spm },
        summary: c.summary,
      },
      null,
      2,
    ),
    probes,
  });

  return {
    target_role: role,
    score: result.total,
    band: result.band,
    probe_questions: probes,
    interview_brief: brief.interview_brief,
    invite_subject: inviteSubject(role),
    invite_body: finaliseInvite(brief.invite_body, c.candidate_name),
    reject_subject: rejectSubject(role),
    reject_body: rejectBody(role),
  };
}
