import type { Metadata } from "next";
import { redirect } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { alternatesFor } from "@/lib/seo";
import { CreateClient } from "./create-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Create challenge",
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, "/create"),
  };
}

export default async function CreateChallengePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  if (!session) {
    redirect({ href: "/signin", locale });
  }
  return <CreateClient />;
}
