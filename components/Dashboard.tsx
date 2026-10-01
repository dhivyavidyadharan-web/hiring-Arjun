"use client";

import { useMemo, useRef, useState } from "react";
import {
  BAND_LABELS,
  CRITERIA,
  CRITERION_KEYS,
  GATE_MAX,
  GATE_THRESHOLD,
  levelsFor,
  points,
  ROLE_TITLES,
  scoreFor,
  suggestedRole,
  type Band,
  type Criteria,
  type CriterionKey,
  type CriterionScore,
  type Role,
} from "@/lib/rubric";

export interface Candidate {
  id: string;
  created_at: string;
  candidate_file: string;
  candidate_name: string | null;
  email: string | null;
  role_applied: "PM" | "SPM" | "UNCLEAR";
  role_reason: string | null;
  anonymized_cv: string | null;
  criteria: Criteria | null;
  score_pm: number | null;
  score_spm: number | null;
  band_pm: Band | null;
  band_spm: Band | null;
  gated: boolean | null;
  summary: string | null;
  target_role: Role | null;
  score: number | null;
  band: Band | null;
  probe_questions: string[] | null;
  interview_brief: string | null;
  invite_subject: string | null;
  invite_body: string | null;
  reject_subject: string | null;
  reject_body: string | null;
  arjun_decision: "ADVANCE" | "DECLINE" | null;
  decided_at: string | null;
  email_status: "draft" | "sending" | "sent" | "failed";
  email_sent_at: string | null;
  email_error: string | null;
  status: "processing" | "needs_role" | "ready" | "error";
  error: string | null;
}

type View = Role | "ALL";
type QueueItem = { name: string; state: "waiting" | "scoring" | "done" | "error"; note?: string };

const CONCURRENCY = 2;

/** Score/band to show in a list: the viewed role's, or the candidate's target role in "All". */
function shown(c: Candidate, view: View): { role: Role | null; score: number | null; band: Band | null } {
  if (view === "PM") return { role: "PM", score: c.score_pm, band: c.band_pm };
  if (view === "SPM") return { role: "SPM", score: c.score_spm, band: c.band_spm };
  return { role: c.target_role, score: c.score, band: c.band };
}

