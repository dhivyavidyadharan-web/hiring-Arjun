"use client";

import { useRef, useState } from "react";
import {
  BAND_LABELS,
  CALIBRATION,
  CALIBRATION_TOLERANCE,
  CRITERIA,
  CRITERION_KEYS,
  MAX_LEVEL,
  type CalibrationCheck,
  type RoleResult,
} from "@/lib/rubric";

type Outcome = { state: "scoring" } | { state: "done"; result: RoleResult; check: CalibrationCheck } | { state: "error"; error: string };

/** Rubric §6: run the scorer on the 8 past hires before trusting it on real applicants. */
export default function CalibrationPage() {
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function run(files: File[]) {
    const bad: string[] = [];
    const matched = files.filter((f) => {
      const ok = CALIBRATION.some((t) => f.name.toLowerCase().includes(t.key));
      if (!ok) bad.push(f.name);
      return ok;
    });
    setUnmatched(bad);
    let next = 0;
    async function worker() {
      while (next < matched.length) {
        const f = matched[next++];
        const key = CALIBRATION.find((t) => f.name.toLowerCase().includes(t.key))!.key;
        setOutcomes((o) => ({ ...o, [key]: { state: "scoring" } }));
        const body = new FormData();
        body.append("file", f);
        try {
          const res = await fetch("/api/calibrate", { method: "POST", body });
          const json = (await res.json()) as { error?: string; result?: RoleResult; check?: CalibrationCheck };
          setOutcomes((o) => ({
            ...o,
            [key]: res.ok && json.result && json.check
              ? { state: "done", result: json.result, check: json.check }
              : { state: "error", error: json.error ?? "failed" },
          }));
        } catch (e) {
          setOutcomes((o) => ({ ...o, [key]: { state: "error", error: String(e) } }));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, matched.length) }, worker));
  }

  const done = Object.values(outcomes).filter((o) => o.state === "done") as Extract<Outcome, { state: "done" }>[];
  const allDone = done.length === CALIBRATION.length;
  const passed = done.filter((o) => o.check.pass).length;

  return (
    <main className="wrap">
      <div className="top">
        <div>
          <h1>Calibration · Rubric v2</h1>
          <div className="muted small">
            Score the 8 past-hire CVs with the live pipeline before trusting it on real applicants. Nothing is saved and no
            email is drafted.
          </div>
        </div>
        <a className="btn" href="/">
          ← Dashboard
        </a>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <p style={{ marginTop: 0 }}>
          Upload the hire CVs (file names must contain the first name, e.g. <code>cv_07_lavanya_iyer.docx</code>). Every hire is
          scored as a Product Manager. Documented scores must match within ±{CALIBRATION_TOLERANCE}. The others must land in the
          right band.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          style={{ display: "none" }}
          onChange={(e) => void run(Array.from(e.target.files ?? []))}
        />
        <button className="primary" onClick={() => input.current?.click()}>
          Choose hire CVs
        </button>
        {unmatched.length > 0 && <p className="err small">Skipped (not a calibration hire): {unmatched.join(", ")}</p>}
        {done.length > 0 && (
          <p>
            <b className={passed === done.length ? "pass" : "fail"}>
              {passed}/{done.length} passing
            </b>
            {allDone && (passed === CALIBRATION.length ? " · CALIBRATION PASSED" : " · CALIBRATION FAILED: fix lib/prompts.ts before scoring applicants")}
          </p>
        )}
      </section>

      <section className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Hire</th>
              <th>Outcome</th>
              <th>Expected</th>
              <th>Got</th>
              <th>Levels a-f</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {CALIBRATION.map((t) => {
              const o = outcomes[t.key];
              return (
                <tr key={t.key}>
                  <td>{t.label}</td>
                  <td>{t.outcome}</td>
                  <td>
                    {t.score !== undefined && <b>{t.score} · </b>}
                    {t.band === "NOT_ADVANCE" ? "Hold or Decline" : BAND_LABELS[t.band]}
                    {t.gated && " (gated)"}
                  </td>
                  <td>
                    {o?.state === "done" && (
                      <>
                        <b>{o.result.total}</b> · {BAND_LABELS[o.result.band]}
                        {o.result.gated && " (gated)"}
                        <div className="small muted">gate {o.result.gateScore}/45</div>
                      </>
                    )}
                    {o?.state === "scoring" && <span className="muted">scoring…</span>}
                    {o?.state === "error" && <span className="err small">{o.error}</span>}
                  </td>
                  <td className="small">
                    {o?.state === "done" &&
                      CRITERION_KEYS.map((k) => `${k}${(o.result.points[k] * MAX_LEVEL) / CRITERIA[k].weight}`).join(" ")}
                  </td>
                  <td>
                    {o?.state === "done" &&
                      (o.check.pass ? (
                        <span className="pass">pass</span>
                      ) : (
                        <span className="fail" title={o.check.reasons.join("; ")}>
                          fail: {o.check.reasons.join("; ")}
                        </span>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
