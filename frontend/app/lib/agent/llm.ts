/**
 * Thin OpenRouter chat client for the diagnostic agent.
 *
 * The DECISION step needs a model that reliably returns structured JSON. We use
 * OpenRouter's `gpt-oss-120b` (creds in frontend/.env, see CLAUDE.md). The key
 * and model are read from the environment so nothing is hardcoded.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b";
// The decision model (gpt-oss-120b) is text-only, so the image pre-step uses a
// separate multimodal model. Override with OPENROUTER_VISION_MODEL.
const VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL ?? "openai/gpt-4o-mini";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const ATTRIBUTION = {
  "HTTP-Referer": "http://localhost:3000",
  "X-Title": "AcmeMobility Diagnostic Assistant",
};

/**
 * Vision pre-step: describe a customer-uploaded photo as troubleshooting-
 * relevant text. The description is later injected into the symptom history so
 * the (text-only) diagnostic loop can reason over what the image shows — e.g. a
 * blinking error code, a leak, a cracked part, a display reading.
 *
 * Returns a concise factual description, or throws on transport error (callers
 * degrade gracefully so a vision hiccup never blocks the chat).
 */
export async function describeImage(
  dataUrl: string,
  context: { product: string; category: string; symptom?: string },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set in frontend/.env");
  }

  const instruction =
    `A customer is troubleshooting a ${context.product} (${context.category}) and shared this photo.` +
    (context.symptom ? ` They said: "${context.symptom}".` : "") +
    ` Describe ONLY what is visibly relevant to diagnosing a fault: error codes or` +
    ` indicator lights and their colour/state, on-screen readings, leaks, cracks,` +
    ` burn marks, loose/disconnected parts, blockages, or wear. Be concrete and` +
    ` factual in 1-3 sentences. If nothing diagnostic is visible, say so plainly.`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...ATTRIBUTION,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 250,
      provider: { sort: "throughput" },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `OpenRouter vision error (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision model returned no content");
  return content.trim();
}

/**
 * Call the model and parse its reply as JSON. Uses response_format=json_object
 * and strips accidental markdown fences before parsing so a stray ```json block
 * doesn't blow up the route.
 */
export async function chatJSON<T>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set in frontend/.env");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Optional attribution headers OpenRouter recommends.
      ...ATTRIBUTION,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 700,
      // gpt-oss is a reasoning model; low effort cuts a few seconds of latency
      // while staying reliable for this constrained triage task.
      reasoning: { effort: "low" },
      // Route to the fastest provider serving this model. Without this,
      // OpenRouter's default routing occasionally lands on a slow provider and
      // a turn could take 20-30s; sorting by throughput keeps turns ~1s.
      provider: { sort: "throughput" },
      response_format: { type: "json_object" },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `OpenRouter error (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no content");
  }

  return parseLooseJSON<T>(content);
}

/** Parse JSON that may be wrapped in ```json fences or surrounded by prose. */
function parseLooseJSON<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Fall back to the first {...} block.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error(`Model did not return valid JSON: ${raw.slice(0, 200)}`);
  }
}
