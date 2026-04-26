import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE_NAME } from "./lib/auth-constants";

const intlMiddleware = createMiddleware(routing);

const LOCALES = routing.locales;
const PROTECTED_PATHS = ["my-challenges", "settings"];

const PROD = process.env.NODE_ENV === "production";

// CSP — nonce per request.
//
// Why a per-request nonce instead of `'unsafe-inline'`:
//   - Without one, an XSS injection that lands an inline `<script>` in
//     the DOM executes. With paste-nsec sign-in holding raw private
//     keys in JS context (`lib/signer-context.tsx`), one XSS = key
//     theft + arbitrary event signing on the user's behalf.
//   - The nonce is a per-response random token; only `<script>`s the
//     server stamped with that exact nonce execute. `'strict-dynamic'`
//     extends the trust to chunks the stamped loader pulls in.
//
// Trusted Types ships in Report-Only mode so any unguarded DOM-sink
// assignment surfaces a console warning instead of breaking the page.
// Promote to enforced mode after a clean reporting window. The
// codebase audit at the time of writing showed zero
// `dangerouslySetInnerHTML`, `innerHTML =`, `document.write`,
// `insertAdjacentHTML`, `eval`, or `new Function` across `app/`,
// `components/`, and `lib/`.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' wss: https:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const TRUSTED_TYPES_REPORT_ONLY = "require-trusted-types-for 'script'";

// Apply CSP + Trusted Types reports to every response leaving the
// proxy. Production-only — `next dev`'s HMR uses inline + eval scripts
// that fight `'strict-dynamic'`.
function applyCspHeaders(response: NextResponse, nonce: string): NextResponse {
  if (PROD) {
    response.headers.set("Content-Security-Policy", buildCsp(nonce));
    response.headers.set(
      "Content-Security-Policy-Report-Only",
      TRUSTED_TYPES_REPORT_ONLY
    );
  }
  return response;
}

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

  // Per-request nonce. 16 random bytes → 24-char base64. `btoa` +
  // `String.fromCharCode` keeps this on pure Web API (no Edge-runtime
  // Buffer polyfill dependency). Forwarded downstream via the
  // `x-nonce` request header so Next.js's framework reads it and
  // stamps every inline hydration script.
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  request.headers.set("x-nonce", nonce);

  if (isProtectedPath(pathname)) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return applyCspHeaders(NextResponse.redirect(getLoginUrl(request)), nonce);
    }

    try {
      const secret = process.env.AUTH_SECRET;
      if (!secret) {
        return applyCspHeaders(NextResponse.redirect(getLoginUrl(request)), nonce);
      }
      await jwtVerify(sessionCookie, new TextEncoder().encode(secret));
    } catch {
      return applyCspHeaders(NextResponse.redirect(getLoginUrl(request)), nonce);
    }
  }

  // Locale preference from cookie
  const localePref = request.cookies.get("NEXT_LOCALE")?.value;
  if (localePref && routing.locales.includes(localePref as "es" | "en")) {
    return applyCspHeaders(intlMiddleware(request), nonce);
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
    return applyCspHeaders(response, nonce);
  }

  return applyCspHeaders(intlMiddleware(request), nonce);
}

export const config = {
  // Skip API (JSON-only, no HTML to protect), Next.js / Vercel
  // internals, and asset paths. The `missing` clause skips
  // hover-prefetch requests so the prefetched HTML's nonce doesn't
  // mismatch the live navigation's nonce on click.
  matcher: [
    {
      source: "/((?!api|_next|_vercel|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
