import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { About } from "@/components/landing/About";
import { Partners } from "@/components/landing/Partners";
import { Support } from "@/components/landing/Support";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternatesFor(locale, "") };
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <About />
      <Partners />
      <Support />
    </>
  );
}
