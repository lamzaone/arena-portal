import 'server-only';
import { getSteamProfiles } from '../steam/profiles.ts';

type Identity = { displayName: string; avatarUrl: string | null };
const CAPACITY = 1000;
const TTL_MS = 60_000;
const cache = new Map<string, { identity: Identity; expires: number }>();
const pending = new Set<string>();
let warming = false;
const fallback = (steamId: string): Identity => ({displayName:steamId,avatarUrl:null});

export function cachedCrashIdentity(steamId: string): Identity {
  const entry = cache.get(steamId);
  if (!entry || entry.expires <= Date.now()) return fallback(steamId);
  // Touch recent participants without extending their identity freshness.
  cache.delete(steamId); cache.set(steamId,entry);
  return entry.identity;
}

/** Call only after releasing financial locks. Never await decorative enrichment. */
export function warmCrashIdentities(steamIds: readonly string[]): void {
  const now = Date.now();
  for (const id of steamIds) {
    if ((cache.get(id)?.expires ?? 0) > now || pending.has(id)) continue;
    if (pending.size >= CAPACITY) break;
    pending.add(id);
  }
  if (!warming && pending.size) void warm();
}

async function warm(): Promise<void> {
  warming = true;
  try {
    while (pending.size) {
      const ids = [...pending].slice(0,100); // Steam summaries accepts at most 100 IDs.
      let profiles: Awaited<ReturnType<typeof getSteamProfiles>> = new Map();
      try { profiles = await getSteamProfiles(ids); } catch { /* Negative-cache failed enrichment too. */ }
      for (const id of ids) {
        const profile = profiles.get(id);
        const identity = profile ? {displayName:profile.name,avatarUrl:profile.avatarFull} : fallback(id);
        cache.delete(id);
        cache.set(id,{identity,expires:Date.now()+TTL_MS});
        if (cache.size > CAPACITY) cache.delete(cache.keys().next().value!);
        pending.delete(id);
      }
    }
  } finally { warming = false; }
}
