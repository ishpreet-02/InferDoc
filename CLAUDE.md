# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A product-support platform whose differentiator is an AI **Diagnostic Assistant** that runs an
iterative troubleshooting loop — NOT plain RAG. The intended flow:
intake → Moss retrieves candidate causes → ask 2–4 discriminating follow-up questions →
re-rank candidates → recommend a fix and cite the source resource (title + page).

Hackathon build, ~6 hours across 5 phases. Two top-level workspaces:

- `frontend/` — Next.js app + API routes (the product). This is where most work happens.
- `backend/` — Python FastAPI sidecar (via `uv`), intended to host the Moss SDK for retrieval.
  Currently a stub (`main.py` prints hello); only dependencies are declared.

## ⚠️ The toolchain is NEWER than your training data — verify before coding

- **Next.js is 16.2.9, not 14** (App Router). Before writing Next.js code, read the relevant guide
  in `frontend/node_modules/next/dist/docs/` (per `frontend/AGENTS.md`). Route handlers live at
  `app/api/<name>/route.ts`, export `GET`/`POST`, and return `Response.json(...)`.
- **Prisma is 7.8.0** with the new `prisma-client` generator (ESM), output to
  `frontend/app/generated/prisma`. Import the client from `@/app/generated/prisma/client`.
  There is **no Rust query engine** — it requires a driver adapter: `@prisma/adapter-pg` + `pg`.
  Use the singleton in `frontend/app/lib/prisma.ts` (`new PrismaClient({ adapter: new PrismaPg(...) })`);
  do not instantiate `PrismaClient` directly elsewhere.
- The datasource URL is **not** in `schema.prisma`. It's injected at CLI time via
  `frontend/prisma.config.ts` (which loads `dotenv/config`) and at runtime via the pg adapter.
- **DB is remote Neon Postgres** — there is no local psql. The connection string (`DATABASE_URL`)
  and `OPENROUTER_API_KEY` (model: gpt-oss-120b) live in `frontend/.env`.

## Commands

Run all frontend commands from `frontend/`:

```bash
npm run dev            # start Next.js dev server
npm run build          # production build
npm run lint           # eslint

npx prisma migrate dev # apply/create migrations (URL comes from prisma.config.ts)
npx prisma generate    # regenerate client into app/generated/prisma
npx tsx prisma/seed.ts # bootstrap the DB — idempotent + NON-destructive: only ensures the
                       # AcmeMobility company + demo user exist (no demo products, no table
                       # wipe). Run directly; tsx does NOT resolve the @/ alias, so it uses
                       # relative imports. All real products are added via the dashboard.
```

Backend (from `backend/`, requires `uv`):

```bash
uv sync                                      # install deps
uv run uvicorn main:app --reload --port 8000 # run the Moss retrieval sidecar
```

`main.py` is a FastAPI service (not a script — `uv run main.py` does nothing) hosting the
`inferedge-moss` SDK. It exposes `GET /health`, `POST /index/{product_id}`,
`POST /query/{product_id}`; creds (`MOSS_PROJECT_ID`/`MOSS_PROJECT_KEY`) come from `backend/.env`.

Verify the stack is wired up by hitting `GET /api/health` — it returns `{ ok, db, counts }` of key tables.

## Data model (prisma/schema.prisma)

Company → Product → (Resource, MaintenanceTask, Conversation). User owns products via
`UserInventory` and tracks upkeep via `UserMaintenanceStatus` (status PENDING/DONE/OVERDUE).
The diagnostic chat is `Conversation` → `Message` (role USER/ASSISTANT, optional `citations` JSON).

`Resource.extractedText` holds the full manual body and is the intended feed for Moss ingestion.
Retrieval convention: a **single shared Moss index** `acme-catalog` holds all products' chunks,
each tagged with `productId` (plus `resourceId`, `resourceTitle`, `page`) in metadata; queries
filter by `productId`. (We started with one-index-per-product but the Moss free tier caps at 3
indexes — the shared index supports unlimited products.) Override the name with `MOSS_INDEX`.

## State of the build

Phase 1 is done: schema migrated. The seed (`prisma/seed.ts`) is now a minimal, idempotent,
non-destructive bootstrap — it only ensures the AcmeMobility company + demo user exist. There are
**no demo/sample products**; all products are added via the company dashboard, which uploads their
PDF manuals to **Cloudinary** (`Resource.url` holds the `secure_url`; nothing is written to disk).
The old pdfkit demo-manual generator (`prisma/manuals.ts`) has been removed.

