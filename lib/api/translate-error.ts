import type { ApiErrorCode } from "./errors";

interface ErrorJson {
  success?: boolean;
  error?: string;
  code?: ApiErrorCode | string;
}

type Translator = (key: string) => string;

// Translate an API error response using the locale bundle. Tries
// `errors.codes.<code>` first, then falls back to the English `error`
// string the server sent (preserves info for codes the client doesn't
// know yet), then to the supplied default.
//
// Pass `useTranslations("errors.codes")` from next-intl as `t` so the
// helper can look up by code without the caller knowing the namespace.
export function translateApiError(
  json: ErrorJson | null | undefined,
  t: Translator,
  fallback: string
): string {
  if (!json) return fallback;
  if (json.code) {
    try {
      const translated = t(json.code);
      if (translated && translated !== json.code) return translated;
    } catch {
      /* fall through to server message */
    }
  }
  if (json.error && typeof json.error === "string") return json.error;
  return fallback;
}
