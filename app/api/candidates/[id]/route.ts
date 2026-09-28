import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const EDITABLE = ["invite_subject", "invite_body", "reject_subject", "reject_body", "email"] as const;

/** Arjun edits a draft email (or fixes an email address) before sending. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, string> = {};
  for (const key of EDITABLE) {
    if (typeof body[key] === "string") update[key] = body[key] as string;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Drafts are frozen once an email has gone out.
  const { data, error } = await getDb()
    .from("candidates")
    .update(update)
    .eq("id", id)
    .in("email_status", ["draft", "failed"])
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Email already sent; drafts are locked." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await getDb().from("candidates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
