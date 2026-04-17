/**
 * Client-side counterpart to `parseBody` / `parseQuery`. Same Zod
 * schemas the API uses, but instead of throwing `BadRequestError` the
 * helper returns a discriminated result so a "use client" form can
 * surface the failure inline (toast, per-field error, …) without
 * touching the network.
 *
 * Lives in `lib/schemas/` rather than `lib/api/` because Zod runs in
 * the browser and `lib/api/` is reserved for server-only handler code.
 */
import { z, type ZodType } from "zod";

export type ValidateFormResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      /** First issue formatted as `path: message` (empty path = top-level). */
      firstError: string;
      /** Map from `issue.path.join(".")` → message. Skipped for issues with no path. */
      fieldErrors: Record<string, string>;
    };

/**
 * Run `schema.safeParse(values)` and shape the failure into something
 * a form can render directly. `firstError` matches the format the
 * server-side `parseBody` helper produces for 400 responses, so a
 * form that surfaces both client-pre-flight and server-rejected
 * errors will read identically in both cases.
 */
export function validateForm<T extends ZodType>(
  schema: T,
  values: unknown
): ValidateFormResult<z.infer<T>> {
  const result = schema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    // First issue per field wins — matches the server's "first issue
    // only" message contract.
    if (path && !(path in fieldErrors)) {
      fieldErrors[path] = issue.message;
    }
  }
  const first = result.error.issues[0];
  const firstError = first
    ? first.path.length > 0
      ? `${first.path.join(".")}: ${first.message}`
      : first.message
    : "Invalid input";
  return { success: false, firstError, fieldErrors };
}
