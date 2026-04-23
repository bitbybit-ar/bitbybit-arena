import { getDb, notifications } from "@/lib/db";
import type { NotificationType } from "@/lib/types";

// Fire-and-forget helper. Wrap the call in try/catch at the callsite so a
// notification failure never rolls back the domain mutation — the bell is
// cosmetic, the underlying action (join / verify / award) is not.
//
// `title` / `body` are the English fallbacks stored in the DB. The client
// renders a localized string from `type` + `metadata` via useTranslations
// and only falls back to these if a translation key is missing.
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  await db.insert(notifications).values({
    user_id: userId,
    type,
    title,
    body,
    metadata: metadata ?? null,
  });
}
