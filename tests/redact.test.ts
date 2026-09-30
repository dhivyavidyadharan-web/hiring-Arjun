import { describe, expect, it } from "vitest";
import { nameTokens, redact } from "../lib/redact";

describe("redact", () => {
  const known = { name: "Lavanya Iyer", email: "lavanya.iyer.pm@gmail.com", phone: "+91 98876 12340" };

  it("removes the candidate's name wherever it appears, case-insensitively", () => {
    const out = redact('Review note: "LAVANYA is the first PM here. Iyer does not hedge."', known);
    expect(out).not.toMatch(/lavanya|iyer/i);
    expect(out).toContain("[CANDIDATE]");
  });

  it("removes emails, phones and profile links, even ones the extractor missed", () => {
    const out = redact(
      "lavanya.iyer.pm@gmail.com | +91 98876 12340 | linkedin.com/in/lavanyaiyer | other@x.io | 022-4455-6677",
      known,
    );
    expect(out).not.toMatch(/@|98876|linkedin|4455/);
  });

  it("leaves ordinary text and numbers alone", () => {
    const text = "Managed 800+ shipments monthly across 3 FMCG accounts in 2021";
    expect(redact(text, known)).toBe(text);
  });

  it("ignores very short name tokens", () => {
    expect(nameTokens("Al B Kumar")).toEqual(["Kumar"]);
  });
});
