import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { BRIEF_SYSTEM, EXTRACT_SYSTEM, SCORE_SYSTEM } from "./prompts";

// Scoring is the judgment-heavy step, so it gets the Pro model. Extraction/anonymisation
// and the brief + invite draft are lighter and use Flash. Both are overridable per env.
export const SCORE_MODEL = process.env.GEMINI_MODEL || "gemini-pro-latest";
export const FAST_MODEL = process.env.GEMINI_FAST_MODEL || "gemini-flash-latest";
export const MODEL = `${SCORE_MODEL} (+ ${FAST_MODEL})`;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** zod -> JSON Schema for Gemini's responseJsonSchema (the $schema marker is not accepted). */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

async function structured<T extends z.ZodType>(
  model: string,
  schema: T,
  system: string,
  user: string,
): Promise<z.output<T>> {
  const response = await getClient().models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchemaFor(schema),
    },
  });

  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini blocked this request (${blocked}).`);
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") {
    throw new Error("Model output was cut off (MAX_TOKENS). The CV may be unusually long.");
  }
  if (finish && finish !== "STOP") throw new Error(`Gemini stopped early (${finish}).`);

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON.");
  }
  // Re-validate: enforces the int ranges and enums client-side too.
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`Gemini output did not match the schema: ${parsed.error.message}`);
  return parsed.data;
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
  return structured(FAST_MODEL, ExtractSchema, EXTRACT_SYSTEM, `File name: ${fileName}\n\n<cv>\n${cvText}\n</cv>`);
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
    SCORE_MODEL,
    ScoreSchema,
    SCORE_SYSTEM,
    `Role applied for: ${roleApplied}\n\n<cv>\n${anonymizedCv}\n</cv>`,
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
    FAST_MODEL,
    BriefSchema,
    BRIEF_SYSTEM,
    [
      `Target role: ${input.targetRoleTitle}`,
      `Rubric result (JSON):\n${input.scoringJson}`,
      `Probe questions to use:\n1. ${input.probes[0]}\n2. ${input.probes[1]}`,
      `<cv>\n${input.anonymizedCv}\n</cv>`,
    ].join("\n\n"),
  );
}
