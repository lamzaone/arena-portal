const STEAM_ID64_MIN = 76_561_197_960_265_728n;
const STEAM_ID64_MAX = STEAM_ID64_MIN + 0xffff_ffffn;

export function isIndividualSteamId64(value: string): boolean {
  if (!/^\d{17}$/.test(value)) return false;
  const numeric = BigInt(value);
  return numeric >= STEAM_ID64_MIN && numeric <= STEAM_ID64_MAX;
}

export function uniqueIndividualSteamIds(values: readonly string[]): string[] {
  return [...new Set(values.filter(isIndividualSteamId64))].slice(0, 100);
}
