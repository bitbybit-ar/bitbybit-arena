/**
 * Reusable pagination primitives. Two cursor strategies live here:
 *
 *   - IsoCursorSchema: cursor is the ISO-8601 timestamp of the last
 *     row from the previous page. Used by anything ordered by a
 *     `*_at` column (badges, challenges).
 *   - LimitSchema(min, max, def): coerces the `?limit=` query string
 *     to a clamped integer with a default — every paginated route
 *     wants this and they'd all reimplement it otherwise.
 */
import { z } from "zod";

export const IsoCursorSchema = z
  .string()
  .optional()
  .refine(
    (v) => v === undefined || !Number.isNaN(new Date(v).getTime()),
    "cursor must be a valid ISO-8601 timestamp"
  );

export function LimitSchema(min: number, max: number, def: number) {
  return z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return def;
      return Math.max(min, Math.min(Math.floor(n), max));
    });
}
