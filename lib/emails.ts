import { nameTokens } from "./redact";
import { ROLE_TITLES, type Role } from "./rubric";

export function inviteSubject(role: Role) {
  return `Interview invitation: ${ROLE_TITLES[role]} at Kargo`;
}

export function signature() {
  return process.env.INVITE_SIGNATURE || "Arjun Mehta, Founder, Kargo";
}

/** Fills the {{first_name}} placeholder the model leaves and appends the signature. */
export function finaliseInvite(body: string, candidateName: string | null) {
  const first = (candidateName ?? "").trim().split(/\s+/)[0] || "there";
  const filled = body.replace(/\{\{\s*first_name\s*\}\}/g, first).trim();
  return `${filled}\n\nBest regards,\n${signature()}`;
}

// The rejection is a fixed, respectful template. It names nobody: not the
// candidate, not Arjun, not any Kargo employee, and it attributes the decision
// to no individual. It also never mentions scores or automated screening.
export function rejectSubject(role: Role) {
  return `Your application to Kargo: ${ROLE_TITLES[role]}`;
}

export function rejectBody(role: Role) {
  return `Hello,

Thank you for applying for the ${ROLE_TITLES[role]} role at Kargo, and for the time and care you put into your application.

After careful review, we will not be moving forward with your application for this role. We received many strong applications, and this outcome reflects the specific needs of the role at this stage of the company rather than any single aspect of your background.

We genuinely appreciate your interest in Kargo and would be glad to see your application again for future openings. We wish you every success in your search.

Warm regards,
The Kargo Hiring Team`;
}

/**
 * Guardrail run before a rejection is sent (Arjun can edit drafts, so check the final text).
 * Returns a list of problems; an empty list means OK to send.
 */
export function rejectionProblems(body: string, subject: string, candidateName: string | null): string[] {
  const text = `${subject}\n${body}`;
  const problems: string[] = [];
  const forbidden = new Set([
    ...nameTokens(candidateName),
    ...nameTokens(signature().split(",")[0]),
    "Arjun",
  ]);
  for (const token of forbidden) {
    if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
      problems.push(`Rejection email must not contain a person's name ("${token}").`);
    }
  }
  if (/\{\{|\}\}/.test(text)) problems.push("Rejection email still contains a template placeholder.");
  if (/\b(score|rubric|band|ranked|algorithm|AI|automated)\b/i.test(text)) {
    problems.push("Rejection email must not mention scores, rankings or automated screening.");
  }
  return problems;
}
