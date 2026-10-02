/** Return a uniformly distributed integer in [0, maximum). Production uses node:crypto randomInt. */
export type RandomInt = (maximum: number) => number;
export type CasinoGame = 'roulette' | 'plinko' | 'blackjack' | 'crash' | 'slots';
export type RouletteSelection =
  | { kind: 'number'; value: number }
  | { kind: 'color'; value: 'red' | 'black' }
  | { kind: 'parity'; value: 'odd' | 'even' }
  | { kind: 'range'; value: 'low' | 'high' }
  | { kind: 'dozen' | 'column'; value: 1 | 2 | 3 };
export interface RouletteResult {
  stakeTokens: number;
  payoutTokens: number;
  selection: RouletteSelection;
  number: number;
  color: 'red' | 'black' | 'green';
}
export interface RouletteBet { selection: RouletteSelection; stakeTokens: number }
export interface RouletteMultiResult {
  stakeTokens: number;
  payoutTokens: number;
  number: number;
  color: RouletteResult['color'];
  bets: (RouletteBet & { payoutTokens: number })[];
}
export type PlinkoRows = 8 | 12 | 16;
export type PlinkoRisk = 'low' | 'medium' | 'high';
export interface PlinkoSettings { rows: PlinkoRows; risk: PlinkoRisk }
export interface PlinkoResult extends PlinkoSettings {
  stakeTokens: number;
  payoutTokens: number;
  path: (0 | 1)[];
  bin: number;
  /** Basis points of the total return (10000 = 1x). */
  multiplier: number;
  paytable: number[];
}
export interface PlinkoBatchResult extends PlinkoSettings {
  stakePerBall: number;
  ballCount: number;
  stakeTokens: number;
  payoutTokens: number;
  paytable: number[];
  balls: PlinkoResult[];
}
export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export interface Card { rank: CardRank; suit: CardSuit }
export type BlackjackAction = 'hit' | 'stand' | 'double' | 'split';
export interface BlackjackHand {
  cards: Card[];
  stakeTokens: number;
  status: 'playing' | 'stood' | 'bust';
  natural: boolean;
  split: boolean;
  doubled: boolean;
}
/** Server persistence only. Always project through publicBlackjack before serialization. */
export interface BlackjackState {
  status: 'active' | 'settled';
  hands: BlackjackHand[];
  currentHand: number;
  dealer: Card[];
  shoe: Card[];
  totalStakeTokens: number;
  payoutTokens: number | null;
}
export interface BlackjackPublicHand extends BlackjackHand { total: number; soft: boolean }
export interface BlackjackPublicState {
  status: 'active' | 'settled';
  hands: BlackjackPublicHand[];
  currentHand: number;
  dealer: { cards: (Card | null)[]; total: number; soft: boolean };
  totalStakeTokens: number;
  payoutTokens: number | null;
  availableActions: BlackjackAction[];
}
export interface CasinoSettings {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  blackjackTimeoutMs: number;
}
export interface CrashBetPublic {
  id: string;
  roundId: string;
  stakeTokens: number;
  autoCashout: number | null;
  status: 'pending' | 'active' | 'cashed_out' | 'lost';
  cashoutMultiplier: number | null;
  payoutTokens: number | null;
}
export interface CrashPublicSnapshot {
  roundId: string;
  phase: 'betting' | 'flying' | 'crashed';
  serverTime: number;
  opensAt: number;
  startAt: number;
  /** Present only after the crash. Never include an active round's crash point/time. */
  crashesAt: number | null;
  multiplier: number;
  recent: { roundId: string; multiplier: number; crashedAt: number }[];
  bet: CrashBetPublic | null;
  participants: CrashParticipantPublic[];
}
export interface CrashParticipantPublic {
  betId: string;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  stakeTokens: number;
  status: CrashBetPublic['status'];
  cashoutMultiplier: number | null;
  payoutTokens: number | null;
}
export interface CasinoRoundPublic {
  id: string;
  game: CasinoGame;
  status: 'active' | 'settled';
  stakeTokens: number;
  payoutTokens: number | null;
  createdAt: string;
  settledAt: string | null;
  details: RouletteResult | RouletteMultiResult | PlinkoResult | PlinkoBatchResult | BlackjackPublicState | CrashBetPublic | Record<string, unknown>;
}
export interface CasinoBootstrap {
  balance: number;
  settings: CasinoSettings;
  activeBlackjack: CasinoRoundPublic | null;
  crash: CrashPublicSnapshot | null;
  history: CasinoRoundPublic[];
}

export function assertCasinoStake(stake: number): void {
  if (!Number.isSafeInteger(stake) || stake < 2) throw new Error('Stake must be a safe integer of at least 2 Tokens.');
}
export function casinoRandom(randomInt: RandomInt, maximum: number): number {
  const value = randomInt(maximum);
  if (!Number.isSafeInteger(value) || value < 0 || value >= maximum) throw new Error('Invalid random integer.');
  return value;
}
/** Integer arithmetic avoids floating-point rounding of financial returns. */
export function casinoReturn(stake: number, numerator: number, denominator = 1): number {
  const payout = BigInt(stake) * BigInt(numerator) / BigInt(denominator);
  if (payout > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Payout exceeds the safe integer limit.');
  return Number(payout);
}
