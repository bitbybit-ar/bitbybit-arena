/**
 * Schemas for `/api/profile`. The PUT body is "every field optional;
 * at least one required" — drizzle-zod handles each column's max
 * length, the `superRefine` enforces the at-least-one rule.
 */
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { users } from "@/lib/db/schema";
import { HttpUrlSchema } from "./primitives";

const LOCALES = ["es", "en"] as const;
export const LocaleSchema = z.enum(LOCALES);

const NOTIFICATION_TYPE_VALUES = [
  "challenge_joined",
  "completion_submitted",
  "completion_verified",
  "prize_awarded",
  "badge_earned",
] as const;

// Partial per-type opt-out map. Missing keys = enabled. The PUT route
// merges this into the stored JSON instead of replacing, so toggling
// one type doesn't wipe the others. `z.partialRecord` (Zod 4) keeps the
// enum key constraint while making every key optional — `z.record` in
// v4 treats enum keys as required, which isn't what we want here.
export const NotificationPrefsSchema = z
  .partialRecord(z.enum(NOTIFICATION_TYPE_VALUES), z.boolean())
  .refine((v) => Object.keys(v).length > 0, {
    message: "notification_prefs cannot be an empty patch",
  });

// Pull column-level rules from the users table (varchar caps, NOT
// NULL on display_name/username, etc.) so we don't duplicate them.
const UserRowInsertSchema = createInsertSchema(users, {
  display_name: (s) =>
    s
      .transform((v) => v.trim())
      .pipe(z.string().min(1, "Display name is required")),
  username: (s) =>
    s
      .transform((v) => v.trim())
      .pipe(z.string().min(3, "Username must be at least 3 characters")),
  avatar_url: HttpUrlSchema,
  locale: LocaleSchema,
});

export const UpdateProfileBodySchema = z
  .object({
    display_name: UserRowInsertSchema.shape.display_name.optional(),
    username: UserRowInsertSchema.shape.username.optional(),
    avatar_url: HttpUrlSchema.optional(),
    about: z.string().nullish(),
    lightning_address: z.string().nullish(),
    locale: LocaleSchema.optional(),
    notification_prefs: NotificationPrefsSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "No fields to update",
  });

export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
