/**
 * MySQL reports an unapplied (or only partially applied) migration as
 * ER_NO_SUCH_TABLE/1146. Keep this check outside the VIP perk repository so
 * page reads can fail soft without making write paths treat missing storage as
 * a valid empty result.
 */
export function isMissingVipPerkStorageSchemaError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<unknown>();

  while (pending.length) {
    const current = pending.pop();
    if (current === null || (typeof current !== "object" && typeof current !== "function")) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const candidate = current as {
      code?: unknown;
      errno?: unknown;
      sqlState?: unknown;
      message?: unknown;
      cause?: unknown;
      errors?: unknown;
    };
    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (
      candidate.code === "ER_NO_SUCH_TABLE" ||
      candidate.errno === 1146 ||
      candidate.sqlState === "42S02" ||
      (/\btable\b/i.test(message) && /\bdoesn't exist\b/i.test(message))
    ) {
      return true;
    }

    if (candidate.cause !== undefined) pending.push(candidate.cause);
    if (Array.isArray(candidate.errors)) pending.push(...candidate.errors);
  }

  return false;
}
