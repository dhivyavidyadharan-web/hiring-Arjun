"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) window.location.href = "/";
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Login failed");
  }

  return (
    <main className="wrap">
      <form className="panel login" onSubmit={submit}>
        <h1 style={{ fontSize: 18, marginTop: 0 }}>Kargo Hiring</h1>
        <p className="muted">Sign in to review candidates.</p>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="err">{error}</p>}
        <p>
          <button className="primary" disabled={busy || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </p>
      </form>
    </main>
  );
}
