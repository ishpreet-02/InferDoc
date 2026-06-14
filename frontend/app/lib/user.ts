import { cache } from "react";
import { prisma } from "./prisma";

// No auth in this build — there is a single demo user created by the seed.
// It never changes, so we memoize it: `cache()` dedupes within one request
// (layout nav + page both call this), and the module-level `cachedUser`
// persists across requests so we hit the DB at most once per server process.
// This removes a ~300ms Neon round-trip from nearly every page.
type DemoUser = { id: string; name: string; email: string };
let cachedUser: DemoUser | null = null;

export const getDemoUser = cache(async (): Promise<DemoUser> => {
  if (cachedUser) return cachedUser;
  const user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  if (!user) {
    throw new Error("No user found — run `npx tsx prisma/seed.ts` first.");
  }
  cachedUser = user;
  return user;
});
