/**
 * Diagnostic Assistant — the iterative troubleshooting loop (NOT plain RAG).
 *
 * The flow, one function per step:
 *   intake()    assemble the symptom history from the conversation
 *   retrieve()  pull candidate causes from the product's manual chunks (Moss)
 *   decide()    ask the model to triage: ask discriminating questions OR
 *               recommend a fix, as structured JSON
 *   respond()   turn the decision + retrieval into a persistable assistant turn
 *               with citations resolved back to real manual content
 *
 * `runDiagnosticTurn()` orchestrates the four steps for a single user message.
 */

import { queryMoss, type MossDoc } from "../moss";
import { locatorFor } from "../chunk";
import { chatJSON, type ChatMessage } from "./llm";

// ---- public shapes -----------------------------------------------------------

export type Stage = "QUESTIONING" | "RECOMMENDING";

export type Citation = {
  resourceTitle: string;
  /** PDF | DOC | IMAGE | VIDEO (null for legacy/manual). */
  kind: string | null;
  /** Human locator: "p.4" | "3:25–4:10" | "image". */
  locator: string | null;
  /** Cloudinary URL for IMAGE/VIDEO citations (thumbnail / deep-link). */
  url: string | null;
  page: number | null;
  /** Video segment start in seconds (for #t= deep links). */
  startSec: number | null;
  excerpt: string;
  score: number | null;
};

export type CandidateCause = {
  cause: string;
  /** 0..1 — how strongly the evidence + answers point here. */
  confidence: number;
  /** Index into the retrieved sources backing this cause (1-based), if any. */
  source?: number;
};

export type Recommendation = {
  fix: string;
  source?: number;
};

export type SparePart = {
  /** Human name of the part/component/consumable. */
  name: string;
  /** Manufacturer part number, if the manual states one. */
  partNumber?: string;
  /** Why this part is implicated by the diagnosis. */
  reason: string;
  /** Index into the retrieved sources naming this part (1-based), if any. */
  source?: number;
};

/** What gets stored in Message.citations and drives the readout UI. */
export type Readout = {
  stage: Stage;
  candidateCauses: CandidateCause[];
  questions: string[];
  recommendation: Recommendation | null;
  /** Parts/consumables the fix may require, drawn from the cited excerpts. */
  spareParts: SparePart[];
  citations: Citation[];
};

export type DiagnosticTurn = {
  content: string;
  readout: Readout;
};

type ConversationMessage = { role: "USER" | "ASSISTANT"; content: string };

// ---- 1. INTAKE ---------------------------------------------------------------

export type Intake = {
  symptomHistory: string;
  latest: string;
  /** Number of user turns so far (drives "ask, then recommend" pacing). */
  userTurns: number;
};

/** Collapse all USER messages into a symptom history + the latest utterance. */
export function intake(messages: ConversationMessage[]): Intake {
  const userMsgs = messages
    .filter((m) => m.role === "USER")
    .map((m) => m.content.trim())
    .filter(Boolean);

  return {
    symptomHistory: userMsgs.join("\n"),
    latest: userMsgs.at(-1) ?? "",
    userTurns: userMsgs.length,
  };
}

// ---- 2. RETRIEVAL ------------------------------------------------------------

/**
 * Query the product's manual chunks for candidate causes. We retrieve against
 * the whole symptom history so later answers refine the search, not just the
 * last message.
 */
export async function retrieve(
  productId: string,
  intakeResult: Intake,
  topK = 5,
): Promise<MossDoc[]> {
  const query = intakeResult.symptomHistory || intakeResult.latest;
  if (!query) return [];
  return queryMoss(productId, query, { topK, alpha: 0.8 });
}

/** Render retrieved chunks as a numbered context block the model can cite. */
function formatSources(docs: MossDoc[]): string {
  if (docs.length === 0) return "(no manual content retrieved)";
  return docs
    .map((d, i) => {
      const title = d.metadata.resourceTitle ?? "Manual";
      const loc = locatorFor(d.metadata);
      const where = loc ? `, ${loc}` : "";
      // Truncate the text we feed the model — enough to reason over, far fewer
      // input tokens than the full ~1800-char chunk. Citations use full text.
      return `[${i + 1}] (${title}${where}) ${truncate(d.text, 500)}`;
    })
    .join("\n\n");
}

