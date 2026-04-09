import type { Metadata } from "next";
import { Story } from "@/components/about/Story";
import { Projects } from "@/components/about/Projects";
import { Team } from "@/components/about/Team";
import { LaCrypta } from "@/components/about/LaCrypta";
import { OpenSource } from "@/components/about/OpenSource";

export const metadata: Metadata = {
  title: "About",
};

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
