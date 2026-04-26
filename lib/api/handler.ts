import { NextRequest, NextResponse } from "next/server";
import { getSession, AuthSession } from "@/lib/auth";
import { getDb, Db } from "@/lib/db";
import { ApiError, RateLimitError, type ApiErrorCode } from "./errors";
import { defaultRateLimitStore, type RateLimitStore } from "./rate-limit";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: ApiErrorCode;
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

// Indirect through `RateLimitStore` so we can swap in Upstash/KV
// later without touching this file. See lib/api/rate-limit.ts.
const rateLimitStore: RateLimitStore = defaultRateLimitStore;

const rateLimitConfig: Record<RateLimitTier, { max: number; windowMs: number }> = {
  strict: { max: 5, windowMs: 15 * 60 * 1000 },
  // `auth` used to be 20/min, which blew up for users behind CGNAT (all
  // sharing an egress IP) after a handful of retries. NIP-98 login
  // isn't brute-forceable — you still need a valid Schnorr signature —
  // so the tier exists to cap abuse of the verifier, not to slow down
  // legitimate re-tries. 60/min = ~60 login attempts per minute per IP
  // (each attempt is one POST since the GET challenge round-trip is
  // gone post-NIP-98).
  auth: { max: 60, windowMs: 60 * 1000 },
  standard: { max: 60, windowMs: 60 * 1000 },
};

/**
 * Extract the client's real IP from `x-forwarded-for`. The header is
 * a comma-separated chain `<client>, <proxy1>, <proxy2>, ...`. The
 * leftmost entry is set by the *client* and therefore attacker-
 * controlled — using it for rate-limit keys lets a single bad actor
 * trivially evict legit users from the bucket. The rightmost entry
 * is set by the closest trusted proxy (Vercel's edge in our case),
 * so it's the only value we can attribute to a real network peer.
 *
 * Falls back to `x-real-ip` (set by some hosts/proxies) and finally
 * to a static "unknown" so behavior degrades to "global bucket per
 * route" rather than crashing.
 */
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function checkRateLimit(key: string, tier: RateLimitTier): void {
  const config = rateLimitConfig[tier];
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return;
  }

  const next = { count: entry.count + 1, resetAt: entry.resetAt };
  rateLimitStore.set(key, next);
  if (next.count > config.max) {
    throw new RateLimitError(next.resetAt - now);
  }
}

export function apiHandler<T>(
  handler: (req: NextRequest, ctx: HandlerContext) => Promise<T | CreatedResponse<T>>,
  options: HandlerOptions = {}
) {
  const { requireAuth = true, rateLimit = "standard" } = options;

  return async (req: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }) => {
    try {
      checkRateLimit(`${getClientIp(req)}:${req.nextUrl.pathname}`, rateLimit);

      const session = await getSession();

      if (requireAuth && !session) {
        return NextResponse.json(
          { success: false, error: "Unauthorized", code: "unauthorized" } satisfies ApiResponse,
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
          { success: false, error: error.message, code: error.code } satisfies ApiResponse,
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
          { success: false, error: error.message, code: error.code } satisfies ApiResponse,
          { status: error.statusCode, headers: { "Cache-Control": "private, no-store" } }
        );
      }

      console.error("API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error", code: "internal" } satisfies ApiResponse,
        { status: 500, headers: { "Cache-Control": "private, no-store" } }
      );
    }
  };
}
