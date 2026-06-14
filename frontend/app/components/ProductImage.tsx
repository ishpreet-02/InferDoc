// Visual for a product. Uses imageUrl when present, otherwise a deterministic
// category-themed gradient + emoji so the catalog still looks intentional.

const CATEGORY_STYLE: Record<string, { emoji: string; from: string; to: string }> = {
  Scooter: { emoji: "🛴", from: "from-indigo-500", to: "to-violet-600" },
  "Water Purifier": { emoji: "💧", from: "from-sky-500", to: "to-cyan-600" },
  "Air Conditioner": { emoji: "❄️", from: "from-teal-500", to: "to-emerald-600" },
};

const FALLBACK = { emoji: "📦", from: "from-zinc-500", to: "to-zinc-700" };

export function ProductImage({
  name,
  category,
  imageUrl,
  className = "",
}: {
  name: string;
  category: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs; next/image needs configured domains
      <img
        src={imageUrl}
        alt={name}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  const style = CATEGORY_STYLE[category] ?? FALLBACK;
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${style.from} ${style.to} ${className}`}
    >
      <span className="text-5xl drop-shadow-sm" aria-hidden>
        {style.emoji}
      </span>
    </div>
  );
}
