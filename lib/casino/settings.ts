import type { CasinoSettings } from './types.ts';

export class CasinoError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'CasinoError'; this.code = code; }
}
export function getCasinoSettings(): CasinoSettings {
  const enabled = (process.env.CASINO_ENABLED ?? 'true').toLowerCase();
  const minBet = Number(process.env.CASINO_MIN_BET ?? 2);
  const maxBet = Number(process.env.CASINO_MAX_BET ?? 100000);
  if (!['true', 'false', '1', '0'].includes(enabled) || !Number.isSafeInteger(minBet) || minBet < 2 || !Number.isSafeInteger(maxBet) || maxBet < minBet) {
    throw new CasinoError('casino_unavailable', 'Casino settings are invalid.');
  }
  return { enabled: enabled === 'true' || enabled === '1', minBet, maxBet, blackjackTimeoutMs: 15 * 60 * 1000 };
}
