import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "My challenges",
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, "/my-challenges"),
  };
}

export default function MyChallengesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
