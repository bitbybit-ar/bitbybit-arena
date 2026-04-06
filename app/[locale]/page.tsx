import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { About } from "@/components/landing/About";
import { Partners } from "@/components/landing/Partners";
import { Support } from "@/components/landing/Support";

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
