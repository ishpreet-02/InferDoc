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
 */

const BASE_URL = process.env.TRANSCRIBE_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.TRANSCRIBE_MODEL ?? "whisper-1";

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
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
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
