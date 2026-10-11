/** Wallets use UInt64; lifetime turnover uses MariaDB DECIMAL(65,0). */
export const TOKEN_MAX = 18446744073709551615n;
export const TOKEN_LIFETIME_MAX = 10n ** 65n - 1n;
export type TokenAmountInput = string | number | bigint;
export function tokenInteger(value: unknown, maximum = TOKEN_MAX, minimum = 0n): bigint {
  if ((typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") ||
      (typeof value === "number" && !Number.isSafeInteger(value)) ||
      (typeof value === "string" && !/^-?(0|[1-9][0-9]*)$/.test(value))) throw new Error("Tokens must be an exact whole decimal amount.");
  const parsed = BigInt(value);
  if (parsed < minimum || parsed > maximum) throw new Error("Token amount is outside the supported range.");
  return parsed;
}
export function tokenAmountField(value: unknown): string | null {
  try { return tokenInteger(value).toString(); } catch { return null; }
}
