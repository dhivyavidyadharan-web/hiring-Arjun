import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fileHash, findDuplicate, type Contact } from "@/lib/duplicates";
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
  const roleField = form.get("role");
  const selectedRole = roleField === "PM" || roleField === "SPM" ? roleField : undefined;
  const force = form.get("force") === "1"; // "Upload anyway" after a duplicate warning
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) {
    return NextResponse.json({ error: `Unsupported file: ${name}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `${name} is larger than 10 MB` }, { status: 400 });
  }

  const db = getDb();
  const bytes = await file.arrayBuffer();
  const hash = fileHash(bytes);

  // 1. Identical file already uploaded: warn before spending any model calls.
  const { data: sameFile } = await db
    .from("candidates")
    .select("id, candidate_name, candidate_file, created_at")
    .eq("file_hash", hash)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (sameFile && !force) {
    return NextResponse.json(
      {
        duplicate: true,
        existing: sameFile,
        error: `Already uploaded on ${new Date(sameFile.created_at).toLocaleDateString("en-IN")}${
          sameFile.candidate_name ? ` (${sameFile.candidate_name})` : ""
        }.`,
      },
      { status: 409 },
    );
  }

  const { data: row, error: insertError } = await db
    .from("candidates")
    .insert({ candidate_file: name, status: "processing", file_hash: hash })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const text = await extractText(name, bytes);
    const scored = await scoreCv(name, text, selectedRole);

    // 2-3. Same person under a different file (same phone or same full name): flag, don't block.
    const { data: others } = await db
      .from("candidates")
      .select("id, candidate_name, email, phone")
      .neq("id", row.id)
      .order("created_at", { ascending: true });
    const match = sameFile
      ? { id: sameFile.id as string, reason: "identical file, uploaded again on purpose" }
      : findDuplicate(scored, (others ?? []) as Contact[]);

    // UNCLEAR role: stop here. Arjun picks the role on the dashboard, then the brief and drafts are written.
    const drafts = scored.role_applied === "UNCLEAR" ? null : await draftFor(scored, scored.role_applied);
    const { error } = await db
      .from("candidates")
      .update({
        ...scored,
        ...(drafts ?? {}),
        duplicate_of: match?.id ?? null,
        duplicate_reason: match?.reason ?? null,
        status: drafts ? "ready" : "needs_role",
        error: null,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      id: row.id,
      role: scored.role_applied,
      score: drafts?.score ?? null,
      band: drafts?.band ?? null,
      possible_duplicate: match ? match.reason : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("candidates").update({ status: "error", error: message }).eq("id", row.id);
    return NextResponse.json({ id: row.id, error: message }, { status: 500 });
  }
}
