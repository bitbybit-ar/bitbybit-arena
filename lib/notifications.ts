import { eq } from "drizzle-orm";
import { getDb, notifications, users } from "@/lib/db";
import type { NotificationPrefs, NotificationType } from "@/lib/types";

// Fire-and-forget helper. Wrap the call in try/catch at the callsite so a
// notification failure never rolls back the domain mutation — the bell is
// cosmetic, the underlying action (join / verify / award) is not.
//
// `title` / `body` are the English fallbacks stored in the DB. The client
// renders a localized string from `type` + `metadata` via useTranslations
// and only falls back to these if a translation key is missing.
//
// Respects per-user `notification_prefs`: if the recipient has explicitly
// opted out of this type (`prefs[type] === false`), we skip the insert
// silently. Missing/unknown keys default to enabled, so new types ship on
// by default without a backfill.
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getDb();

  const [recipient] = await db
    .select({ prefs: users.notification_prefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // If the user row is gone (deleted/scrubbed) we just no-op — there's
  // no bell to render for them anyway.
  if (!recipient) return;

  const prefs = (recipient.prefs ?? {}) as NotificationPrefs;
  if (prefs[type] === false) return;

  await db.insert(notifications).values({
    user_id: userId,
    type,
    title,
    body,
    metadata: metadata ?? null,
  });
}

// Fire-and-forget wrapper around `createNotification`. Every API route
// that emits a notification already hand-rolled this try/catch — the
// bell is cosmetic, a notification failure must never roll back the
// domain mutation that came before it. `context` is appended to the
// console.error tag so a log line tells you which route path failed
// (useful when several routes emit the same `type`).
export async function notifyUser(
  userId: string,
  type: NotificationType,
  title: string,
  body: string | null,
  metadata?: Record<string, unknown>,
  context?: string
): Promise<void> {
  try {
    await createNotification(userId, type, title, body, metadata);
  } catch (err) {
    console.error(`notification:${context ?? type} failed`, err);
  }
}
