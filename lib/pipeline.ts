import { extractCandidate, MODEL, scoreCandidate, writeBrief } from "./claude";
import { finaliseInvite, inviteSubject, rejectBody, rejectSubject } from "./emails";
import { redact } from "./redact";
import {
  bandFor,
  DIMENSION_KEYS,
  dnaScore,
  evidenceAppearsIn,
  flagCount,
  probeQuestions,
  ROLE_TITLES,
  type Band,
  type Dimensions,
  type Layer1Check,
  type Role,
} from "./rubric";

export interface CandidateResult {
  candidate_file: string;
  candidate_name: string | null;
  email: string | null;
  phone: string | null;
  role_applied: "PM" | "SPM" | "UNCLEAR";
  anonymized_cv: string;
  layer1_pm: Layer1Check[];
  layer1_spm: Layer1Check[];
  dimensions: Dimensions;
  dna_score: number;
  band: Band;
  summary: string;
  probe_questions: string[];
  interview_brief: string;
  target_role: Role;
  invite_subject: string;
  invite_body: string;
  reject_subject: string;
  reject_body: string;
  model: string;
}

/** Which role to draft emails for: the applied role, or the better Layer 1 fit if unclear. */
function pickTargetRole(applied: string, pm: Layer1Check[], spm: Layer1Check[]): Role {
  if (applied === "PM" || applied === "SPM") return applied;
  const pmFlags = flagCount(pm);
  const spmFlags = flagCount(spm);
  if (pmFlags !== spmFlags) return pmFlags < spmFlags ? "PM" : "SPM";
  const spmExp = spm.find((c) => c.check === "L1.1")?.result === "PASS";
  return spmExp ? "SPM" : "PM";
}

/**
 * Trigger -> Input -> Context -> Processing -> AI -> Output for one CV.
 *   1. extract contact details + anonymise (model), then deterministic redaction (code)
 *   2. blind scoring on the anonymised CV only (model), arithmetic and band (code)
 *   3. interview brief + invite draft (model), rejection from a fixed template (code)
 * Nothing is sent. arjun_decision stays null.
 */
export async function processCv(fileName: string, cvText: string): Promise<CandidateResult> {
  // 1. Extract + anonymise
  const extracted = await extractCandidate(fileName, cvText);
  const anonymized = redact(extracted.anonymized_cv, {
    name: extracted.candidate_name,
    email: extracted.email,
    phone: extracted.phone,
  });

  // 2. Blind score
  const scored = await scoreCandidate(anonymized, extracted.role_applied);
  const dimensions = {} as Dimensions;
  for (const k of DIMENSION_KEYS) {
    const d = scored.dimensions[k];
    dimensions[k] = {
      score: d.score as 0 | 1 | 2 | 3,
      evidence: d.evidence,
      rationale: d.rationale,
      evidence_verified: evidenceAppearsIn(d.evidence, anonymized),
    };
  }
  const dna = dnaScore(dimensions);
  const band = bandFor(dna);
  const probes = probeQuestions(dimensions);
  const target = pickTargetRole(extracted.role_applied, scored.layer1_pm, scored.layer1_spm);

  // 3. Brief + drafts
  const brief = await writeBrief({
    anonymizedCv: anonymized,
    targetRoleTitle: ROLE_TITLES[target],
    scoringJson: JSON.stringify(
      {
        dna_score: dna,
        band,
        layer1_target_role: target === "PM" ? scored.layer1_pm : scored.layer1_spm,
        dimensions,
        summary: scored.summary,
      },
      null,
      2,
    ),
    probes,
  });

  return {
    candidate_file: fileName,
    candidate_name: extracted.candidate_name,
    email: extracted.email,
    phone: extracted.phone,
    role_applied: extracted.role_applied,
    anonymized_cv: anonymized,
    layer1_pm: scored.layer1_pm,
    layer1_spm: scored.layer1_spm,
    dimensions,
    dna_score: dna,
    band,
    summary: scored.summary,
    probe_questions: probes,
    interview_brief: brief.interview_brief,
    target_role: target,
    invite_subject: inviteSubject(target),
    invite_body: finaliseInvite(brief.invite_body, extracted.candidate_name),
    reject_subject: rejectSubject(target),
    reject_body: rejectBody(target),
    model: MODEL,
  };
}
