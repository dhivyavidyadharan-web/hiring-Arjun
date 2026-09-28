"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DIMENSION_KEYS,
  DIMENSIONS,
  LAYER1_CHECKS,
  ROLE_TITLES,
  type Band,
  type Dimensions,
  type Layer1Check,
  type Role,
} from "@/lib/rubric";

export interface Candidate {
  id: string;
  created_at: string;
  candidate_file: string;
  candidate_name: string | null;
  email: string | null;
  role_applied: "PM" | "SPM" | "UNCLEAR";
  anonymized_cv: string | null;
  layer1_pm: Layer1Check[] | null;
  layer1_spm: Layer1Check[] | null;
  dimensions: Dimensions | null;
  dna_score: number | null;
  band: Band | null;
  summary: string | null;
  probe_questions: string[] | null;
  interview_brief: string | null;
  target_role: Role | null;
  invite_subject: string | null;
  invite_body: string | null;
  reject_subject: string | null;
  reject_body: string | null;
  arjun_decision: "ADVANCE" | "DECLINE" | null;
  decided_at: string | null;
  email_status: "draft" | "sending" | "sent" | "failed";
  email_sent_at: string | null;
  email_error: string | null;
  status: "processing" | "ready" | "error";
  error: string | null;
}

type View = Role | "ALL";
type QueueItem = { name: string; state: "waiting" | "scoring" | "done" | "error"; note?: string };

const CONCURRENCY = 2;

