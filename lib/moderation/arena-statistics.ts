function count(value: unknown) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0; }

export function arenaStatistics(row: Record<string, unknown>) {
  const roundWins = count(row.round_win), roundLosses = count(row.round_lose), shots = count(row.shoots);
  return { roundWins, roundLosses, roundWinRate: roundWins + roundLosses > 0 ? 100 * roundWins / (roundWins + roundLosses) : null,
    assists: count(row.assists), gamesPlayed: count(row.games_played), damage: count(row.damage),
    accuracy: shots > 0 ? Math.min(100, 100 * count(row.hits) / shots) : null,
    highestKillstreak: row.highest_killstreak == null ? null : count(row.highest_killstreak) };
}
