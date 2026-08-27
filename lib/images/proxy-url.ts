/**
 * Turns a trusted server-provided HTTPS image into a same-origin request. The
 * route validates the destination again, so this helper is safe to use from
 * client components without exposing an open image proxy.
 */
export function proxiedImageUrl(value: string | null | undefined) {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:") return null;
    return `/api/image?src=${encodeURIComponent(url.toString())}`;
  } catch {
    return null;
  }
}
