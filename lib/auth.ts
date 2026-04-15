import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SignerType } from "@/lib/nostr/signers";

const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

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
}

interface SessionPayload {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  locale: "es" | "en";
  nostr_pubkey: string;
  signer_type?: SignerType | null;
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
      signer_type:
        p.signer_type && VALID_SIGNER_TYPES.includes(p.signer_type)
          ? p.signer_type
          : null,
    };
  } catch {
    return null;
  }
}
