import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { draftFor } from "@/lib/pipeline";
import type { Criteria } from "@/lib/rubric";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Arjun assigns (or changes) the role for a candidate. Both roles were already
 * scored, so no rescoring: this writes the brief and email drafts for that role.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = (await req.json().catch(() => ({}))) as { role?: string };
  if (role !== "PM" && role !== "SPM") {
    return NextResponse.json({ error: "role must be PM or SPM" }, { status: 400 });
  }

  const db = getDb();
  const { data: c, error } = await db
    .from("candidates")
    .select("id, status, email_status, anonymized_cv, criteria, summary, candidate_name")
    .eq("id", id)
    .single();
  if (error || !c) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (c.status !== "needs_role" && c.status !== "ready") {
    return NextResponse.json({ error: "Candidate has not been scored yet" }, { status: 409 });
  }
  if (c.email_status === "sent" || c.email_status === "sending") {
    return NextResponse.json({ error: "An email was already sent; the role is locked." }, { status: 409 });
  }

  try {
    const drafts = await draftFor(
      {
        anonymized_cv: c.anonymized_cv as string,
        criteria: c.criteria as Criteria,
        summary: c.summary as string,
        candidate_name: c.candidate_name as string | null,
      },
      role,
    );
    const { error: updateError } = await db
      .from("candidates")
      .update({ ...drafts, role_applied: role, status: "ready", error: null })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true, score: drafts.score, band: drafts.band });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
