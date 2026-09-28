-- Kargo hiring schema. Paste into Supabase -> SQL editor -> Run.
-- All access goes through the Next.js server with the service-role key,
-- so RLS is enabled with NO public policies (the anon key can read/write nothing).

create extension if not exists "pgcrypto";

create table if not exists candidates (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  candidate_file    text not null,

  -- Personal details: stored for contacting the candidate, NEVER sent to the scorer.
  candidate_name    text,
  email             text,
  phone             text,

  role_applied      text not null default 'UNCLEAR' check (role_applied in ('PM', 'SPM', 'UNCLEAR')),
  anonymized_cv     text,                 -- the only CV text the scoring model sees

  layer1_pm         jsonb,                -- [{check, result, reason}]
  layer1_spm        jsonb,
  dimensions        jsonb,                -- {D1..D5: {score, evidence, rationale, evidence_verified}}
  dna_score         int check (dna_score between 0 and 100),
  band              text check (band in ('SHORTLIST', 'REVIEW', 'DECLINE')),
  summary           text,
  probe_questions   jsonb,
  interview_brief   text,

  target_role       text check (target_role in ('PM', 'SPM')),
  invite_subject    text,
  invite_body       text,
  reject_subject    text,
  reject_body       text,

  -- The system recommends. Arjun decides. Stays NULL until he clicks.
  arjun_decision    text check (arjun_decision in ('ADVANCE', 'DECLINE')),
  decided_at        timestamptz,

  email_status      text not null default 'draft' check (email_status in ('draft', 'sending', 'sent', 'failed')),
  email_sent_at     timestamptz,
  resend_id         text,
  email_error       text,

  status            text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error             text,
  model             text
);

create index if not exists candidates_rank on candidates (dna_score desc nulls last);

alter table candidates enable row level security;
-- Intentionally no policies: only the service role (server) can access this table.
