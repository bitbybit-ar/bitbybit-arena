import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const intlMiddleware = createMiddleware(routing);

const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

const protectedPaths = ["/my-challenges", "/settings"];

function isProtectedPath(pathname: string): boolean {
  const pathWithoutLocale = pathname.replace(/^\/(es|en)/, "");
  return protectedPaths.some((p) => pathWithoutLocale.startsWith(p));
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname)) {
    const session = request.cookies.get("session")?.value;
    if (!session) {
      const locale = pathname.match(/^\/(es|en)/)?.[1] || "es";
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
    try {
      await jwtVerify(session, AUTH_SECRET);
    } catch {
      const locale = pathname.match(/^\/(es|en)/)?.[1] || "es";
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
