import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BRIEF_SYSTEM, EXTRACT_SYSTEM, SCORE_SYSTEM } from "./prompts";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

// Server-side refusal fallback: if a safety classifier declines a request,
// the API re-runs it on Anthropic's recommended fallback model in the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const FALLBACK_PARAMS = { fallbacks: "default" } as object;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

type Effort = "low" | "medium" | "high";

async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  user: string,
  effort: Effort,
): Promise<z.output<T>> {
  const response = await getClient().messages.parse(
    {
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort, format: zodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      ...FALLBACK_PARAMS,
    },
    { headers: { "anthropic-beta": FALLBACK_BETA } },
  );

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this CV (refusal).");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Model output was cut off (max_tokens). The CV may be unusually long.");
  }
  if (response.parsed_output == null) {
    throw new Error("Model did not return valid structured output.");
  }
  return schema.parse(response.parsed_output);
}

// ---------- Step 1: extract contact details + anonymise ----------

export const ExtractSchema = z.object({
  candidate_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role_applied: z.enum(["PM", "SPM", "UNCLEAR"]),
  role_reason: z.string(),
  anonymized_cv: z.string(),
});
export type Extracted = z.output<typeof ExtractSchema>;

export function extractCandidate(fileName: string, cvText: string): Promise<Extracted> {
  return structured(
    ExtractSchema,
    EXTRACT_SYSTEM,
    `File name: ${fileName}\n\n<cv>\n${cvText}\n</cv>`,
    "low",
  );
}

// ---------- Step 2: blind scoring against the rubric ----------

const CriterionSchema = z.object({
  level: z.number().int().min(0).max(5),
  evidence: z.string(),
  rationale: z.string(),
});

export const ScoreSchema = z.object({
  a: CriterionSchema,
  b: CriterionSchema,
  c: CriterionSchema,
  d: CriterionSchema,
  e: CriterionSchema,
  f_pm: CriterionSchema,
  f_spm: CriterionSchema,
  summary: z.string(),
});
export type Scored = z.output<typeof ScoreSchema>;

/** Receives ONLY the anonymised CV. No name, contact details, or file name. */
export function scoreCandidate(anonymizedCv: string, roleApplied: string): Promise<Scored> {
  return structured(
    ScoreSchema,
    SCORE_SYSTEM,
    `Role applied for: ${roleApplied}\n\n<cv>\n${anonymizedCv}\n</cv>`,
    "high",
  );
}

// ---------- Step 3: interview brief + invite draft ----------

export const BriefSchema = z.object({
  interview_brief: z.string(),
  invite_body: z.string(),
});
export type Brief = z.output<typeof BriefSchema>;

export function writeBrief(input: {
  anonymizedCv: string;
  targetRoleTitle: string;
  scoringJson: string;
  probes: string[];
}): Promise<Brief> {
  return structured(
    BriefSchema,
    BRIEF_SYSTEM,
    [
      `Target role: ${input.targetRoleTitle}`,
      `Rubric result (JSON):\n${input.scoringJson}`,
      `Probe questions to use:\n1. ${input.probes[0]}\n2. ${input.probes[1]}`,
      `<cv>\n${input.anonymizedCv}\n</cv>`,
    ].join("\n\n"),
    "medium",
  );
}
