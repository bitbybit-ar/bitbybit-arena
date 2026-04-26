import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/lib/api/handler";
import { BadRequestError } from "@/lib/api/errors";
import { users } from "@/lib/db/schema";
import { fetchNostrMetadataServer } from "@/lib/nostr/server-metadata";

// POST /api/profile/sync — read-only sync of Nostr kind:0 metadata into
// the local user row. Publishing kind:0 back to relays is a separate
// client-side action (see settings page → "Publish to Nostr").
// Strict rate limit because each call opens WebSockets to multiple relays.
export const POST = apiHandler(
  async (_req: NextRequest, { session, db }) => {
    const pubkey = session!.nostr_pubkey;
    if (!pubkey) {
      throw new BadRequestError("Session missing Nostr pubkey", "missing_pubkey");
    }

    const metadata = await fetchNostrMetadataServer(pubkey);
    if (!metadata) {
      throw new BadRequestError("No metadata found on relays", "no_metadata_found");
    }

    const [current] = await db
      .select()
      .from(users)
      .where(eq(users.id, session!.user_id))
      .limit(1);

    // Successful sync that produced a real name = onboarding complete.
    // If the relay returned a metadata blob with no name field at all
    // (rare but possible), we keep the existing flag so the user still
    // sees the welcome prompt.
    const hydratedName = metadata.display_name || metadata.name;
    const hasRealName = !!hydratedName && hydratedName.trim().length > 0;

    const [updated] = await db
      .update(users)
      .set({
        display_name: hydratedName || current.display_name,
        avatar_url: metadata.picture || null,
        about: metadata.about || null,
        lightning_address: metadata.lud16 || null,
        nostr_metadata: metadata,
        nostr_metadata_updated_at: new Date(),
        ...(hasRealName ? { profile_completed: true } : {}),
        updated_at: new Date(),
      })
      .where(eq(users.id, session!.user_id))
      .returning();

    return updated;
  },
  { rateLimit: "strict" }
);
