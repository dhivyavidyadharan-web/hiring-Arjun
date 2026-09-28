// Rubric Section 8, the calibration check. Run this BEFORE scoring real applicants.
//
//   npm run calibrate -- ./hires
//
// Scores the 8 past-hire CVs with the same extract + blind-score steps the app uses,
// then compares them with the expected results in the rubric (tolerance +/- 10).
// Pass condition: all 5 "Exceeds" hires score >= 75 and all 3 others score < 50.

import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractCandidate, scoreCandidate } from "../lib/claude";
import { ACCEPTED_EXTENSIONS, extractText } from "../lib/parse";
import { redact } from "../lib/redact";
import { bandFor, DIMENSION_KEYS, dnaScore, type Dimensions } from "../lib/rubric";

const EXPECTED: Record<string, { rating: string; dims: number[]; dna: number }> = {
  lavanya: { rating: "Exceeds", dims: [3, 3, 3, 3, 2], dna: 95 },
  aditya: { rating: "Exceeds", dims: [3, 3, 3, 3, 2], dna: 95 },
  rohan: { rating: "Exceeds", dims: [3, 3, 3, 1, 3], dna: 90 },
  sunita: { rating: "Exceeds", dims: [3, 3, 3, 1, 3], dna: 90 },
  meghna: { rating: "Exceeds", dims: [3, 3, 2, 2, 3], dna: 88 },
  preetham: { rating: "Below", dims: [1, 2, 1, 0, 2], dna: 40 },
  rahul: { rating: "Meets", dims: [0, 2, 3, 0, 0], dna: 33 },
  vikram: { rating: "Meets", dims: [1, 2, 1, 0, 0], dna: 30 },
};

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: npm run calibrate -- <folder with the 8 hire CVs>");
    process.exit(1);
  }
  const files = (await readdir(dir)).filter((f) =>
    ACCEPTED_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)),
  );

  let pass = true;
  const rows: string[] = [];
  for (const file of files.sort()) {
    const key = Object.keys(EXPECTED).find((k) => file.toLowerCase().includes(k));
    if (!key) {
      console.warn(`skipping ${file} (not one of the 8 calibration hires)`);
      continue;
    }
    const exp = EXPECTED[key];
    const buf = await readFile(path.join(dir, file));
    const text = await extractText(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const ex = await extractCandidate(file, text);
    const anon = redact(ex.anonymized_cv, { name: ex.candidate_name, email: ex.email, phone: ex.phone });
    const scored = await scoreCandidate(anon, ex.role_applied);

    const dims = scored.dimensions as unknown as Dimensions;
    const dna = dnaScore(dims);
    const got = DIMENSION_KEYS.map((k) => dims[k].score);
    const withinTolerance = Math.abs(dna - exp.dna) <= 10;
    const bandOk = exp.rating === "Exceeds" ? dna >= 75 : dna < 50;
    if (!bandOk) pass = false;

    rows.push(
      [
        key.padEnd(9),
        exp.rating.padEnd(8),
        `exp ${exp.dims.join(" ")} = ${String(exp.dna).padStart(3)}`,
        `got ${got.join(" ")} = ${String(dna).padStart(3)}`,
        bandFor(dna).padEnd(9),
        withinTolerance ? "±10 ok" : "OUTSIDE ±10",
        bandOk ? "" : "<-- FAILS PASS CONDITION",
      ].join("  "),
    );
    console.log(rows[rows.length - 1]);
  }

  console.log("\n" + (pass ? "CALIBRATION PASSED" : "CALIBRATION FAILED: fix the scoring prompt before touching applications/"));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
