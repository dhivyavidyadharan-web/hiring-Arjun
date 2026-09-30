import { NextResponse } from "next/server";
import { ACCEPTED_EXTENSIONS, extractText } from "@/lib/parse";
import { scoreCv } from "@/lib/pipeline";
import { calibrationTargetFor, checkCalibration, scoreFor } from "@/lib/rubric";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Rubric §6 calibration: score one past-hire CV with the live pipeline and compare
 * it to the documented target. Nothing is stored and no email is ever drafted.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (!ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return NextResponse.json({ error: `Unsupported file: ${file.name}` }, { status: 400 });
  }
  const target = calibrationTargetFor(file.name);
  if (!target) {
    return NextResponse.json(
      { error: `${file.name} is not one of the 8 calibration hires (file name must contain their first name).` },
      { status: 400 },
    );
  }

  try {
    const text = await extractText(file.name, await file.arrayBuffer());
    const scored = await scoreCv(file.name, text);
    const result = scoreFor(scored.criteria, "PM");
    return NextResponse.json({
      key: target.key,
      result,
      criteria: scored.criteria,
      check: checkCalibration(target, result),
    });
  } catch (e) {
    return NextResponse.json({ key: target.key, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