Phase 2 is done: marketplace UI + upload→extract→chunk→index pipeline + Moss retrieval, wired
through a **Python FastAPI sidecar** (`backend/main.py`, `:8000`) hosting `inferedge-moss`, called
from Next API routes via fetch (`frontend/app/lib/moss.ts`). Pages: `/` catalog (+ client search),
`/products/[id]` detail, `/company/dashboard` (add product / upload resource). API routes:
`POST/GET /api/products`, `POST /api/resources` (PDF upload → **Cloudinary** (`app/lib/cloudinary.ts`,
`resource_type: "raw"`; `secure_url` stored in `Resource.url`) → extract via pdf-parse v2 → chunk
with page metadata → index; or LINK), `POST /api/admin/reindex` (fetches each PDF from its
Cloudinary URL and re-extracts/indexes). **No PDFs or images touch local disk** — Cloudinary creds
(`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, optional `CLOUDINARY_FOLDER`,
default `moss`) live in `frontend/.env` and are required by both the seed and these routes. All 3 products are indexed and per-product
filtered retrieval is verified. Run the sidecar with `uv run uvicorn main:app --port 8000`
(creds in `backend/.env`).

Phase 3 is done: the agentic Diagnostic Assistant at `/products/[id]/chat`. The loop lives in
`frontend/app/lib/agent/diagnostic.ts` (one fn per step: `intake` → `retrieve` → `decide` →
`respond`, orchestrated by `runDiagnosticTurn`). The DECISION step calls **OpenRouter**
(`gpt-oss-120b`, `OPENROUTER_API_KEY` in `frontend/.env`) via `app/lib/agent/llm.ts` with JSON
mode — note the original brief said "Anthropic" but there is no Anthropic key, so OpenRouter is
used. Structured output: `{ stage: QUESTIONING|RECOMMENDING, reply, candidate_causes[], questions[],
recommendation }`; the model cites retrieved chunks by 1-based index, resolved back to
`{resourceTitle, page, excerpt, score}` citations. API: `POST /api/chat` (new conversation),
`POST /api/chat/[conversationId]/message` (persists USER+ASSISTANT, runs the loop, stores the
readout in `Message.citations`, flips Conversation to RESOLVED on a recommendation). The chat page
is a self-contained dark "diagnostic console" UI (own fonts via `chat/fonts.ts` + scoped
`chat/diagnostic.css`) with a live re-ranking candidate-cause rail and collapsed citation chips.
Isolated loop test: `npx tsx scripts/test-diagnostic.ts` (picks a real product that has an
indexed PDF resource and runs a generic symptom through the loop; needs the Moss sidecar).

Phase 4 is done: two bonus features.

**A — Maintenance & ownership.** `/my-products` (an "Owner's Garage") lists the demo user's
`UserInventory` with per-product overdue/due-soon tallies; `/my-products/[id]/maintenance` is the
service log. An "Add to My Products" button (`app/components/AddToInventoryButton.tsx`) →
`POST /api/inventory` upserts the inventory row and seeds a `UserMaintenanceStatus` per
`MaintenanceTask` (`nextDueAt = now + intervalDays`). "Mark complete" →
`POST /api/maintenance/[statusId]/complete` sets `lastDoneAt`, rolls `nextDueAt` forward, flips
status to DONE. Status badges (OVERDUE / DUE_SOON / OK) are **computed from `nextDueAt`** in
`app/lib/maintenance.ts` (`DUE_SOON_DAYS = 14`), never stale. The nav has a live overdue-count
badge (async `app/components/MyProductsNav.tsx`). Maintenance tasks are managed from the company
dashboard (`app/components/MaintenanceManager.tsx`): `GET/POST /api/products/[id]/tasks` (POST also
backfills a `UserMaintenanceStatus` for existing owners so the task shows up immediately) and
`DELETE /api/products/[id]/tasks/[taskId]`. A **"Suggest from manual"** action runs the product's
`Resource.extractedText` through the LLM (`app/lib/agent/maintenance-extract.ts`, reuses `chatJSON`)
via `POST /api/products/[id]/tasks/suggest` (read-only — returns suggestions); the dashboard shows
them as checkboxes and creates the chosen ones through the normal POST. Products with no
`MaintenanceTask` rows simply show an empty service log.

**B — Image-based troubleshooting.** The chat composer takes a photo (jpg/png, client-downscaled to
1024px via canvas, preview + remove). `POST /api/chat/[conversationId]/message` now accepts
`imageBase64`: a **vision pre-step** (`describeImage` in `app/lib/agent/llm.ts`, OpenRouter
`OPENROUTER_VISION_MODEL`, default `openai/gpt-4o-mini` — gpt-oss-120b is text-only) describes the
photo; the description is saved to the USER `Message.citations` ({imageUrl, imageDescription}), the
image uploaded to **Cloudinary** (`uploadImageToCloudinary`, `imageUrl` = `secure_url`), and folded
into the symptom history so the (text-only) loop reasons over it. The user bubble shows the thumbnail. `SYSTEM_PROMPT` instructs the model to acknowledge photo
evidence and weight it. Verified on the AC: an "E4" error-code panel makes Moss open with "Thanks for
the photo", add an E4 candidate cause, and skip asking for the code. Check (needs dev server +
sidecar): `npx tsx scripts/test-vision-chat.ts` (also writes a sample image to `/public/test`).
