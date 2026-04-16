import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Settings",
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, "/settings"),
  };
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
