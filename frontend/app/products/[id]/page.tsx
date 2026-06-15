import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getDemoUser } from "@/app/lib/user";
import { ProductImage } from "@/app/components/ProductImage";
import { DeleteResourceButton } from "@/app/components/DeleteResourceButton";
import { AddToInventoryButton } from "@/app/components/AddToInventoryButton";

export const dynamic = "force-dynamic";

const TYPE_BADGE: Record<string, string> = {
  PDF: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  LINK: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  DOC: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  IMAGE: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  VIDEO: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
};

export default async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getDemoUser(); // cached after first request — ~no round-trip

  // Product details and the ownership check are independent — run concurrently.
  const [product, owned] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { resources: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.userInventory.findUnique({
      where: { userId_productId: { userId: user.id, productId: id } },
      select: { id: true },
    }),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        ← Back to catalog
      </Link>

      <div className="grid gap-8 md:grid-cols-[320px_1fr]">
        <div className="aspect-[4/3] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <ProductImage
            name={product.name}
            category={product.category}
            imageUrl={product.imageUrl}
          />
        </div>

        <div>
          <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {product.category}
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {product.name}
          </h1>
          {product.description && (
            <p className="mt-3 text-zinc-600 dark:text-zinc-300">
              {product.description}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/products/${product.id}/chat`}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
            >
              💬 Ask the Assistant
            </Link>
            <AddToInventoryButton
              productId={product.id}
              initiallyOwned={Boolean(owned)}
            />
          </div>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">
          Resources{" "}
          <span className="text-zinc-400">({product.resources.length})</span>
        </h2>

        {product.resources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No resources yet. Add one from the{" "}
            <Link
              href="/company/dashboard"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Company Dashboard
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {product.resources.map((r) => (
              <li key={r.id} className="bg-white px-4 py-3 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          TYPE_BADGE[r.type] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {r.type}
                      </span>
                      <span className="truncate font-medium">{r.title}</span>
                    </div>
                    {r.extractedText && (
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {r.type === "VIDEO"
                          ? "Transcribed & indexed"
                          : r.type === "IMAGE"
                            ? "Described & indexed for retrieval"
                            : "Indexed for retrieval"}{" "}
                        · {r.extractedText.length.toLocaleString()} chars
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {r.type === "LINK" ? "Open ↗" : "View / Download"}
                    </a>
                    <DeleteResourceButton resourceId={r.id} title={r.title} />
                  </div>
                </div>

                {/* Inline preview for media resources */}
                {r.type === "IMAGE" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.url}
                    alt={r.title}
                    className="mt-3 max-h-64 rounded-lg border border-zinc-200 object-contain dark:border-zinc-800"
                  />
                )}
                {r.type === "VIDEO" && (
                  <video
                    src={r.url}
                    controls
                    preload="metadata"
                    className="mt-3 max-h-72 w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
