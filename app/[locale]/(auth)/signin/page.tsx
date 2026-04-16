import type { Metadata } from "next";
import { redirect } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { alternatesFor } from "@/lib/seo";
import { SignInClient } from "./signin-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Sign in",
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, "/signin"),
  };
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  if (session) {
    redirect({ href: "/explore", locale });
  }
  return <SignInClient />;
}
