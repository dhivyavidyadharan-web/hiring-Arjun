# Kargo Hiring: PM / Senior PM screening

A hiring dashboard for Arjun (founder, Kargo). He uploads CVs. The app strips personal details and scores every
candidate against **[Kargo Hiring Rubric v2](RUBRIC.md)** for both Product Manager and Senior Product Manager. It then writes
an interview brief and drafts an invitation and a rejection for each person. **Nothing is sent until Arjun clicks Send.**

> The system recommends. Arjun decides. That decision is the last thing he touches.

**Live:** https://kargo-hiring-eta.vercel.app

## Workflow (Trigger → Input → Context → Processing → AI → Output)

| Stage | What happens | Where |
|---|---|---|
| **Trigger** | Arjun uploads one or more CVs (PDF / DOCX / TXT) and picks the role applied for (PM / SPM, or Auto-detect) | `components/Dashboard.tsx` → `POST /api/upload` |
| **Input** | File → plain text | `lib/parse.ts` |
| **Context** | Rubric v2.1: six weighted criteria, the (a)+(b) gate, bands, and the two JDs | `RUBRIC.md`, `lib/prompts.ts`, `lib/rubric.ts` |
| **Processing** | ① Gemini (Flash) pulls out name, email and phone, tags the role (with a reason), and **anonymises** the CV. ② A code-level redaction pass catches anything missed. | `lib/llm.ts`, `lib/redact.ts` |
| **AI** | ③ **Blind scoring** of the anonymised text only, by Gemini (Pro). It returns levels 0–5 with a verbatim quote for (a)–(e), plus (f) role-scope fit for **both** PM and SPM. ④ Gemini (Flash) writes the interview brief and a personalised invitation draft. | `lib/llm.ts`, `lib/pipeline.ts` |
| **Output** | Code computes points, totals for both roles, the gate, the band (Advance 75+ / Review 65–74 / Hold 40–64 or gated / Decline <40) and two probe questions, and checks that every quote really is in the CV. The dashboard ranks candidates for each role and shows all six criteria as chips. | `lib/rubric.ts`, `app/page.tsx` |
| **Action (human)** | Arjun clicks **Invite to interview** or **Send rejection**, then confirms with **Yes, send**. This records `arjun_decision` and sends through **Resend**. | `POST /api/candidates/:id/send` |

### Unclear role

If the role can't be detected, the candidate appears under **Pending scoring: role unclear**, with the tagger's reason
and both role scores. Both roles are already scored, so when Arjun assigns PM or SPM, only the brief and drafts are
written. There's no second scoring pass, so the scores can't drift. A scored candidate can also be switched to the
other role before any email is sent.

### Calibration

`/calibration` scores the 8 past-hire CVs with the live pipeline (nothing is stored, no email is drafted) and marks each one
pass or fail against RUBRIC.md §6. `npm run calibrate -- ./hires` does the same from the terminal.

## Guardrails

- **No email without a decision.** The send route is the only code path that emails anyone. It records `arjun_decision`
  and claims the send in one atomic update (`draft|failed → sending`), so a double click can't send twice. Candidates
  with no role assigned can't be emailed.
- **Blind scoring.** Name, contact details, the file name and zero-weight signals never reach the scorer. Each candidate has an
  "Anonymised CV" view showing exactly what the scorer saw.
- **Arithmetic in code.** The model gives only levels and quotes. Points, gate, bands and probes are deterministic and unit-tested.
- **Evidence check.** If a quote can't be found in the CV, it's flagged in red.
- **Rejections name nobody.** They use a fixed template signed "The Kargo Hiring Team": no candidate name, no Arjun, no staff,
  no blame, no scores. The server re-checks the final (possibly edited) text and refuses to send if a name or score reference is found.
- **Duplicate warning.** An identical file is caught **before** scoring ("Already uploaded", with **Upload anyway**). A different
  file from the same person (same phone, or same full name) is scored but marked **possible duplicate of …**. Email alone
  is not used, because shared inboxes (e.g. a class squad address) would flag unrelated people.
- **Login.** Every page and API route is behind a single-password session. For the graded demo, which uses fictional
  candidates, the login is switched off with `PUBLIC_DEMO=true`. Remove that setting to require the password again.

## Setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # fill in the values
npm test                     # unit tests (rubric maths, gate, bands, redaction, email guardrails)
npm run dev
```

1. **Supabase:** run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. Put the project URL and the **service-role** key in
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
2. **Resend:** set `RESEND_API_KEY`. For testing, keep `EMAIL_FROM="Kargo Hiring <onboarding@resend.dev>"` and set
   `EMAIL_TEST_RECIPIENT` to your Resend signup email. The sandbox sender can only deliver there. For real candidates,
   verify a domain in Resend and change `EMAIL_FROM`.
3. **Gemini:** set `GEMINI_API_KEY` (free at https://aistudio.google.com/apikey). Scoring uses `gemini-pro-latest` and the lighter steps use `gemini-flash-latest`. Override them with `GEMINI_MODEL` / `GEMINI_FAST_MODEL`.
4. **Login:** set `ADMIN_PASSWORD` and `SESSION_SECRET` (32+ random characters).
5. **Calibrate** at `/calibration` before you score real applicants.

## Deploy (Vercel)

Import the repo and add every variable from `.env.example`. The upload route allows up to 300 s per CV, and the dashboard uploads
2 at a time. To redeploy automatically on every push, connect the repo under **Settings → Git**.

## Project layout

```
app/
  page.tsx                              ranked dashboard (server component)
  calibration/page.tsx                  calibration against the 8 past hires
  login/page.tsx                        password sign-in
  api/upload/route.ts                   trigger: CV → parse → anonymise → score → (brief + drafts)
  api/calibrate/route.ts                score one hire CV, compare to RUBRIC.md §6 (stores nothing)
  api/candidates/[id]/route.ts          edit drafts / fix email / remove
  api/candidates/[id]/role/route.ts     assign or switch role → brief + drafts for that role
  api/candidates/[id]/send/route.ts     Arjun's decision + Resend send (the only email path)
components/Dashboard.tsx                upload, role picker, role tabs, ranking with criteria chips, detail + emails
lib/
  rubric.ts      weights, points, gate, bands, probes, evidence check, calibration targets
  prompts.ts     extraction / scoring / brief prompts (rubric v2 text)
  llm.ts         Gemini calls with structured (zod → JSON Schema) outputs
  pipeline.ts    scoreCv() and draftFor(role)
  redact.ts      code-level PII redaction
  emails.ts      invite finalisation, fixed rejection template, rejection guardrail
tests/           vitest unit tests
scripts/calibrate.ts                    CLI calibration
supabase/schema.sql                     candidates table
RUBRIC.md                               the rubric
```