export default function Dashboard({ initial }: { initial: Candidate[] }) {
  const [candidates, setCandidates] = useState(initial);
  const [view, setView] = useState<View>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadRole, setUploadRole] = useState<Role | "AUTO">("AUTO");
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setQueue(files.map((f) => ({ name: f.name, state: "waiting" })));
    const update = (i: number, patch: Partial<QueueItem>) =>
      setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

    let next = 0;
    async function worker() {
      while (next < files.length) {
        const i = next++;
        update(i, { state: "scoring" });
        const body = new FormData();
        body.append("file", files[i]);
        if (uploadRole !== "AUTO") body.append("role", uploadRole);
        try {
          const res = await fetch("/api/upload", { method: "POST", body });
          const json = (await res.json()) as { error?: string; score?: number | null; band?: Band | null; role?: string };
          if (!res.ok) update(i, { state: "error", note: json.error });
          else if (json.role === "UNCLEAR") update(i, { state: "done", note: "role unclear: pick it below" });
          else update(i, { state: "done", note: `${json.score}/100 · ${json.band ? BAND_LABELS[json.band] : ""}` });
        } catch (e) {
          update(i, { state: "error", note: String(e) });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    // Re-render the server page so new candidates arrive in ranked order.
    window.location.reload();
  }

  const needsRole = candidates.filter((c) => c.status === "needs_role");
  const ranked = useMemo(() => {
    const list = candidates.filter(
      (c) => c.status !== "needs_role" && (view === "ALL" || c.role_applied === view || c.status !== "ready"),
    );
    return [...list].sort((x, y) => (shown(y, view).score ?? -1) - (shown(x, view).score ?? -1));
  }, [candidates, view]);

  const ready = candidates.filter((c) => c.status === "ready");
  const stats = {
    total: candidates.length,
    advance: ready.filter((c) => c.band === "ADVANCE").length,
    hold: ready.filter((c) => c.band === "HOLD").length,
    decline: ready.filter((c) => c.band === "DECLINE").length,
    needsRole: needsRole.length,
    sent: candidates.filter((c) => c.email_status === "sent").length,
  };

  function patchLocal(id: string, patch: Partial<Candidate>) {
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeLocal(id: string) {
    setCandidates((cs) => cs.filter((c) => c.id !== id));
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
        <div className="actions">
          <a className="btn" href="/calibration">
            Calibration
          </a>
          <form action="/api/logout" method="post">
            <button>Sign out</button>
          </form>
        </div>
      </div>

      <div className="stats">
        <Stat label="Candidates" value={stats.total} />
        <Stat label="Advance (70+)" value={stats.advance} />
        <Stat label="Hold (40-69 / gated)" value={stats.hold} />
        <Stat label="Decline (<40)" value={stats.decline} />
        <Stat label="Need a role" value={stats.needsRole} />
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
            Pick the role these CVs applied for (or let the app detect it). Personal details are removed before scoring, and every candidate is scored for both roles.
          </p>
          <div className="tabs" style={{ justifyContent: "center", margin: "0 0 10px" }} role="radiogroup" aria-label="Role applied for">
            <span className="small muted" style={{ alignSelf: "center" }}>Role applied for:</span>
            {(["PM", "SPM", "AUTO"] as const).map((r) => (
              <button key={r} role="radio" aria-checked={uploadRole === r} aria-pressed={uploadRole === r} onClick={() => setUploadRole(r)}>
                {r === "AUTO" ? "Auto-detect" : ROLE_TITLES[r]}
              </button>
            ))}
          </div>
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
                <span className={`pill ${q.state === "done" ? "ADVANCE" : q.state === "error" ? "DECLINE" : "draft"}`}>
                  {q.state}
                </span>{" "}
                {q.name} {q.note && <span className="muted">· {q.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {needsRole.length > 0 && (
        <section className="panel">
          <h2 className="h2">Pending scoring: role unclear ({needsRole.length})</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Both roles are already scored. Pick the role this person applied for, and the brief and email drafts will be written for it.
          </p>
          {needsRole.map((c) => (
            <RolePicker key={c.id} c={c} onDone={(patch) => patchLocal(c.id, patch)} onDelete={() => removeLocal(c.id)} />
          ))}
        </section>
      )}

      <section className="panel">
        <div className="tabs">
          {(["ALL", "PM", "SPM"] as View[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "ALL" ? "All candidates" : ROLE_TITLES[v]}
            </button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          {view === "ALL"
            ? "Ranked by each candidate's score for the role they applied for."
            : `People who applied for ${ROLE_TITLES[view]}, ranked by their ${view} score (role-scope fit is scored for ${view}).`}
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Candidate</th>
                <th>Role</th>
                <th>Score</th>
                <th>Band</th>
                <th>Criteria (level 0-5)</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c, i) => (
                <Row
                  key={c.id}
                  rank={i + 1}
                  c={c}
                  view={view}
                  open={openId === c.id}
                  onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                  onPatch={(p) => patchLocal(c.id, p)}
                  onDelete={() => removeLocal(c.id)}
                />
              ))}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
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

function BandPill({ band, gated }: { band: Band | null; gated: boolean | null }) {
  if (!band) return null;
  return (
    <>
      <span className={`pill ${band}`}>{BAND_LABELS[band]}</span>
      {gated && (
        <span className="pill gated" title={`(a)+(b) below ${GATE_THRESHOLD}/${GATE_MAX}: capped at Hold`}>
          gated
        </span>
      )}
    </>
  );
}

function Chips({ criteria, role }: { criteria: Criteria; role: Role }) {
  const levels = levelsFor(criteria, role);
  return (
    <div className="chips">
      {CRITERION_KEYS.map((k) => (
        <span key={k} className={`chip l${levels[k]}`} title={`${CRITERIA[k].name}: level ${levels[k]}/5`}>
          {k} {CRITERIA[k].short} <b>{levels[k]}</b>
        </span>
      ))}
    </div>
  );
}

function RolePicker({
  c,
  onDone,
  onDelete,
}: {
  c: Candidate;
  onDone: (p: Partial<Candidate>) => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState<Role | null>(null);
  const [err, setErr] = useState("");
  const suggestion = c.criteria ? suggestedRole(c.criteria) : null;

  async function pick(role: Role) {
    setBusy(role);
    setErr("");
    const res = await fetch(`/api/candidates/${c.id}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setBusy(null);
    if (!res.ok) {
      setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
      return;
    }
    // Reload so the brief and drafts written by the server arrive.
    onDone({ status: "ready", role_applied: role, target_role: role });
    window.location.reload();
  }

  return (
    <div className="picker">
      <div>
        <b>{c.candidate_name ?? "(name not found)"}</b> <span className="muted small">· {c.candidate_file}</span>
        <div className="small">
          <span className="muted">Why unclear:</span> {c.role_reason ?? "no reason recorded"}
        </div>
        <div className="small muted">
          PM score {c.score_pm ?? "–"} ({c.band_pm ? BAND_LABELS[c.band_pm] : "–"}) · SPM score {c.score_spm ?? "–"} (
          {c.band_spm ? BAND_LABELS[c.band_spm] : "–"}){c.gated ? " · gated" : ""}
          {suggestion && ` · better fit: ${suggestion}`}
        </div>
        {c.criteria && <Chips criteria={c.criteria} role={suggestion ?? "PM"} />}
      </div>
      <div className="actions">
        {(["PM", "SPM"] as Role[]).map((r) => (
          <button key={r} className={r === suggestion ? "primary" : ""} disabled={busy !== null} onClick={() => void pick(r)}>
            {busy === r ? "Writing brief…" : `Assign ${ROLE_TITLES[r]}`}
          </button>
        ))}
        <DeleteButton id={c.id} onDelete={onDelete} />
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
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
  const s = shown(c, view);

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
          {c.status === "ready" && s.score !== null ? (
            <>
              <b>{s.score}</b>
              <div className="bar">
                <i style={{ width: `${s.score}%` }} />
              </div>
            </>
          ) : (
            <span className={`pill ${c.status}`}>{c.status}</span>
          )}
        </td>
        <td>
          <BandPill band={s.band} gated={c.gated} />
        </td>
        <td>{c.criteria && s.role && <Chips criteria={c.criteria} role={s.role} />}</td>
        <td>
          {c.arjun_decision ? (
            <span className={`pill ${c.email_status}`}>
              {c.arjun_decision === "ADVANCE" ? "Invited" : "Declined"} · {c.email_status}
            </span>
          ) : (
            <span className="muted small">awaiting you</span>
          )}
        </td>
      </tr>
      {props.open && (
        <tr>
          <td colSpan={7}>
            <Detail c={c} onPatch={props.onPatch} onDelete={props.onDelete} />
          </td>
        </tr>
      )}
    </>
  );
}

function CriterionRow({ k, c, role }: { k: CriterionKey; c: CriterionScore; role?: Role }) {
  return (
    <tr>
      <td style={{ width: 90 }}>
        <b>({k})</b> {role && <span className="small muted">{role}</span>}
        <div className="small muted">
          {points(k, c.level)}/{CRITERIA[k].weight} pts
        </div>
      </td>
      <td>
        <span className={`chip l${c.level}`}>
          <b>{c.level}/5</b>
        </span>{" "}
        {CRITERIA[k].name}
        <div className="quote">{c.evidence}</div>
        {c.evidence_verified === false && <span className="pill DECLINE">quote not found in CV, check it</span>}
        <div className="muted small">{c.rationale}</div>
      </td>
    </tr>
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
  if (c.status !== "ready" || !c.criteria || !c.target_role) {
    return <p className="muted">Still processing… refresh in a minute.</p>;
  }
  const role = c.target_role;
  const r = scoreFor(c.criteria, role);
  const other: Role = role === "PM" ? "SPM" : "PM";

  return (
    <div className="detail">
      <div>
        <h3>Summary</h3>
        <p style={{ marginTop: 0 }}>{c.summary}</p>

        <h3>
          Rubric v2 · {ROLE_TITLES[role]} · {r.total}/100 · {BAND_LABELS[r.band]}
        </h3>
        <p className="small" style={{ marginTop: 0 }}>
          Gate (a)+(b): <b>{r.gateScore}</b>/{GATE_MAX}{" "}
          {r.gated ? (
            <span className="pill gated">below {GATE_THRESHOLD}, capped at Hold</span>
          ) : (
            <span className="muted">passes</span>
          )}
          <span className="muted">
            {" "}
            · {ROLE_TITLES[other]} score: {other === "PM" ? c.score_pm : c.score_spm}
          </span>
        </p>
        <table>
          <tbody>
            {(["a", "b", "c", "d", "e"] as const).map((k) => (
              <CriterionRow key={k} k={k} c={c.criteria![k]} />
            ))}
            <CriterionRow k="f" c={c.criteria.f_pm} role="PM" />
            <CriterionRow k="f" c={c.criteria.f_spm} role="SPM" />
          </tbody>
        </table>

        <details style={{ marginTop: 12 }}>
          <summary>Anonymised CV (exactly what the scorer saw)</summary>
          <pre className="brief small">{c.anonymized_cv}</pre>
        </details>
      </div>

      <div>
        <h3>Interview brief</h3>
        <pre className="brief">{c.interview_brief}</pre>
        <EmailPanel c={c} onPatch={onPatch} />
        <div className="actions" style={{ marginTop: 16 }}>
          <ChangeRole c={c} to={other} />
          <DeleteButton id={c.id} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

function ChangeRole({ c, to }: { c: Candidate; to: Role }) {
  const [busy, setBusy] = useState(false);
  if (c.email_status === "sent" || c.email_status === "sending") return null;
  return (
    <button
      className="small"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Re-target this candidate to ${ROLE_TITLES[to]}? The brief and drafts will be rewritten.`)) return;
        setBusy(true);
        const res = await fetch(`/api/candidates/${c.id}/role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: to }),
        });
        if (res.ok) window.location.reload();
        else {
          setBusy(false);
          alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
        }
      }}
    >
      {busy ? "Rewriting…" : `Switch to ${to}`}
    </button>
  );
}

function EmailPanel({ c, onPatch }: { c: Candidate; onPatch: (p: Partial<Candidate>) => void }) {
  const [tab, setTab] = useState<"invite" | "reject">(
    c.arjun_decision === "DECLINE" || (c.arjun_decision === null && c.band === "DECLINE") ? "reject" : "invite",
  );
  const [email, setEmail] = useState(c.email ?? "");
  const [inviteSubject, setInviteSubject] = useState(c.invite_subject ?? "");
  const [inviteBody, setInviteBody] = useState(c.invite_body ?? "");
  const [rejectSubject, setRejectSubject] = useState(c.reject_subject ?? "");
  const [rejectBody, setRejectBody] = useState(c.reject_body ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"ADVANCE" | "DECLINE" | null>(null);
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
    setConfirming(null);
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

  const sendButton = (decision: "ADVANCE" | "DECLINE") =>
    confirming === decision ? (
      <span className="confirm">
        Send to <b>{email}</b>?{" "}
        <button className={decision === "ADVANCE" ? "primary" : "danger"} onClick={() => void send(decision)}>
          Yes, send
        </button>{" "}
        <button onClick={() => setConfirming(null)}>Cancel</button>
      </span>
    ) : (
      <button
        className={decision === "ADVANCE" ? "primary" : "danger"}
        disabled={busy || !email}
        onClick={() => setConfirming(decision)}
      >
        {busy ? "Sending…" : decision === "ADVANCE" ? "Invite to interview" : "Send rejection"}
      </button>
    );

  const saveButton = dirty && (
    <button disabled={busy} onClick={() => void save().then((ok) => ok && setMsg({ ok: true, text: "Saved." }))}>
      Save draft
    </button>
  );

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
        <div className="email">
          {c.email_status === "failed" && <p className="err">Last send failed: {c.email_error}</p>}
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
                {sendButton("ADVANCE")}
                {saveButton}
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
                {sendButton("DECLINE")}
                {saveButton}
              </div>
            </>
          )}
        </div>
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
      Remove
    </button>
  );
}
