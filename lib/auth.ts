import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

const SESSION_DURATION = "7d";

export interface AuthSession {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  locale: "es" | "en";
  nostr_pubkey: string;
}

interface SessionPayload {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  locale: "es" | "en";
  nostr_pubkey: string;
}

export async function createSession(session: SessionPayload): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(AUTH_SECRET);
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET);
    const p = payload as unknown as SessionPayload;

    if (!p.user_id || !p.nostr_pubkey) return null;

    return {
      user_id: p.user_id,
      username: p.username || "",
      display_name: p.display_name || "",
      avatar_url: p.avatar_url || null,
      locale: p.locale === "en" ? "en" : "es",
      nostr_pubkey: p.nostr_pubkey,
    };
  } catch {
    return null;
  }
}
