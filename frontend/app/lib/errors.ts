/**
 * Centralized API error handling.
 *
 * Goal for the demo: never leak a raw error string / stack trace to the client,
 * but always log the full detail server-side so we can debug. `friendlyMessage`
 * classifies the failure by its source (Moss/pgvector retrieval, the LLM/vision
 * API, or PDF parsing) so the user sees something actionable.
 */

export function friendlyMessage(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // Retrieval layer — Moss sidecar / pgvector index.
  if (msg.includes("moss") || msg.includes("pgvector") || msg.includes(":8000")) {
    return "The manual search service is temporarily unavailable. Please try again in a moment.";
  }
  // LLM / vision API (OpenRouter).
  if (
    msg.includes("openrouter") ||
    msg.includes("vision") ||
    msg.includes("api key") ||
    msg.includes("openrouter_api_key") ||
    msg.includes("model")
  ) {
    return "The diagnostic assistant is having trouble responding right now. Please try again in a moment.";
  }
  // PDF ingestion.
  if (
    msg.includes("pdf") ||
    msg.includes("parse") ||
    msg.includes("extract") ||
    msg.includes("invalid") && msg.includes("file")
  ) {
    return "We couldn't read that file. Please upload a valid, text-based PDF.";
  }
  // Database / connectivity.
  if (msg.includes("connect") || msg.includes("database") || msg.includes("econnrefused")) {
    return "We're having trouble reaching the database. Please try again shortly.";
  }
  return "Something went wrong on our end. Please try again.";
}

/** Log the full error server-side (with context) and return a safe JSON Response. */
export function apiError(
  context: string,
  err: unknown,
  status = 500,
): Response {
  console.error(`[${context}]`, err);
  return Response.json(
    { ok: false, error: friendlyMessage(err) },
    { status },
  );
}
