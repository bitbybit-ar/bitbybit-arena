import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();

  // Block indexing everywhere except production so Vercel previews and
  // local deploys never leak into search results.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private pages carry a noindex instead of a Disallow: a blocked
        // URL is never fetched, so Google can't see its noindex and may
        // still index it from links.
        disallow: "/api/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
