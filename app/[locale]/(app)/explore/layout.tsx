import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Explore challenges",
    alternates: alternatesFor(locale, "/explore"),
  };
}

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