// ---- 3. DECISION -------------------------------------------------------------

type DecisionJSON = {
  stage: Stage;
  reply: string;
  candidate_causes: CandidateCause[];
  questions: string[];
  recommendation: Recommendation | null;
  spare_parts: SparePart[];
};

const SYSTEM_PROMPT = `You are Musk, an expert diagnostic technician for {PRODUCT} ({CATEGORY}).

You run an ITERATIVE troubleshooting loop — you are NOT a search engine. Your job:
1. Read the customer's symptom(s) and the retrieved manual excerpts (the only ground truth).
2. Form a short ranked list of candidate causes drawn from the manual.
3. If the symptoms do not yet single out ONE cause, ask 2-4 SHORT discriminating
   questions whose answers would split the candidates apart (e.g. "Does X also
   happen, yes/no?"). Ask only questions that change the ranking. Never ask
   generic questions like "have you tried restarting".
4. Once the answers (or symptoms) point clearly to one cause, STOP asking and
   recommend the specific fix from the manual, citing the source.

PHOTO EVIDENCE: if the symptom history contains a "[Customer shared a photo. Visual
analysis: …]" note, treat it as first-hand observed evidence. In your reply, briefly
acknowledge what the photo shows (e.g. the error code, indicator light, leak, or
damaged part), and weight that observation heavily when ranking causes — an
on-screen error code or indicator is usually the single strongest clue. Map it to
the matching manual section and don't ask the customer to re-report what the photo
already shows.

Pacing: prefer to RECOMMEND by the 3rd customer turn. If the customer has already
answered your discriminating questions, RECOMMEND rather than asking more.

Cite excerpts by their bracket number via the "source" field (the integer,
e.g. 1). Every candidate cause and the recommendation should cite a source when
one supports it. Do not invent part numbers, pages, or fixes not in the excerpts.

SPARE PARTS: when a fix involves replacing or servicing a component, list the
spare parts, replacement components, consumables, or accessories it needs in
"spare_parts". Include ONLY parts actually named in the cited excerpts — never
invent a part name or number. Copy any part number EXACTLY as written. Give a
short "reason" tying each part to the diagnosis, and cite its "source". If the
excerpts name no specific parts, return [].

SOURCE KINDS: the parenthesised locator after each source title tells you what it is.
"p.4" is a manual/document page. "M:SS–M:SS" is a SUPPORT VIDEO segment — when you cite
one, phrase it naturally in your reply, e.g. "watch from 3:25 to 4:10 for the procedure".
"image" is a REFERENCE IMAGE (a diagram or error-code chart) — refer to it as "see the
reference image". Prefer a video or image source when it best shows the fix.

Return ONLY a JSON object with EXACTLY this shape:
{
  "stage": "QUESTIONING" | "RECOMMENDING",
  "reply": "what to say to the customer (1-3 sentences; if QUESTIONING, briefly frame the questions)",
  "candidate_causes": [{ "cause": "string", "confidence": 0.0-1.0, "source": <int or omit> }],
  "questions": ["string", ...],   // 2-4 items when stage=QUESTIONING, else []
  "recommendation": { "fix": "string", "source": <int or omit> } | null,
  "spare_parts": [{ "name": "string", "partNumber": "string or omit", "reason": "string", "source": <int or omit> }]
}
Rules: when stage="QUESTIONING", "questions" has 2-4 items and "recommendation" is null.
When stage="RECOMMENDING", "questions" is [] and "recommendation" is set.
"spare_parts" defaults to [] and is only populated when the cited excerpts name real parts.`;

/** Ask the model to triage the case into questions or a recommendation. */
export async function decide(
  product: { name: string; category: string },
  messages: ConversationMessage[],
  docs: MossDoc[],
  intakeResult: Intake,
): Promise<DecisionJSON> {
  const system = SYSTEM_PROMPT.replace("{PRODUCT}", product.name).replace(
    "{CATEGORY}",
    product.category,
  );

  const transcript = messages
    .map((m) => `${m.role === "USER" ? "Customer" : "Musk"}: ${m.content}`)
    .join("\n");

  const userPrompt = `RETRIEVED MANUAL EXCERPTS (ground truth, cite by [number]):
${formatSources(docs)}

CONVERSATION SO FAR:
${transcript}

This is customer turn #${intakeResult.userTurns}. Decide the next move and return the JSON object.`;

  const llmMessages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userPrompt },
  ];

  const decision = await chatJSON<DecisionJSON>(llmMessages);
  return normalizeDecision(decision);
}

