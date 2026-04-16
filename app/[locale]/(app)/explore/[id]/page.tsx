import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, challenges, users } from "@/lib/db";
import { getBaseUrl } from "@/lib/env";
import { alternatesFor } from "@/lib/seo";
import { isUuid } from "@/lib/utils";
import ChallengeClient from "./challenge-client";

// Cached per-request so generateMetadata() and the page body share one DB
// round-trip. React.cache is keyed on the argument, so the same id resolves
// to the same in-memory promise within a single render.
const getChallenge = cache(async (id: string) => {
  if (!isUuid(id)) return null;
  const rows = await getDb()
    .select({
      id: challenges.id,
      title: challenges.title,
      description: challenges.description,
      type: challenges.type,
      status: challenges.status,
      image_url: challenges.image_url,
      badge_image_url: challenges.badge_image_url,
      starts_at: challenges.starts_at,
      ends_at: challenges.ends_at,
      created_at: challenges.created_at,
      updated_at: challenges.updated_at,
      tags: challenges.tags,
      prize_amount_sats: challenges.prize_amount_sats,
      creator_display_name: users.display_name,
      creator_username: users.username,
    })
    .from(challenges)
    .innerJoin(users, eq(challenges.creator_id, users.id))
    .where(eq(challenges.id, id))
    .limit(1);
  return rows[0] ?? null;
});

function summarize(description: string, limit = 160): string {
  const flat = description.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return flat.slice(0, limit - 1).trimEnd() + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const challenge = await getChallenge(id);
  if (!challenge) return {};

  const path = `/explore/${challenge.id}`;
  const base = getBaseUrl();
  const description = summarize(challenge.description);
  const ogImage =
    challenge.image_url || challenge.badge_image_url || undefined;

  return {
    title: challenge.title,
    description,
    alternates: alternatesFor(locale, path),
    openGraph: {
      title: challenge.title,
      description,
      type: "article",
      locale,
      url: `${base}/${locale}${path}`,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: challenge.title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const challenge = await getChallenge(id);
  if (!challenge) notFound();

  const base = getBaseUrl();
  const url = `${base}/${locale}/explore/${challenge.id}`;

  // schema.org Event fits challenges well: title, description, organizer,
  // optional start/end dates, and a url crawlers can link back to.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: challenge.title,
    description: summarize(challenge.description, 500),
    url,
    eventStatus:
      challenge.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    organizer: {
      "@type": "Person",
      name: challenge.creator_display_name,
      identifier: challenge.creator_username,
    },
  };
  if (challenge.starts_at) {
    jsonLd.startDate = challenge.starts_at.toISOString();
  }
  if (challenge.ends_at) {
    jsonLd.endDate = challenge.ends_at.toISOString();
  }
  if (challenge.image_url || challenge.badge_image_url) {
    jsonLd.image = challenge.image_url || challenge.badge_image_url;
  }

  // User-controlled fields (title, description) could contain `</script>` and
  // break out of the inline script tag. Escape the forward slash in any
  // closing-tag sequence so the payload stays inside the <script> element.
  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />
      <ChallengeClient />
    </>
  );
}
