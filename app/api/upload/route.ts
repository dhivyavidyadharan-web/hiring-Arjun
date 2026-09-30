import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ACCEPTED_EXTENSIONS, extractText } from "@/lib/parse";
import { draftFor, scoreCv } from "@/lib/pipeline";

export const runtime = "nodejs";
// Three model calls per CV; give the function room.
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

/** Trigger: Arjun uploads one CV. The dashboard calls this once per file. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  const name = file.name;
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) {
    return NextResponse.json({ error: `Unsupported file: ${name}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `${name} is larger than 10 MB` }, { status: 400 });
  }

  const db = getDb();
  const { data: row, error: insertError } = await db
    .from("candidates")
    .insert({ candidate_file: name, status: "processing" })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const text = await extractText(name, await file.arrayBuffer());
    const scored = await scoreCv(name, text);

    // UNCLEAR role: stop here. Arjun picks the role on the dashboard, then the brief and drafts are written.
    const drafts = scored.role_applied === "UNCLEAR" ? null : await draftFor(scored, scored.role_applied);
    const { error } = await db
      .from("candidates")
      .update({ ...scored, ...(drafts ?? {}), status: drafts ? "ready" : "needs_role", error: null })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      id: row.id,
      role: scored.role_applied,
      score: drafts?.score ?? null,
      band: drafts?.band ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("candidates").update({ status: "error", error: message }).eq("id", row.id);
    return NextResponse.json({ id: row.id, error: message }, { status: 500 });
  }
}
