import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Nunito, Nunito_Sans } from "next/font/google";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { getBaseUrl } from "@/lib/env";
import { APP_NAME, TITLE_TEMPLATE } from "@/lib/seo";
import { ThemeProvider } from "@/lib/contexts/theme-context";
import { SessionProvider } from "@/lib/contexts/session-context";
import { ToastProvider } from "@/components/ui/toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SignerProviderClient } from "@/components/layout/SignerProviderClient";
import "@/styles/globals.scss";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const description = t("description");
  return {
    title: {
      default: APP_NAME,
      template: TITLE_TEMPLATE,
    },
    description,
    metadataBase: new URL(getBaseUrl()),
    openGraph: {
      title: APP_NAME,
      description,
      type: "website",
      locale,
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={cn(nunito.variable, nunitoSans.variable)} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#8B5CF6" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <SessionProvider>
              <ToastProvider>
                <SignerProviderClient>
                  <a href="#main-content" className="skip-link">
                    Skip to content
                  </a>
                  <Navbar />
                  <main id="main-content">{children}</main>
                  <Footer />
                </SignerProviderClient>
              </ToastProvider>
            </SessionProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
