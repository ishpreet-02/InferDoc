"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Readout } from "@/app/lib/agent/diagnostic";

export type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  readout?: Readout;
  /** Thumbnail for a customer-attached photo (data URL while sending, then Cloudinary URL). */
  imageUrl?: string;
};

const MAX_IMAGE_DIM = 1024; // downscale before upload to keep payloads small

/** Read a File, downscale it, and return a JPEG data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type Product = { id: string; name: string; category: string };

const SUGGESTIONS = [
  "It powers on but a part has stopped working",
  "It won't turn on at all",
  "Performance has dropped recently",
  "Something is leaking or feels loose",
];

export function DiagnosticChat({
  product,
  conversationId: initialConversationId,
  initialMessages,
}: {
  product: Product;
  conversationId: string;
  initialMessages: ChatMessage[];
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tmpId = useRef(0);

  const lastReadout = [...messages].reverse().find((m) => m.role === "ASSISTANT")
    ?.readout;
  const userTurns = messages.filter((m) => m.role === "USER").length;

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    const img = image;
    if ((!content && !img) || loading) return;
    setError(null);
    setInput("");
    setImage(null);

    const optimistic: ChatMessage = {
      id: `tmp-${tmpId.current++}`,
      role: "USER",
      content,
      imageUrl: img ?? undefined,
    };
    setMessages((m) => [...m, optimistic]);
    setLoading(true);

    try {
      const res = await fetch(`/api/chat/${conversationId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, imageBase64: img ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        {
          id: data.userMessage.id,
          role: "USER",
          content: data.userMessage.content ?? content,
          imageUrl: data.userMessage.imageUrl ?? img ?? undefined,
        },
        {
          id: data.assistantMessage.id,
          role: "ASSISTANT",
          content: data.assistantMessage.content,
          readout: data.assistantMessage.readout,
        },
      ]);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError("Please choose a JPG or PNG image.");
      return;
    }
    try {
      setError(null);
      setImage(await fileToDataUrl(file));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  }

  async function newChat() {
    if (loading) return;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "failed");
      setConversationId(data.conversationId);
      setMessages([]);
      setError(null);
      setInput("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* sub-header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href={`/products/${product.id}`}
            className="shrink-0 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            ←
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
              Diagnostic Assistant
            </p>
            <h1 className="truncate text-sm font-semibold">{product.name}</h1>
          </div>
          <StagePill readout={lastReadout} loading={loading} />
          <div className="flex-1" />
          {messages.length > 0 && (
            <button
              onClick={newChat}
              className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              New chat
            </button>
          )}
        </div>
      </div>

      {/* thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
          {messages.length === 0 && <Greeting product={product} />}

          {messages.map((m) =>
            m.role === "USER" ? (
              <div key={m.id} className="flex justify-end">
                <div className="flex max-w-[80%] flex-col items-end gap-1.5">
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded thumbnail, no fixed domain
                    <img
                      src={m.imageUrl}
                      alt="Customer photo"
                      className="max-h-56 rounded-2xl rounded-br-sm border border-indigo-300/40 object-cover shadow-sm dark:border-indigo-500/30"
                    />
                  )}
                  {m.content && m.content !== "(shared a photo)" && (
                    <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                      {m.content}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <AssistantMessage key={m.id} message={m} />
            ),
          )}

          {loading && <Thinking />}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="border-t border-zinc-200 bg-white/60 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          {userTurns === 0 && !loading && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {image && (
            <div className="mb-2 inline-flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview data URL */}
              <img
                src={image}
                alt="Attachment preview"
                className="h-14 w-14 rounded-lg object-cover"
              />
              <div className="pr-1 text-xs text-zinc-500">
                <p className="font-medium text-zinc-700 dark:text-zinc-300">
                  Photo attached
                </p>
                <p>Musk will read it when you send.</p>
              </div>
              <button
                onClick={() => setImage(null)}
                aria-label="Remove image"
                className="grid h-6 w-6 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPickImage}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              aria-label="Attach photo"
              title="Attach a photo"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-indigo-600 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
            >
              <CameraIcon />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={`Describe the problem with your ${product.name}…`}
              value={input}
              disabled={loading}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={onKeyDown}
              className="max-h-[140px] flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-zinc-400"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || (!input.trim() && !image)}
              aria-label="Send"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-zinc-400">
            Musk narrows down the cause from the product manual and cites its
            sources. Attach a photo of an error code, leak, or part and it&apos;ll
            factor that in.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Greeting({ product }: { product: Product }) {
  return (
    <div className="max-w-[85%] text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
      <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
        Hi, I&apos;m Musk 👋
      </p>
      Tell me what&apos;s going wrong with your {product.name} — the symptoms, when
      it started, anything you&apos;ve noticed. I&apos;ll ask a couple of
      questions, narrow down the likely cause from the manual, and point you to a
      fix.
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const r = message.readout;
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
        {message.content}
      </div>

      {r && r.questions.length > 0 && (
        <ul className="ml-0 flex max-w-[85%] flex-col gap-1.5">
          {r.questions.map((q, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="font-medium text-indigo-500">{i + 1}.</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      )}

      {r?.recommendation && (
        <div className="max-w-[85%] rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Recommended fix
          </p>
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            {r.recommendation.fix}
          </p>
        </div>
      )}

      {r && r.candidateCauses.length > 0 && (
        <Causes causes={r.candidateCauses} />
      )}

      {r && r.citations.length > 0 && <Citations citations={r.citations} />}
    </div>
  );
}

function Causes({ causes }: { causes: NonNullable<Readout["candidateCauses"]> }) {
  return (
    <div className="max-w-[85%] rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Likely causes
      </p>
      <div className="flex flex-col gap-2.5">
        {causes.map((c, i) => {
          const pct = Math.round(c.confidence * 100);
          return (
            <div key={`${c.cause}-${i}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {c.cause}
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-zinc-500">
                  {pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${
                    i === 0 ? "bg-indigo-600" : "bg-indigo-300 dark:bg-indigo-800"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Citations({ citations }: { citations: NonNullable<Readout["citations"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[85%]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="underline decoration-dotted underline-offset-2">
          {citations.length} source{citations.length === 1 ? "" : "s"} from the manual
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {citations.map((c, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-indigo-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  {c.resourceTitle}
                </span>
                {c.page != null && (
                  <span className="rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700">
                    p.{c.page}
                  </span>
                )}
                {c.score != null && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-zinc-400">
                    {(c.score * 100).toFixed(0)}% match
                  </span>
                )}
              </div>
              <p className="line-clamp-4 px-3 py-2 text-xs italic leading-relaxed text-zinc-500 dark:text-zinc-400">
                “{c.excerpt}”
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StagePill({
  readout,
  loading,
}: {
  readout?: Readout;
  loading: boolean;
}) {
  if (loading)
    return (
      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        Analyzing…
      </span>
    );
  if (readout?.stage === "RECOMMENDING")
    return (
      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        Resolved
      </span>
    );
  if (readout?.stage === "QUESTIONING")
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        Narrowing down
      </span>
    );
  return null;
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
      </span>
      Musk is thinking…
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9a2 2 0 0 1 2-2h1.5l1-1.5h5l1 1.5H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12.5" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 12l16-8-6 16-3-7-7-1z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
