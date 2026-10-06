type Entry = { expiresAt: number; response: Promise<unknown> };
const requests = new Map<string, Entry>();

/** Repeated reel cards share one catalogue request and its completed result. */
export function loadCatalogueArtwork(url: string): Promise<unknown> {
  const cached = requests.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.response;
  const entry: Entry = { expiresAt: Date.now() + 60_000, response: Promise.resolve(null) };
  entry.response = fetch(url, { credentials: "same-origin", signal: AbortSignal.timeout(15_000) })
    .then(async response => {
      if (!response.ok) throw new Error("Preview unavailable");
      const body: unknown = await response.json();
      const images = body as { imageUrl?: unknown; imageUrls?: unknown } | null;
      if (images?.imageUrl || (Array.isArray(images?.imageUrls) && images.imageUrls.length)) {
        entry.expiresAt = Date.now() + 60 * 60_000;
      }
      return body;
    });
  requests.delete(url);
  requests.set(url, entry);
  while (requests.size > 512) requests.delete(requests.keys().next().value!);
  return entry.response;
}
