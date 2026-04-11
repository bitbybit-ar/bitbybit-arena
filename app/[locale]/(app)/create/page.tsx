import { redirect } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { CreateClient } from "./create-client";

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