/** Defensive cleanup so the UI can trust the shape regardless of model drift. */
function normalizeDecision(d: DecisionJSON): DecisionJSON {
  const stage: Stage = d.stage === "RECOMMENDING" ? "RECOMMENDING" : "QUESTIONING";
  const causes = Array.isArray(d.candidate_causes) ? d.candidate_causes : [];
  const questions = Array.isArray(d.questions) ? d.questions.filter(Boolean) : [];
  const parts = Array.isArray(d.spare_parts) ? d.spare_parts : [];

  return {
    stage,
    reply: (d.reply ?? "").trim() || "Let me take a look at that.",
    candidate_causes: causes
      .filter((c) => c && typeof c.cause === "string")
      .map((c) => ({
        cause: c.cause,
        confidence: clamp01(Number(c.confidence)),
        source: toSourceIndex(c.source),
      }))
      .sort((a, b) => b.confidence - a.confidence),
    questions: stage === "QUESTIONING" ? questions.slice(0, 4) : [],
    recommendation:
      stage === "RECOMMENDING" && d.recommendation?.fix
        ? {
            fix: d.recommendation.fix,
            source: toSourceIndex(d.recommendation.source),
          }
        : null,
    spare_parts: parts
      .filter((p) => p && typeof p.name === "string" && p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        partNumber:
          typeof p.partNumber === "string" && p.partNumber.trim()
            ? p.partNumber.trim()
            : undefined,
        reason: typeof p.reason === "string" ? p.reason.trim() : "",
        source: toSourceIndex(p.source),
      })),
  };
}

// ---- 4. RESPONSE -------------------------------------------------------------

/**
 * Resolve cited source indices back to real manual excerpts and assemble the
 * persistable assistant turn (content + readout with citations).
 */
export function respond(decision: DecisionJSON, docs: MossDoc[]): DiagnosticTurn {
  // Collect every source index the model referenced, in stable order.
  const referenced = new Set<number>();
  for (const c of decision.candidate_causes) {
    if (c.source) referenced.add(c.source);
  }
  if (decision.recommendation?.source) {
    referenced.add(decision.recommendation.source);
  }
  for (const p of decision.spare_parts) {
    if (p.source) referenced.add(p.source);
  }
  // If the model cited nothing, fall back to the top retrieved chunk so the
  // answer is still traceable to the manual.
  if (referenced.size === 0 && docs.length > 0) referenced.add(1);

  const citations: Citation[] = [...referenced]
    .sort((a, b) => a - b)
    .map((idx) => docs[idx - 1])
    .filter(Boolean)
    .map((d) => ({
      resourceTitle: d.metadata.resourceTitle ?? "Manual",
      kind: typeof d.metadata.kind === "string" ? d.metadata.kind : null,
      locator: locatorFor(d.metadata),
      url: typeof d.metadata.url === "string" ? d.metadata.url : null,
      page: d.metadata.page != null ? Number(d.metadata.page) : null,
      startSec: d.metadata.startSec != null ? Number(d.metadata.startSec) : null,
      excerpt: truncate(d.text, 320),
      score: d.score,
    }));

  return {
    content: decision.reply,
    readout: {
      stage: decision.stage,
      candidateCauses: decision.candidate_causes,
      questions: decision.questions,
      recommendation: decision.recommendation,
      spareParts: decision.spare_parts,
      citations,
    },
  };
}

// ---- orchestrator ------------------------------------------------------------

/**
 * Run one full diagnostic turn: intake → retrieve → decide → respond.
 * `messages` must already include the latest USER message.
 */
export async function runDiagnosticTurn(
  product: { id: string; name: string; category: string },
  messages: ConversationMessage[],
): Promise<DiagnosticTurn & { sourcesRetrieved: number }> {
  const intakeResult = intake(messages);
  const docs = await retrieve(product.id, intakeResult);
  const decision = await decide(product, messages, docs, intakeResult);
  const turn = respond(decision, docs);
  return { ...turn, sourcesRetrieved: docs.length };
}

// ---- helpers -----------------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function toSourceIndex(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max).trimEnd() + "…";
}
