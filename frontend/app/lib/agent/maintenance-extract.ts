import { chatJSON } from "./llm";

/**
 * LLM-assisted extraction of a recurring maintenance schedule from a product
 * manual. The manual body already lives in `Resource.extractedText`; this asks
 * the model to distil it into `MaintenanceTask`-shaped rows the company can
 * review and accept on the dashboard. It does NOT write to the DB.
 */

export type SuggestedTask = {
  title: string;
  intervalDays: number;
  sourceExcerpt: string;
};

const SYSTEM = `You read a product service manual and extract its recurring maintenance schedule.

Return JSON exactly as: {"tasks":[{"title": string, "intervalDays": integer, "sourceExcerpt": string}]}

Rules:
- Only include upkeep tasks performed on a recurring time interval (e.g. cleaning, replacing/cleaning filters, descaling, lubrication, periodic inspection).
- Convert each interval to WHOLE DAYS: weekly=7, fortnightly=14, monthly=30, "every N months"=N*30, quarterly=90, "every N years"/annually=365*N. Round sensibly.
- "title": a short imperative label, e.g. "Replace RO filter", "Clean condenser coil".
- "sourceExcerpt": the manual's stated interval plus a brief note, e.g. "Every 6 months — clear dust from outdoor coil".
- EXCLUDE one-off installation/setup steps, warranty text, and troubleshooting.
- If the manual states no maintenance schedule, return {"tasks":[]}.
- Return at most 10 tasks, most frequent first.`;

export async function extractMaintenanceTasks(opts: {
  product: string;
  category: string;
  manualText: string;
}): Promise<SuggestedTask[]> {
  // Manuals are small, but cap the prompt so a huge doc can't blow the budget.
  const text = opts.manualText.slice(0, 12_000);

  const { tasks } = await chatJSON<{ tasks: SuggestedTask[] }>(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Product: ${opts.product} (${opts.category})\n\nMANUAL:\n${text}`,
      },
    ],
    { temperature: 0, maxTokens: 800 },
  );

  return (tasks ?? [])
    .map((t) => ({
      title: String(t?.title ?? "").trim(),
      intervalDays: Math.round(Number(t?.intervalDays)),
      sourceExcerpt: String(t?.sourceExcerpt ?? "").trim(),
    }))
    .filter(
      (t) => t.title && Number.isFinite(t.intervalDays) && t.intervalDays > 0,
    )
    .slice(0, 10);
}
