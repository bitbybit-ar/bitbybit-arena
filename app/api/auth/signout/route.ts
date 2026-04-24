import { cookies } from "next/headers";
import { apiHandler } from "@/lib/api/handler";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

// POST /api/auth/signout — clear the session cookie. We keep
// `requireAuth: false` so a stale/expired session still resolves cleanly
// (the client flow only cares that the cookie is gone, not whether the
// JWT was still valid at the moment of the call).
export const POST = apiHandler(
  async () => {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    return { ok: true };
  },
  { requireAuth: false }
);
