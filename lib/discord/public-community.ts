/** Public invite metadata only; no bot credentials or member identities are used. */
export const COMMUNITY_DISCORD_INVITE = "https://discord.gg/eEkXZpSzrD";
const COMMUNITY_COUNTS_URL = "https://discord.com/api/v10/invites/eEkXZpSzrD?with_counts=true";

export type PublicCommunity = {
  state: "available" | "unavailable";
  name: string;
  members: number | null;
  online: number | null;
  checkedAt: string;
};

export function parsePublicCommunity(value: unknown, now: number): PublicCommunity | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const members = data.approximate_member_count;
  const online = data.approximate_presence_count;
  if (typeof members !== "number" || !Number.isSafeInteger(members) || members < 0 ||
      typeof online !== "number" || !Number.isSafeInteger(online) || online < 0 || online > members) return null;
  const guild = data.guild as Record<string, unknown> | null;
  if (!guild || typeof guild.name !== "string" || !guild.name.trim()) return null;
  return {
    state: "available", name: guild.name.trim().slice(0, 100), members, online,
    checkedAt: new Date(now).toISOString(),
  };
}

export function createPublicCommunityReader(dependencies: {
  fetch?: typeof fetch;
  now?: () => number;
} = {}) {
  const request = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  let cached: PublicCommunity | null = null;
  let expiresAt = 0;
  let inFlight: Promise<PublicCommunity> | null = null;

  return async function readPublicCommunity(): Promise<PublicCommunity> {
    if (cached && now() < expiresAt) return cached;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let result: PublicCommunity | null = null;
      try {
        const response = await request(COMMUNITY_COUNTS_URL, {
          cache: "no-store", signal: AbortSignal.timeout(2_500),
          headers: { Accept: "application/json" },
        });
        if (response.ok) result = parsePublicCommunity(await response.json(), now());
      } catch {
        // Keep the homepage available when Discord is slow, offline, or rate limited.
      }
      cached = result ?? {
        state: "unavailable", name: "TAPPED.RO", members: null, online: null,
        checkedAt: new Date(now()).toISOString(),
      };
      expiresAt = now() + (result ? 300_000 : 30_000);
      return cached;
    })();
    try { return await inFlight; } finally { inFlight = null; }
  };
}

export const getPublicCommunity = createPublicCommunityReader();
