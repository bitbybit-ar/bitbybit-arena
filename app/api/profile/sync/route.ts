import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { users } from "@/lib/db/schema";
import { fetchNostrMetadataServer } from "@/lib/nostr/server-metadata";

// POST /api/profile/sync — read-only sync of Nostr kind:0 metadata into local user row.
// BitByBit never publishes to relays; this endpoint only pulls.
// Strict rate limit because each call opens WebSockets to multiple relays.
export const POST = apiHandler(
  async (_req: NextRequest, { session, db }) => {
    const pubkey = session!.nostr_pubkey;
    if (!pubkey) throw new BadRequestError("Session missing Nostr pubkey");

    const metadata = await fetchNostrMetadataServer(pubkey);
    if (!metadata) {
      throw new BadRequestError("No metadata found on relays");
    }

    const [current] = await db
      .select()
      .from(users)
      .where(eq(users.id, session!.user_id))
      .limit(1);

    const [updated] = await db
      .update(users)
      .set({
        display_name: metadata.display_name || metadata.name || current.display_name,
        avatar_url: metadata.picture || null,
        about: metadata.about || null,
        lightning_address: metadata.lud16 || null,
        nostr_metadata: metadata,
        nostr_metadata_updated_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, session!.user_id))
      .returning();

    return updated;
  },
  { rateLimit: "strict" }
);
