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
        disallow: [
          "/api/",
          "/es/signin",
          "/en/signin",
          "/es/settings",
          "/en/settings",
          "/es/create",
          "/en/create",
          "/es/my-challenges",
          "/en/my-challenges",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
