import { prisma } from "@/app/lib/prisma";
import { Catalog, type CatalogProduct } from "@/app/components/Catalog";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "01",
    title: "Describe the symptom",
    body: "Tell Musk what's wrong in plain words — or snap a photo of the error code, leak, or part.",
  },
  {
    n: "02",
    title: "Answer a couple of questions",
    body: "Musk retrieves likely causes from the product manual and asks 2–4 questions that actually split them apart.",
  },
  {
    n: "03",
    title: "Get a cited fix",
    body: "It narrows to one cause and recommends the exact fix — citing the manual page it came from.",
  },
];

export default async function Home() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { resources: true } } },
  });

  const catalogProducts: CatalogProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    imageUrl: p.imageUrl,
    resourceCount: p._count.resources,
  }));

  return (
    <div>
      {/* Hero / positioning */}
      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        {/* subtle grid + glow backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_-10%,theme(colors.indigo.500/15),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,theme(colors.zinc.200/40)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.zinc.200/40)_1px,transparent_1px)] [background-size:40px_40px] dark:[background-image:linear-gradient(to_right,theme(colors.zinc.800/40)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.zinc.800/40)_1px,transparent_1px)]"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            AI Diagnostic Assistant
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Not a chatbot. Not a search engine.
            <br />
            <span className="text-indigo-600 dark:text-indigo-400">
              A technician for every product you own.
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
            Musk runs a real troubleshooting loop — it reads the symptom, retrieves
            candidate causes from the manual, asks the questions that narrow them
            down, and recommends a fix it can cite to the page.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
          How it works
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="font-mono text-sm font-semibold text-indigo-500 dark:text-indigo-400">
                {s.n}
              </span>
              <h3 className="mt-2 text-base font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Product Catalog
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Pick a product to open its manual or start a diagnosis.
            </p>
          </div>
        </div>
        <Catalog products={catalogProducts} />
      </section>
    </div>
  );
}
