import type { Metadata } from "next";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Nunito, Nunito_Sans } from "next/font/google";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/lib/theme-context";
import { ToastProvider } from "@/components/ui/toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
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

const appName = "BitByBit Arena";
const appDescription =
  "Create challenges, compete with others, and earn badges on your Nostr identity.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: {
      default: appName,
      template: `%s | ${appName}`,
    },
    description: appDescription,
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    ),
    alternates: {
      canonical: `/${locale}`,
      languages: { es: "/es", en: "/en" },
    },
    openGraph: {
      title: appName,
      description: appDescription,
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
    <html lang={locale} className={`${nunito.variable} ${nunitoSans.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#8B5CF6" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <Script id="theme-init" strategy="beforeInteractive">{`
          (function(){try{var t=localStorage.getItem('theme');
          if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))
          document.documentElement.setAttribute('data-theme','dark');
          else document.documentElement.setAttribute('data-theme','light');
          }catch(e){}})();
        `}</Script>
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <ToastProvider>
              <a href="#main-content" className="skip-link">
                Skip to content
              </a>
              <Navbar />
              <main id="main-content">{children}</main>
              <Footer />
            </ToastProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
