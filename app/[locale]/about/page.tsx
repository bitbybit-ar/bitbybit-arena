import type { Metadata } from "next";
import { Story } from "@/components/about/Story";
import { Projects } from "@/components/about/Projects";
import { Team } from "@/components/about/Team";
import { LaCrypta } from "@/components/about/LaCrypta";
import { OpenSource } from "@/components/about/OpenSource";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "About",
    alternates: alternatesFor(locale, "/about"),
  };
}

export default function AboutPage() {
  return (
    <>
      <Story />
      <Projects />
      <Team />
      <LaCrypta />
      <OpenSource />
    </>
  );
}
