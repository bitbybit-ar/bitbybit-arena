/**
 * Thin wrappers around `zod`'s parse so route handlers can validate
 * request bodies and query strings in one line and stay focused on
 * business logic. Failures raise `BadRequestError`, which the
 * `apiHandler` wrapper already turns into a 400 with the standard
 * `{ success: false, error }` envelope.
 *
 * Why a wrapper instead of calling `schema.parse(...)` inline:
 *   1. Centralised error formatting — one place to choose between
 *      "first issue only" (current behavior, matches the legacy
 *      hand-rolled validators) and "concatenate all issues" (could
 *      flip later without touching every route).
 *   2. Keeps `BadRequestError` as the single boundary every handler
 *      throws, so middleware / logging only has to know about one
 *      shape.
 */
import type { NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { BadRequestError } from "./errors";

function formatZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * JSON-parse the request body and validate against `schema`. Treats a
 * missing or malformed body as `BadRequestError("Invalid JSON body")`
 * — matches what `await req.json()` would throw, but with a stable
 * user-facing message instead of a SyntaxError stack.
 */
export async function parseBody<T extends ZodType>(
  req: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new BadRequestError(formatZodError(result.error));
  }
  return result.data;
}

/**
 * Validate `req.nextUrl.searchParams` against `schema`. The schema
 * sees a plain `Record<string, string>` (Next/URL semantics — last
 * value wins for repeated keys), so use `.transform()` for csv
 * splitting / number coercion / etc. inside the schema itself.
 */
export function parseQuery<T extends ZodType>(
  req: NextRequest,
  schema: T
): z.infer<T> {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new BadRequestError(formatZodError(result.error));
  }
  return result.data;
}
