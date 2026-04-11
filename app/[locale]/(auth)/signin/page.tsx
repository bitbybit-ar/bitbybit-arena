import { redirect } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { SignInClient } from "./signin-client";

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
