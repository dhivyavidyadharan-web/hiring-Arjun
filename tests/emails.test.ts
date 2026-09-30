import { describe, expect, it } from "vitest";
import { finaliseInvite, inviteSubject, rejectBody, rejectionProblems, rejectSubject } from "../lib/emails";

describe("rejection email", () => {
  for (const role of ["PM", "SPM"] as const) {
    it(`${role} template names nobody and passes the guardrail`, () => {
      expect(rejectionProblems(rejectBody(role), rejectSubject(role), "Rohan Desai")).toEqual([]);
      expect(rejectBody(role)).toMatch(/^Hello,/);
      expect(rejectBody(role)).toContain("The Kargo Hiring Team");
    });
  }

  it("blocks the candidate's name", () => {
    const body = rejectBody("PM").replace("Hello,", "Hello Rohan,");
    expect(rejectionProblems(body, rejectSubject("PM"), "Rohan Desai").join(" ")).toContain("Rohan");
  });

  it("blocks the founder's name", () => {
    const body = rejectBody("PM") + "\nArjun decided this.";
    expect(rejectionProblems(body, rejectSubject("PM"), "Rohan Desai").length).toBeGreaterThan(0);
  });

  it("blocks any mention of scores or automated screening", () => {
    const body = rejectBody("PM") + "\nYour score was 38.";
    expect(rejectionProblems(body, rejectSubject("PM"), null).join(" ")).toMatch(/scores/);
  });

  it("blocks leftover template placeholders", () => {
    expect(rejectionProblems("Hi {{first_name}}", "x", null).length).toBeGreaterThan(0);
  });
});

describe("invite email", () => {
  it("fills the first name and appends the signature", () => {
    const out = finaliseInvite("Hi {{first_name}},\n\nThanks for applying.", "Meghna Tiwari");
    expect(out).toMatch(/^Hi Meghna,/);
    expect(out).toMatch(/Best regards,\n.+$/);
    expect(out).not.toContain("{{");
  });

  it("falls back gracefully when no name was found", () => {
    expect(finaliseInvite("Hi {{ first_name }},", null)).toMatch(/^Hi there,/);
  });

  it("has a role-specific subject", () => {
    expect(inviteSubject("SPM")).toContain("Senior Product Manager");
  });
});
