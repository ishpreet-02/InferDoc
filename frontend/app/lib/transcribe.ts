import type { TranscriptSegment } from "./chunk";

/**
 * Speech-to-text via any Whisper-compatible `/audio/transcriptions` endpoint.
 *
 * The app has no audio model of its own (OpenRouter is text+vision only), so
 * transcription is pluggable through env — runs on Groq's free tier or OpenAI:
 *   TRANSCRIBE_API_KEY   (required)
 *   TRANSCRIBE_BASE_URL  (default https://api.openai.com/v1;
 *                         Groq = https://api.groq.com/openai/v1)
 *   TRANSCRIBE_MODEL     (default whisper-1; Groq = whisper-large-v3)
 *
 * We request verbose_json with segment timestamps so a transcript can be split
 * into time-ranged chunks ("watch from 3:25 to 4:10"). Throws on any transport
 * error so the caller can degrade (keep the video, skip the transcript).
 *
 * This is an English-language product-support platform, so by default we hit the
 * `/audio/translations` endpoint, which transcribes-AND-translates any language
 * to English (a Hindi how-to video becomes English chunks that embed against
 * English queries and render as readable citations; an English video passes
 * through unchanged). Set TRANSCRIBE_TRANSLATE=false to keep the source language.
 */

const BASE_URL = process.env.TRANSCRIBE_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.TRANSCRIBE_MODEL ?? "whisper-1";
const TRANSLATE = process.env.TRANSCRIBE_TRANSLATE !== "false";

export function transcribeConfigured(): boolean {
  return Boolean(process.env.TRANSCRIBE_API_KEY);
}

export type Transcription = { text: string; segments: TranscriptSegment[] };

export async function transcribe(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<Transcription> {
  const apiKey = process.env.TRANSCRIBE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TRANSCRIBE_API_KEY is not set in frontend/.env — needed to transcribe videos",
    );
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  form.append("model", MODEL);
  form.append("response_format", "verbose_json");
  // The translations endpoint only emits segment-level timestamps and rejects
  // the granularity hint; only send it for plain transcription.
  if (!TRANSLATE) form.append("timestamp_granularities[]", "segment");

  const endpoint = TRANSLATE ? "audio/translations" : "audio/transcriptions";
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Transcription failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }

  const data = await res.json();
  const segments: TranscriptSegment[] = Array.isArray(data?.segments)
    ? data.segments
        .map((s: { start: number; end: number; text: string }) => ({
          start: Number(s.start),
          end: Number(s.end),
          text: String(s.text ?? ""),
        }))
        .filter(
          (s: TranscriptSegment) =>
            Number.isFinite(s.start) && Number.isFinite(s.end) && s.text.trim(),
        )
    : [];

  return { text: String(data?.text ?? "").trim(), segments };
}