export default function Dashboard({ initial }: { initial: Candidate[] }) {
  const [candidates, setCandidates] = useState(initial);
  const [view, setView] = useState<View>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Re-render the server page so new candidates arrive in ranked order.
  const refresh = useCallback(() => window.location.reload(), []);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    const items: QueueItem[] = files.map((f) => ({ name: f.name, state: "waiting" }));
    setQueue(items);
    const update = (i: number, patch: Partial<QueueItem>) =>
      setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

    let next = 0;
    async function worker() {
      while (next < files.length) {
        const i = next++;
        update(i, { state: "scoring" });
        const body = new FormData();
        body.append("file", files[i]);
        try {
          const res = await fetch("/api/upload", { method: "POST", body });
          const json = (await res.json()) as { error?: string; dna_score?: number; band?: string };
          if (!res.ok) update(i, { state: "error", note: json.error });
          else update(i, { state: "done", note: `DNA ${json.dna_score} · ${json.band}` });
        } catch (e) {
          update(i, { state: "error", note: String(e) });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    refresh();
  }

  const visible = useMemo(() => {
    return candidates.filter((c) => view === "ALL" || c.role_applied === view || c.role_applied === "UNCLEAR");
  }, [candidates, view]);

  const ready = candidates.filter((c) => c.status === "ready");
  const stats = {
    total: candidates.length,
    shortlist: ready.filter((c) => c.band === "SHORTLIST").length,
    review: ready.filter((c) => c.band === "REVIEW").length,
    decline: ready.filter((c) => c.band === "DECLINE").length,
    decided: candidates.filter((c) => c.arjun_decision).length,
    sent: candidates.filter((c) => c.email_status === "sent").length,
  };

  function patchLocal(id: string, patch: Partial<Candidate>) {
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  return (
    <main className="wrap">
      <div className="top">
        <div>
          <h1>Kargo Hiring · PM &amp; Senior PM</h1>
          <div className="muted small">
            The system recommends. You decide. No email goes out until you click Send.
          </div>
        </div>
        <form action="/api/logout" method="post">
          <button>Sign out</button>
        </form>
      </div>

      <div className="stats">
        <Stat label="Candidates" value={stats.total} />
        <Stat label="Shortlist (75+)" value={stats.shortlist} />
        <Stat label="Review (50-74)" value={stats.review} />
        <Stat label="Decline (<50)" value={stats.decline} />
        <Stat label="Decided" value={stats.decided} />
        <Stat label="Emails sent" value={stats.sent} />
      </div>

      <section className="panel">
        <div
          className={`drop ${dragOver ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void upload(Array.from(e.dataTransfer.files));
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            <b>Upload CVs</b> for Product Manager or Senior Product Manager (PDF, DOCX, TXT)
          </p>
          <p className="muted small" style={{ margin: "0 0 10px" }}>
            Contact details are removed before scoring. Every candidate is scored against both roles.
          </p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md"
            style={{ display: "none" }}
            onChange={(e) => void upload(Array.from(e.target.files ?? []))}
          />
          <button className="primary" onClick={() => fileInput.current?.click()}>
            Choose files
          </button>
        </div>
        {queue.length > 0 && (
          <ul className="queue">
            {queue.map((q, i) => (
              <li key={i}>
                <span className={`pill ${q.state === "done" ? "sent" : q.state === "error" ? "error" : "draft"}`}>
                  {q.state}
                </span>{" "}
                {q.name} {q.note && <span className="muted">· {q.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="tabs">
          {(["ALL", "PM", "SPM"] as View[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "ALL" ? "All candidates" : ROLE_TITLES[v]}
            </button>
          ))}
        </div>
        {view !== "ALL" && (
          <p className="muted small" style={{ marginTop: 0 }}>
            Showing people who applied for {ROLE_TITLES[view]}, plus unclear applications. Layer 1 flags are shown for
            this role.
          </p>
        )}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Candidate</th>
                <th>Applied</th>
                <th>DNA score</th>
                <th>Band</th>
                <th>D1 D2 D3 D4 D5</th>
                <th>Role fit ({view === "ALL" ? "target" : view})</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, i) => (
                <Row
                  key={c.id}
                  rank={i + 1}
                  c={c}
                  view={view}
                  open={openId === c.id}
                  onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                  onPatch={(p) => patchLocal(c.id, p)}
                  onDelete={() => setCandidates((cs) => cs.filter((x) => x.id !== c.id))}
                />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No candidates yet. Upload CVs above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span className="muted small">{label}</span>
    </div>
  );
}

function checksFor(c: Candidate, role: Role) {
  return (role === "PM" ? c.layer1_pm : c.layer1_spm) ?? [];
}

function Row(props: {
  rank: number;
  c: Candidate;
  view: View;
  open: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<Candidate>) => void;
  onDelete: () => void;
}) {
  const { c, view } = props;
  const role: Role = view === "ALL" ? (c.target_role ?? "PM") : view;
  const checks = checksFor(c, role);
  const flags = checks.filter((x) => x.result === "FLAG").length;
  const unclear = checks.filter((x) => x.result === "UNCLEAR").length;

  return (
    <>
      <tr className="row" onClick={props.onToggle}>
        <td>{c.status === "ready" ? props.rank : "–"}</td>
        <td>
          <b>{c.candidate_name ?? "(name not found)"}</b>
          <div className="muted small">{c.candidate_file}</div>
        </td>
        <td>{c.role_applied}</td>
        <td>
          {c.status === "ready" ? (
            <>
              <b>{c.dna_score}</b>
              <div className="bar">
                <i style={{ width: `${c.dna_score ?? 0}%` }} />
              </div>
            </>
          ) : (
            <span className={`pill ${c.status}`}>{c.status}</span>
          )}
        </td>
        <td>{c.band && <span className={`pill ${c.band}`}>{c.band}</span>}</td>
        <td className="dots">
          {c.dimensions ? DIMENSION_KEYS.map((k) => c.dimensions![k].score).join("  ") : ""}
        </td>
        <td className="small">
          {c.status === "ready" && (
            <>
              {role}: {flags > 0 && <span className="pill FLAG">{flags} flag</span>}{" "}
              {unclear > 0 && <span className="pill UNCLEAR">{unclear} unclear</span>}
              {flags === 0 && unclear === 0 && <span className="pill PASS">pass</span>}
            </>
          )}
        </td>
        <td>
          {c.arjun_decision ? (
            <span className={`pill ${c.email_status}`}>
              {c.arjun_decision === "ADVANCE" ? "Advance" : "Decline"} · {c.email_status}
            </span>
          ) : (
            <span className="muted small">awaiting you</span>
          )}
        </td>
      </tr>
      {props.open && (
        <tr>
          <td colSpan={8}>
            <Detail c={c} onPatch={props.onPatch} onDelete={props.onDelete} />
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({
  c,
  onPatch,
  onDelete,
}: {
  c: Candidate;
  onPatch: (p: Partial<Candidate>) => void;
  onDelete: () => void;
}) {
  if (c.status === "error") {
    return (
      <div className="panel">
        <p className="err">Processing failed: {c.error}</p>
        <DeleteButton id={c.id} onDelete={onDelete} />
      </div>
    );
  }
  if (c.status !== "ready" || !c.dimensions) {
    return <p className="muted">Still processing… refresh in a minute.</p>;
  }

  return (
    <div className="detail">
      <div>
        <h3>Summary</h3>
        <p style={{ marginTop: 0 }}>{c.summary}</p>

        <h3>Kargo DNA · {c.dna_score}/100</h3>
        <table>
          <tbody>
            {DIMENSION_KEYS.map((k) => {
              const d = c.dimensions![k];
              return (
                <tr key={k}>
                  <td style={{ width: 60 }}>
                    <b>{k}</b>
                    <div className="small muted">w{DIMENSIONS[k].weight}</div>
                  </td>
                  <td>
                    <b>{d.score}/3</b> · {DIMENSIONS[k].name}
                    <div className="quote">{d.evidence}</div>
                    {d.evidence_verified === false && (
                      <span className="pill FLAG">quote not found in CV, check it</span>
                    )}
                    <div className="muted small">{d.rationale}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 style={{ marginTop: 16 }}>Layer 1 · Role fit (flags never auto-reject)</h3>
        {(["PM", "SPM"] as Role[]).map((role) => (
          <div key={role} style={{ marginBottom: 10 }}>
            <b className="small">{ROLE_TITLES[role]}</b>
            <table>
              <tbody>
                {checksFor(c, role).map((chk) => (
                  <tr key={chk.check}>
                    <td style={{ width: 60 }}>{chk.check}</td>
                    <td style={{ width: 80 }}>
                      <span className={`pill ${chk.result}`}>{chk.result}</span>
                    </td>
                    <td className="small">
                      <span className="muted">
                        {LAYER1_CHECKS[role].find((x) => x.check === chk.check)?.label}
                      </span>
                      <div>{chk.reason}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <details>
          <summary>Anonymised CV (exactly what the scorer saw)</summary>
          <pre className="brief small">{c.anonymized_cv}</pre>
        </details>
      </div>

      <div>
        <h3>Interview brief</h3>
        <pre className="brief">{c.interview_brief}</pre>
        <EmailPanel c={c} onPatch={onPatch} />
        <p style={{ marginTop: 16 }}>
          <DeleteButton id={c.id} onDelete={onDelete} />
        </p>
      </div>
    </div>
  );
}

function EmailPanel({ c, onPatch }: { c: Candidate; onPatch: (p: Partial<Candidate>) => void }) {
  const [tab, setTab] = useState<"invite" | "reject">(c.arjun_decision === "DECLINE" ? "reject" : c.band === "DECLINE" ? "reject" : "invite");
  const [email, setEmail] = useState(c.email ?? "");
  const [inviteSubject, setInviteSubject] = useState(c.invite_subject ?? "");
  const [inviteBody, setInviteBody] = useState(c.invite_body ?? "");
  const [rejectSubject, setRejectSubject] = useState(c.reject_subject ?? "");
  const [rejectBody, setRejectBody] = useState(c.reject_body ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const locked = c.email_status === "sent" || c.email_status === "sending";
  const dirty =
    email !== (c.email ?? "") ||
    inviteSubject !== (c.invite_subject ?? "") ||
    inviteBody !== (c.invite_body ?? "") ||
    rejectSubject !== (c.reject_subject ?? "") ||
    rejectBody !== (c.reject_body ?? "");

  async function save(): Promise<boolean> {
    const patch = {
      email,
      invite_subject: inviteSubject,
      invite_body: inviteBody,
      reject_subject: rejectSubject,
      reject_body: rejectBody,
    };
    const res = await fetch(`/api/candidates/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setMsg({ ok: false, text: ((await res.json()) as { error: string }).error });
      return false;
    }
    onPatch(patch);
    return true;
  }

  async function send(decision: "ADVANCE" | "DECLINE") {
    const what = decision === "ADVANCE" ? "the interview invitation" : "the rejection email";
    if (!confirm(`Record your decision (${decision}) and send ${what} to ${email}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      if (dirty && !(await save())) return;
      const res = await fetch(`/api/candidates/${c.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = (await res.json()) as { error?: string; to?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? "Send failed" });
        if (res.status === 502) onPatch({ arjun_decision: decision, email_status: "failed", email_error: json.error ?? null });
        return;
      }
      setMsg({ ok: true, text: `Sent to ${json.to}.` });
      onPatch({ arjun_decision: decision, email_status: "sent", email_sent_at: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Draft emails</h3>
      {locked ? (
        <p>
          <span className={`pill ${c.email_status}`}>{c.email_status}</span>{" "}
          {c.arjun_decision === "ADVANCE" ? "Interview invitation" : "Rejection"} sent
          {c.email_sent_at && ` on ${new Date(c.email_sent_at).toLocaleString()}`}.
        </p>
      ) : (
        <>
          {c.email_status === "failed" && <p className="err">Last send failed: {c.email_error}</p>}
          <div className="email">
            <label className="small muted">
              To
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="candidate@email.com" />
            </label>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button aria-pressed={tab === "invite"} onClick={() => setTab("invite")}>
                Interview invite
              </button>
              <button aria-pressed={tab === "reject"} onClick={() => setTab("reject")}>
                Rejection
              </button>
            </div>
            {tab === "invite" ? (
              <>
                <input value={inviteSubject} onChange={(e) => setInviteSubject(e.target.value)} />
                <textarea value={inviteBody} onChange={(e) => setInviteBody(e.target.value)} />
                <div className="actions">
                  <button className="primary" disabled={busy || !email} onClick={() => void send("ADVANCE")}>
                    {busy ? "Sending…" : "Advance & send invite"}
                  </button>
                  {dirty && (
                    <button disabled={busy} onClick={() => void save().then((ok) => ok && setMsg({ ok: true, text: "Saved." }))}>
                      Save draft
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="muted small" style={{ margin: 0 }}>
                  Rejections name nobody (no candidate name, no Kargo staff) and never mention scores.
                </p>
                <input value={rejectSubject} onChange={(e) => setRejectSubject(e.target.value)} />
                <textarea value={rejectBody} onChange={(e) => setRejectBody(e.target.value)} />
                <div className="actions">
                  <button className="danger" disabled={busy || !email} onClick={() => void send("DECLINE")}>
                    {busy ? "Sending…" : "Decline & send rejection"}
                  </button>
                  {dirty && (
                    <button disabled={busy} onClick={() => void save().then((ok) => ok && setMsg({ ok: true, text: "Saved." }))}>
                      Save draft
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
      {msg && <p className={msg.ok ? "muted" : "err"}>{msg.text}</p>}
    </div>
  );
}

function DeleteButton({ id, onDelete }: { id: string; onDelete: () => void }) {
  return (
    <button
      className="small"
      onClick={async () => {
        if (!confirm("Remove this candidate from the dashboard?")) return;
        const res = await fetch(`/api/candidates/${id}`, { method: "DELETE" });
        if (res.ok) onDelete();
      }}
    >
      Remove candidate
    </button>
  );
}
