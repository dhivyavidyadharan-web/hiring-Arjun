import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getDb } from "@/lib/db";
import { rejectionProblems } from "@/lib/emails";

export const runtime = "nodejs";

/**
 * The only place an email is ever sent. Fires only when Arjun clicks Send:
 * the click records arjun_decision (ADVANCE / DECLINE) and sends the matching email.
 * The status flip draft|failed -> sending is atomic, so a double click cannot send twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision } = (await req.json().catch(() => ({}))) as { decision?: string };
  if (decision !== "ADVANCE" && decision !== "DECLINE") {
    return NextResponse.json({ error: "decision must be ADVANCE or DECLINE" }, { status: 400 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return NextResponse.json({ error: "RESEND_API_KEY and EMAIL_FROM must be set." }, { status: 500 });
  }

  const db = getDb();
  const { data: c, error: readError } = await db.from("candidates").select("*").eq("id", id).single();
  if (readError || !c) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (c.status !== "ready") return NextResponse.json({ error: "Candidate is not scored yet" }, { status: 409 });
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT || null;
  if (!c.email && !testRecipient) {
    return NextResponse.json({ error: "No email address on this CV. Add one first." }, { status: 400 });
  }

  const subject: string = decision === "ADVANCE" ? c.invite_subject : c.reject_subject;
  const text: string = decision === "ADVANCE" ? c.invite_body : c.reject_body;
  if (!subject?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "Email draft is empty" }, { status: 400 });
  }
  if (decision === "DECLINE") {
    const problems = rejectionProblems(text, subject, c.candidate_name);
    if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 422 });
  }

  // Record Arjun's decision and claim the send atomically.
  const { data: claimed, error: claimError } = await db
    .from("candidates")
    .update({
      arjun_decision: decision,
      decided_at: new Date().toISOString(),
      email_status: "sending",
      email_error: null,
    })
    .eq("id", id)
    .in("email_status", ["draft", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: "An email was already sent to this candidate." }, { status: 409 });

  const to = testRecipient || c.email;
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    text,
    ...(process.env.EMAIL_REPLY_TO && decision === "ADVANCE" ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
  });

  if (error || !data) {
    const message = error?.message ?? "Resend returned no id";
    await db.from("candidates").update({ email_status: "failed", email_error: message }).eq("id", id);
    return NextResponse.json({ error: `Email failed: ${message}` }, { status: 502 });
  }

  await db
    .from("candidates")
    .update({ email_status: "sent", email_sent_at: new Date().toISOString(), resend_id: data.id })
    .eq("id", id);
  return NextResponse.json({ ok: true, resend_id: data.id, to });
}
