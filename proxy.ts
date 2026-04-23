import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE_NAME } from "./lib/auth-constants";

const intlMiddleware = createMiddleware(routing);

const LOCALES = routing.locales;
const PROTECTED_PATHS = ["my-challenges", "settings"];

function isProtectedPath(pathname: string): boolean {
  for (const locale of LOCALES) {
    const prefix = `/${locale}/`;
    if (pathname.startsWith(prefix)) {
      const afterLocale = pathname.slice(prefix.length);
      if (PROTECTED_PATHS.some((p) => afterLocale.startsWith(p))) {
        return true;
      }
    }
  }
  return PROTECTED_PATHS.some((p) => pathname.startsWith(`/${p}`));
}

function getLoginUrl(request: NextRequest): URL {
  const segments = request.nextUrl.pathname.split("/");
  const locale = LOCALES.includes(segments[1] as (typeof LOCALES)[number])
    ? segments[1]
    : routing.defaultLocale;
  return new URL(`/${locale}/signin`, request.url);
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname)) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return NextResponse.redirect(getLoginUrl(request));
    }

    try {
      const secret = process.env.AUTH_SECRET;
      if (!secret) {
        return NextResponse.redirect(getLoginUrl(request));
      }
      await jwtVerify(sessionCookie, new TextEncoder().encode(secret));
    } catch {
      return NextResponse.redirect(getLoginUrl(request));
    }
  }

  // Locale preference from cookie
  const localePref = request.cookies.get("NEXT_LOCALE")?.value;
  if (localePref && routing.locales.includes(localePref as "es" | "en")) {
    return intlMiddleware(request);
  }

  // Auto-detect from Accept-Language header
  const acceptLang = request.headers.get("accept-language") || "";
  const preferred = acceptLang
    .split(",")
    .map((part) => {
      const [lang, q] = part.trim().split(";q=");
      return { lang: lang.trim().split("-")[0].toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q)
    .find((entry) => routing.locales.includes(entry.lang as "es" | "en"));

  if (preferred) {
    const response = intlMiddleware(request);
    response.cookies.set("NEXT_LOCALE", preferred.lang, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
