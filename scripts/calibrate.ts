// Rubric §6, the calibration check, from the command line (the /calibration page does the same in the app).
//
//   npm run calibrate -- ./hires
//
// Scores the 8 past-hire CVs with the same extract + blind-score steps the app uses (as PM),
// and compares them with RUBRIC.md's calibration table.

import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ACCEPTED_EXTENSIONS, extractText } from "../lib/parse";
import { scoreCv } from "../lib/pipeline";
import { CALIBRATION, calibrationTargetFor, checkCalibration, CRITERION_KEYS, levelsFor, scoreFor } from "../lib/rubric";

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: npm run calibrate -- <folder with the 8 hire CVs>");
    process.exit(1);
  }
  const files = (await readdir(dir)).filter((f) => ACCEPTED_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)));

  let passed = 0;
  let seen = 0;
  for (const file of files.sort()) {
    const target = calibrationTargetFor(file);
    if (!target) {
      console.warn(`skipping ${file} (not one of the 8 calibration hires)`);
      continue;
    }
    seen++;
    const buf = await readFile(path.join(dir, file));
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const scored = await scoreCv(file, await extractText(file, bytes));
    const result = scoreFor(scored.criteria, "PM");
    const levels = levelsFor(scored.criteria, "PM");
    const check = checkCalibration(target, result);
    if (check.pass) passed++;

    console.log(
      [
        target.key.padEnd(9),
        target.outcome.padEnd(8),
        `exp ${target.score !== undefined ? String(target.score).padStart(3) : "  -"} ${target.band}`.padEnd(22),
        `got ${String(result.total).padStart(3)} ${result.band}${result.gated ? " (gated)" : ""}`.padEnd(24),
        CRITERION_KEYS.map((k) => `${k}${levels[k]}`).join(" "),
        check.pass ? "ok" : `FAIL: ${check.reasons.join("; ")}`,
      ].join("  "),
    );
  }

  const ok = seen === CALIBRATION.length && passed === seen;
  console.log(`\n${passed}/${seen} passing${seen < CALIBRATION.length ? ` (${CALIBRATION.length - seen} hires missing)` : ""}`);
  console.log(ok ? "CALIBRATION PASSED" : "CALIBRATION FAILED: fix lib/prompts.ts before scoring real applicants");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
