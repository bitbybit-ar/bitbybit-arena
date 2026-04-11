import { BadRequestError } from "./errors";

const TAG = /^[a-z0-9-]{1,30}$/;
export const MAX_TAGS = 10;

export function normalizeTags(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new BadRequestError("tags must be an array of strings");
  }
  if (raw.length > MAX_TAGS) {
    throw new BadRequestError(`tags can have at most ${MAX_TAGS} entries`);
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new BadRequestError("tags must be an array of strings");
    }
    const cleaned = entry.trim().toLowerCase().replace(/\s+/g, "-");
    if (cleaned.length === 0) continue;
    if (!TAG.test(cleaned)) {
      throw new BadRequestError(
        `Invalid tag "${entry}". Use 1-30 lowercase letters, digits, or hyphens.`
      );
    }
    seen.add(cleaned);
  }
  return Array.from(seen);
}
