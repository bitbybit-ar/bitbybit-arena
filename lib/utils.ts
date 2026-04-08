/** Merge CSS module classes — falsy values are filtered out. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Generate a URL-safe slug from a title, with a short random suffix. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
