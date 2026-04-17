/**
 * Reusable Zod primitives for shapes that span multiple routes —
 * Nostr identifiers, slugs, tags, URLs. Every primitive normalises
 * its input via `.transform()` so call sites can rely on a clean
 * canonical value (lowercased hex, trimmed strings, …) without each
 * route re-implementing the same boilerplate.
 *

 * Used by both the API routes (via `parseBody`/`parseQuery` in
 * `lib/api/parse.ts`) and any client form that needs the same
 * validation rules — Zod runs in the browser, so importing from here
 * is safe from `"use client"` components too.
 */
import { z } from "zod";

const HEX_64_RE = /^[0-9a-f]{64}$/i;
const HASHTAG_RE = /^[a-z0-9_]{2,50}$/;
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const TAG_RE = /^[a-z0-9-]{1,30}$/;

export const MAX_TAGS = 10;
export const MAX_URL_LEN = 2048;

/**
 * 64-character hex string (case-insensitive on the way in, lowercase
 * on the way out). Used for any Nostr event id or pubkey we persist —
 * the DB stores lowercase-only so the transform keeps callers honest.
 *
 * `trim` runs before the regex so leading/trailing whitespace from a
 * pasted value never surfaces as a "must be 64 chars" error — that
 * was a UX papercut in the client form before this primitive existed.
 */
export const Hex64Schema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().regex(HEX_64_RE, "must be a 64-character hex string"))
  .transform((s) => s.toLowerCase());

/** Same wire format as Hex64; semantic alias for pubkey-shaped fields. */
export const NostrPubkeySchema = Hex64Schema;

/**
 * NIP-12 hashtag — letters/digits/underscore only, 2-50 chars. Strips
 * a leading `#` and lowercases so users can paste either `#foo` or
 * `foo` and we always store `foo`.
 */
export const HashtagSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase().replace(/^#/, ""))
  .pipe(
    z
      .string()
      .regex(
        HASHTAG_RE,
        "hashtag must be 2-50 characters, letters/digits/underscore only"
      )
  );

/**
 * URL-safe slug used as the natural key for challenges (and the `d`
 * tag in their NIP-33 events). 1-100 chars of `[a-z0-9-]`. We don't
 * lowercase or transform — clients pre-sign the slug into the
 * kind:30100 event so the value has to be preserved exactly.
 */
export const SlugSchema = z
  .string()
  .regex(
    SLUG_RE,
    "slug must be 1-100 characters of lowercase letters, digits, or hyphens"
  );

const SingleTagSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase().replace(/\s+/g, "-"));

/**
 * Cleans an array of user-supplied tags: trims, lowercases, replaces
 * spaces with hyphens, dedupes, drops empties, and rejects anything
 * that doesn't match TAG_RE after normalisation. Returns up to MAX_TAGS
 * entries — the source array can't exceed it (otherwise we 400 rather
 * than silently truncating, matching the legacy normalizer's behavior).
 */
export const TagsSchema = z
  .array(z.string(), {
    error: "tags must be an array of strings",
  })
  .max(MAX_TAGS, `tags can have at most ${MAX_TAGS} entries`)
  .transform((tags, ctx) => {
    const seen = new Set<string>();
    for (const raw of tags) {
      const cleaned = SingleTagSchema.parse(raw);
      if (cleaned.length === 0) continue;
      if (!TAG_RE.test(cleaned)) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid tag "${raw}". Use 1-30 lowercase letters, digits, or hyphens.`,
        });
        return z.NEVER;
      }
      seen.add(cleaned);
    }
    return Array.from(seen);
  });

/**
 * `http(s)://` URL ≤ 2048 chars, with empty/null/undefined/whitespace
 * collapsing to `null`. The scheme check is the security-critical bit
 * — it blocks `javascript:`, `data:`, `file:` from ever being persisted
 * and later rendered into an `<img src>`.
 *
 * Implemented as a single `transform` with `ctx.addIssue` (rather than
 * a `z.union([z.null(), z.string()...])`) so the surfaced first issue
 * always carries the meaningful message — Zod v4 unions report the
 * first branch's failure ("expected null") which buries the actual
 * scheme/length error.
 */
export const HttpUrlSchema = z
  .preprocess(
    (v) =>
      v === undefined || v === null || (typeof v === "string" && v.trim() === "")
        ? null
        : v,
    z
      .string({ error: "url must be a string" })
      .nullable()
      .transform((v, ctx): string | null => {
        if (v === null) return null;
        const trimmed = v.trim();
        if (trimmed.length === 0) return null;
        if (trimmed.length > MAX_URL_LEN) {
          ctx.addIssue({
            code: "custom",
            message: `url must be at most ${MAX_URL_LEN} characters`,
          });
          return z.NEVER;
        }
        if (!/^https?:\/\//i.test(trimmed)) {
          ctx.addIssue({
            code: "custom",
            message: "url must be an http(s) URL",
          });
          return z.NEVER;
        }
        return trimmed;
      })
  );

/**
 * Comma-separated list of pubkeys passed in a query string. Splits,
 * lowercases, drops anything that isn't 64-hex, dedupes, and caps at
 * `max` entries (default 1000) so a malicious caller can't blow up
 * the SQL `IN (...)` list.
 */
export function CsvHexListSchema(max = 1000) {
  return z
    .string()
    .optional()
    .transform((raw) => {
      if (!raw) return [] as string[];
      const seen = new Set<string>();
      for (const part of raw.split(",")) {
        const v = part.trim().toLowerCase();
        if (HEX_64_RE.test(v)) seen.add(v);
        if (seen.size >= max) break;
      }
      return Array.from(seen);
    });
}
