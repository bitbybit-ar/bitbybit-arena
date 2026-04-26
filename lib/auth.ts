import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SignerType } from "@/lib/nostr/signers";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

export { SESSION_COOKIE_NAME };

// Fail loudly when AUTH_SECRET is unset in production. A silent dev
// fallback would let a misconfigured deploy issue forgeable JWTs —
// every visitor could craft a session for any user. In dev/test we
// keep a deterministic fallback so contributors don't need to set
// the env var to run the app or the test suite locally.
function readAuthSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (raw && raw.length > 0) {
    return new TextEncoder().encode(raw);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET environment variable is required in production"
    );
  }
  return new TextEncoder().encode("dev-secret-change-in-production");
}

const AUTH_SECRET = readAuthSecret();

const SESSION_DURATION = "7d";

const VALID_SIGNER_TYPES: SignerType[] = ["extension", "nsec", "nip46"];

export interface AuthSession {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  locale: "es" | "en";
  nostr_pubkey: string;
  // Which signer method the user authenticated with. Used to scope which
  // re-attach options the signer modal offers in future prompts. Old
  // sessions issued before this field existed will be `null` — callers
  // should treat that as "no preference, allow any signer".
  signer_type: SignerType | null;
  // First-time onboarding flag. False until the user has either saved
  // a profile manually or hydrated real kind:0 metadata from relays.
  // Drives the welcome modal in the (app) layout. Old sessions without
  // this field are treated as completed (true) so existing users don't
  // see a welcome prompt after deploy.
  profile_completed: boolean;
}

interface SessionPayload {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  locale: "es" | "en";
  nostr_pubkey: string;
  signer_type?: SignerType | null;
  profile_completed?: boolean;
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
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
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
      signer_type:
        p.signer_type && VALID_SIGNER_TYPES.includes(p.signer_type)
          ? p.signer_type
          : null,
      // Old sessions (issued before the column existed) default to true
      // so existing users don't get the welcome modal after deploy.
      profile_completed: p.profile_completed !== false,
    };
  } catch {
    return null;
  }
}
