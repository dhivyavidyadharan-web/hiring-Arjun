import { describe, expect, it } from "vitest";
import { fileHash, findDuplicate, normalizeName, normalizePhone, type Contact } from "../lib/duplicates";

const existing: Contact[] = [
  { id: "rohan", candidate_name: "Rohan Mehta", email: "squad_1@pg27.mesaschool.co", phone: "+91 98202 11345" },
  { id: "priya", candidate_name: "Priya Sharma", email: "squad_1@pg27.mesaschool.co", phone: "+91 97293 44218" },
];

describe("findDuplicate", () => {
  it("matches the same person on phone, even when formatted differently", () => {
    const m = findDuplicate({ candidate_name: "R. Mehta", email: null, phone: "9820211345" }, existing);
    expect(m).toEqual({ id: "rohan", reason: "same phone number" });
  });

  it("matches on full name regardless of case and spacing, and notes a shared email", () => {
    const m = findDuplicate({ candidate_name: "  rohan   MEHTA ", email: "SQUAD_1@pg27.mesaschool.co", phone: null }, existing);
    expect(m).toEqual({ id: "rohan", reason: "same name, same email" });
  });

  it("does NOT flag different people who share an inbox", () => {
    const m = findDuplicate({ candidate_name: "Arnav Sen", email: "squad_1@pg27.mesaschool.co", phone: "+91 99014 78302" }, existing);
    expect(m).toBeNull();
  });

  it("ignores single-word names and short numbers", () => {
    expect(findDuplicate({ candidate_name: "Rohan", email: null, phone: "11345" }, existing)).toBeNull();
    expect(normalizeName("Rohan")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });

  it("returns the earliest match first", () => {
    const twice: Contact[] = [...existing, { id: "rohan-2", candidate_name: "Rohan Mehta", email: null, phone: null }];
    expect(findDuplicate({ candidate_name: "Rohan Mehta", email: null, phone: null }, twice)?.id).toBe("rohan");
  });
});

describe("fileHash", () => {
  it("is identical for identical bytes and different otherwise", () => {
    const a = new TextEncoder().encode("same cv").buffer as ArrayBuffer;
    const b = new TextEncoder().encode("same cv").buffer as ArrayBuffer;
    const c = new TextEncoder().encode("other cv").buffer as ArrayBuffer;
    expect(fileHash(a)).toBe(fileHash(b));
    expect(fileHash(a)).not.toBe(fileHash(c));
    expect(fileHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
