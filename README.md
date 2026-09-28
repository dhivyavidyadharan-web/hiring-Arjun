# Kargo Hiring: PM / Senior PM screening

A hiring dashboard for Arjun (founder, Kargo). He uploads CVs. The app strips personal details and scores every
candidate against **Kargo Hiring Rubric v1** for both Product Manager and Senior Product Manager. It then writes an
interview brief and drafts two emails for each person. **Nothing is sent until Arjun clicks Send.**

> The system recommends. Arjun decides. That decision is the last thing he touches.

## Workflow (Trigger → Input → Context → Processing → AI → Output)

| Stage | What happens | Where |
|---|---|---|
| **Trigger** | Arjun uploads one or more CVs (PDF / DOCX / TXT) on the dashboard | `components/Dashboard.tsx` → `POST /api/upload` |
| **Input** | File is converted to plain text | `lib/parse.ts` |
| **Context** | Rubric v1: Layer 1 role-fit checks from the two JDs, plus Layer 2 "Kargo DNA" (5 weighted dimensions learned from the 8 past hires) | `lib/prompts.ts`, `lib/rubric.ts` |
| **Processing** | ① Claude pulls out name, email and phone and **anonymises** the CV. It removes the name, contact details, gender, age, college and hometown, and replaces employer brands with neutral descriptors. ② A code-level redaction pass catches anything that was missed. | `lib/claude.ts#extractCandidate`, `lib/redact.ts` |
| **AI** | ③ **Blind scoring.** The scorer sees *only* the anonymised CV. It returns Layer 1 PASS/FLAG/UNCLEAR for **both** roles and a 0–3 score per dimension, each with a verbatim quote from the CV. ④ Claude writes the interview brief and a personalised invitation draft. | `lib/claude.ts#scoreCandidate`, `#writeBrief` |
| **Output** | Code computes the DNA score (weights 30/20/20/15/15), the band (SHORTLIST ≥75, REVIEW 50–74, DECLINE <50) and the two probe questions for the weakest dimensions, and checks that each quote really appears in the CV. The dashboard ranks candidates by DNA score for each role. | `lib/rubric.ts`, `lib/pipeline.ts`, `app/page.tsx` |
| **Action (human)** | Arjun reads the brief, edits a draft if he wants, and clicks **Advance & send invite** or **Decline & send rejection**. That click records `arjun_decision` and sends the email through **Resend**. | `POST /api/candidates/:id/send` |

## Guardrails built in

- **No email without a decision.** The send endpoint is the only code path that emails anyone. It sets `arjun_decision` and
  claims the send in one atomic DB update (`draft|failed → sending`), so a double click can't send twice.
- **Blind scoring.** Name, contact details, the file name and zero-weight signals never reach the scoring prompt.
  The "Anonymised CV" section on each candidate shows exactly what the scorer saw.
- **Arithmetic in code, not in the model.** The model only gives 0–3 scores and quotes. Weights, totals, bands and probe
  selection are deterministic, so results are reproducible.
- **Evidence check.** If a quoted piece of evidence can't be found in the CV, the dashboard shows it with a red
  *"quote not found in CV"* badge.
- **Flags never auto-reject.** Layer 1 results are displayed next to the band and don't change it.
- **Rejection emails name nobody.** They come from a fixed template signed *"The Kargo Hiring Team"*. They don't contain the candidate's name,
  Arjun's name or any staff name, don't blame anyone, and never mention scores or automated screening. The server
  re-checks the final text (in case Arjun edited it) and refuses to send if a name or score reference slips in.
- **Invitations** are personalised. They use the candidate's first name (filled in by code, so the model never sees it)
  and mention one or two concrete things from their CV. They're signed with `INVITE_SIGNATURE`.
- **Login required.** A single-password session protects the dashboard and every API route.

## Setup

### 1. Install

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # then fill in the values
```

### 2. Supabase

Create a project and open **SQL editor**. Paste in [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. Then copy the
project URL and the **service-role** key into `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. RLS is on and has no public
policies, so only the server can read candidate data.

### 3. Resend

Create an API key at [resend.com](https://resend.com) and put it in `RESEND_API_KEY`.
- **Testing:** use `EMAIL_FROM="Kargo Hiring <onboarding@resend.dev>"`. Resend only delivers from that sender to
  your own Resend account email, so set `EMAIL_TEST_RECIPIENT` to that address. Every email then goes to you instead of the
  candidate, which is useful for a class demo.
- **Real use:** verify a domain in Resend, set `EMAIL_FROM` to an address on it, and leave `EMAIL_TEST_RECIPIENT` empty.

### 4. Claude

Put your key in `ANTHROPIC_API_KEY`. The default model is `claude-opus-5` (you can override it with `CLAUDE_MODEL`). Server-side refusal
fallback (`fallbacks: "default"`) is turned on, so if a safety classifier declines a request, it's retried on the recommended fallback model.

### 5. Calibrate the scorer first (Rubric §8)

Put the 8 past-hire CVs in a folder (e.g. `hires/`, which is git-ignored) and run:

```bash
npm run calibrate -- ./hires
```

It passes if all 5 "Exceeds" hires score ≥ 75 and the other 3 score < 50. If it fails, fix `lib/prompts.ts` before you score
real applicants. (The script reads keys from `.env`, so copy `.env.local` to `.env` or export the variables.)

### 6. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in with `ADMIN_PASSWORD` and upload CVs.

## Deploy (Vercel)

1. Push this repo to GitHub.
2. In Vercel, click **Add New → Project**, import the repo and add every variable from `.env.example`.
3. Deploy. The upload route runs for up to 300 s per CV (three model calls). The dashboard uploads 2 CVs at a time.

## Project layout

```
app/
  page.tsx                         ranked dashboard (server component)
  login/page.tsx                   password sign-in
  api/upload/route.ts              trigger: one CV → parse → anonymise → score → brief → store
  api/candidates/[id]/route.ts     edit drafts / fix email / remove
  api/candidates/[id]/send/route.ts  Arjun's decision + Resend send (only email path)
components/Dashboard.tsx           upload, role tabs, ranking table, detail + email panel
lib/
  rubric.ts      weights, bands, probes, evidence check (deterministic)
  prompts.ts     extraction / scoring / brief prompts (rubric v1 text)
  claude.ts      Claude calls with structured (zod) outputs
  redact.ts      code-level PII redaction
  emails.ts      invite finalisation, fixed rejection template, rejection guardrail
  pipeline.ts    the end-to-end processing for one CV
scripts/calibrate.ts             rubric §8 calibration against the 8 hires
supabase/schema.sql              candidates table
```

## Known limits (from Rubric v1)

- Built from 8 hires, only 2 of them PMs. It screens how people work, not PM craft. Layer 1 covers craft.
- Calibrated on the same 8 CVs it was built from. The real test is whether Arjun agrees with the ranking of real applicants.
- Uses CVs only. Interview and outcome notes should be used to refine D4 and D5 in v2.
