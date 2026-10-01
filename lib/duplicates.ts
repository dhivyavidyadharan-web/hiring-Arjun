// Duplicate detection. Pure functions so they are unit-tested; the upload route does the I/O.
//
// Signals, strongest first:
//   1. identical file (SHA-256 of the bytes): caught before scoring, so no model call is wasted
//   2. same phone number (last 10 digits)
//   3. same full name (case/space-insensitive, at least two words)
// Email on its own is deliberately NOT a signal: shared inboxes (a class squad address,
// a recruiter's address) would flag unrelated people. It is reported only alongside a match.

import { createHash } from "node:crypto";

export function fileHash(bytes: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export interface Contact {
  id: string;
  candidate_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface DuplicateMatch {
  id: string;
  reason: string;
}

export function normalizeName(name: string | null | undefined): string | null {
  const n = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n.split(" ").length >= 2 ? n : null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** The first earlier candidate that looks like the same person, or null. */
export function findDuplicate(candidate: Omit<Contact, "id">, others: Contact[]): DuplicateMatch | null {
  const phone = normalizePhone(candidate.phone);
  const name = normalizeName(candidate.candidate_name);
  const email = normalizeEmail(candidate.email);

  for (const o of others) {
    const reasons: string[] = [];
    if (phone && phone === normalizePhone(o.phone)) reasons.push("same phone number");
    if (name && name === normalizeName(o.candidate_name)) reasons.push("same name");
    if (reasons.length === 0) continue;
    if (email && email === normalizeEmail(o.email)) reasons.push("same email");
    return { id: o.id, reason: reasons.join(", ") };
  }
  return null;
}
