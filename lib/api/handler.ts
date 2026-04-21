import { NextRequest, NextResponse } from "next/server";
import { getSession, AuthSession } from "@/lib/auth";
import { getDb, Db } from "@/lib/db";
import { ApiError, RateLimitError } from "./errors";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class CreatedResponse<T> {
  constructor(public data: T) {}
}

interface HandlerContext {
  session: AuthSession | null;
  db: Db;
  params: Record<string, string>;
}

type RateLimitTier = "strict" | "auth" | "standard";

interface HandlerOptions {
  requireAuth?: boolean;
  rateLimit?: RateLimitTier;
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const rateLimitConfig: Record<RateLimitTier, { max: number; windowMs: number }> = {
  strict: { max: 5, windowMs: 15 * 60 * 1000 },
  // `auth` used to be 20/min, which blew up for users behind CGNAT (all
  // sharing an egress IP) after a handful of retries. NIP-42 login isn't
  // brute-forceable — you still need a valid Schnorr signature — so the
  // tier exists to cap abuse of the challenge issuer, not to slow down
  // legitimate re-tries. 60/min = ~30 login attempts per minute per IP.
  auth: { max: 60, windowMs: 60 * 1000 },
  standard: { max: 60, windowMs: 60 * 1000 },
};

function checkRateLimit(key: string, tier: RateLimitTier): void {
  const config = rateLimitConfig[tier];
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return;
  }

  entry.count++;
  if (entry.count > config.max) {
    throw new RateLimitError(entry.resetAt - now);
  }
}

export function apiHandler<T>(
  handler: (req: NextRequest, ctx: HandlerContext) => Promise<T | CreatedResponse<T>>,
  options: HandlerOptions = {}
) {
  const { requireAuth = true, rateLimit = "standard" } = options;

  return async (req: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }) => {
    try {
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      checkRateLimit(`${ip}:${req.nextUrl.pathname}`, rateLimit);

      const session = await getSession();

      if (requireAuth && !session) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" } satisfies ApiResponse,
          { status: 401, headers: { "Cache-Control": "private, no-store" } }
        );
      }

      const db = getDb();
      const params = routeCtx?.params ? await routeCtx.params : {};

      const result = await handler(req, { session, db, params });

      const status = result instanceof CreatedResponse ? 201 : 200;
      const data = result instanceof CreatedResponse ? result.data : result;

      return NextResponse.json(
        { success: true, data } satisfies ApiResponse,
        { status, headers: { "Cache-Control": "private, no-store" } }
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { success: false, error: "Too many requests" } satisfies ApiResponse,
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)),
              "Cache-Control": "private, no-store",
            },
          }
        );
      }

      if (error instanceof ApiError) {
        return NextResponse.json(
          { success: false, error: error.message } satisfies ApiResponse,
          { status: error.statusCode, headers: { "Cache-Control": "private, no-store" } }
        );
      }

      console.error("API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" } satisfies ApiResponse,
        { status: 500, headers: { "Cache-Control": "private, no-store" } }
      );
    }
  };
}
