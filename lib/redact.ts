// Deterministic second pass after the model's anonymisation: whatever the model
// missed, the scorer still never sees the candidate's name or contact details.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github|behance|dribbble)\.com\/\S*/gi;
// 10+ digits, allowing spaces, dashes, dots, brackets and a leading +
const PHONE = /(?:\+?\d[\s().-]*){10,}/g;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function nameTokens(name: string | null | undefined): string[] {
  return (name ?? "")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}'-]/gu, ""))
    .filter((t) => t.length >= 3);
}

export function redact(text: string, known: { name?: string | null; email?: string | null; phone?: string | null }): string {
  let out = text.replace(EMAIL, "[EMAIL]").replace(URL, "[LINK]").replace(PHONE, "[PHONE]");
  if (known.email) out = out.split(known.email).join("[EMAIL]");
  if (known.phone) out = out.split(known.phone).join("[PHONE]");
  for (const token of nameTokens(known.name)) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi"), "[CANDIDATE]");
  }
  return out.replace(/\[CANDIDATE\](\s+\[CANDIDATE\])+/g, "[CANDIDATE]");
}
