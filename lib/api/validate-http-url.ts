import { BadRequestError } from "./errors";

export const MAX_URL_LEN = 2048;

/**
 * Validate a user-supplied URL and return a cleaned value (or `null` if
 * the input is empty). Throws BadRequestError on bad shapes.
 *
 * - Accepts `undefined` / `null` / `""` as "not provided" → returns `null`.
 * - Rejects non-strings, anything over 2048 chars, and anything whose
 *   scheme isn't `http://` or `https://`. The scheme check is the main
 *   reason this exists — it blocks `javascript:`, `data:`, `file:`, and
 *   other sneaky URIs from being stored and later rendered in an
 *   `<img src>`.
 *
 * Used for every URL-shaped field that crosses the API boundary:
 * `badge_image_url`, completion `image_url`, and anything else we end up
 * rendering in a browser later.
 */
export function validateHttpUrl(
  raw: unknown,
  fieldName: string
): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new BadRequestError(`${fieldName} must be a string`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_URL_LEN) {
    throw new BadRequestError(
      `${fieldName} must be at most ${MAX_URL_LEN} characters`
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new BadRequestError(
      `${fieldName} must be an http(s) URL`
    );
  }
  return trimmed;
}
