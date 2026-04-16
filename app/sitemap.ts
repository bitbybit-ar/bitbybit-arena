import type { MetadataRoute } from "next";
import { inArray } from "drizzle-orm";
import { getDb, challenges } from "@/lib/db";
import { getBaseUrl } from "@/lib/env";
import { routing } from "@/i18n/routing";

// Regenerate hourly. Challenge churn doesn't need sub-hour freshness and
// this avoids hitting the DB on every crawl.
export const revalidate = 3600;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

const STATIC_PATHS: { path: string; changeFrequency: ChangeFrequency; priority: number }[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/explore", changeFrequency: "daily", priority: 0.9 },
];

function languagesFor(path: string): Record<string, string> {
  const base = getBaseUrl();
  return Object.fromEntries(
    routing.locales.map((l) => [l, `${base}/${l}${path}`])
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.flatMap(
    ({ path, changeFrequency, priority }) => {
      const languages = languagesFor(path);
      return routing.locales.map((locale) => ({
        url: `${base}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency,
        priority,
        alternates: { languages },
      }));
    }
  );

  // Fall back to static-only during builds where the DB isn't reachable
  // (CI, offline local builds). Challenges populate on the next revalidate.
  let publicChallenges: { id: string; updated_at: Date }[] = [];
  try {
    publicChallenges = await getDb()
      .select({
        id: challenges.id,
        updated_at: challenges.updated_at,
      })
      .from(challenges)
      .where(inArray(challenges.status, ["open", "in_progress", "completed"]));
  } catch (err) {
    console.warn("[sitemap] challenge query failed, emitting static-only:", err);
  }

  const challengeEntries: MetadataRoute.Sitemap = publicChallenges.flatMap((c) => {
    const path = `/explore/${c.id}`;
    const languages = languagesFor(path);
    return routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: c.updated_at,
      changeFrequency: "daily" as const,
      priority: 0.6,
      alternates: { languages },
    }));
  });

  return [...staticEntries, ...challengeEntries];
}
