import { routing } from "@/i18n/routing";

export const APP_NAME = "BitByBit Arena";

// Every layout that sets its own title must re-declare the template, or the
// segments below it lose the brand suffix.
export const TITLE_TEMPLATE = `%s | ${APP_NAME}`;

export function alternatesFor(
  locale: string,
  path: string
): { canonical: string; languages: Record<string, string> } {
  return {
    canonical: `/${locale}${path}`,
    languages: Object.fromEntries(
      routing.locales.map((l) => [l, `/${l}${path}`])
    ),
  };
}
