const knownDatabaseCodes = new Set([
  "ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_PARSE_ERROR", "ER_ACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR",
  "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT", "ER_CON_COUNT_ERROR", "ER_TOO_MANY_USER_CONNECTIONS",
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "PROTOCOL_CONNECTION_LOST",
]);

/** Only fixed operation labels and recognized codes; never SQL, payloads or raw error messages. */
export function reportDiscordFailure(
  operation: "snapshot" | "roles" | "notifications.claim" | "notifications.complete" | "notifications.retry",
  error: unknown,
) {
  const candidate = error && typeof error === "object" && "code" in error ? error.code : null;
  const code = typeof candidate === "string" && knownDatabaseCodes.has(candidate) ? candidate : "internal_error";
  console.error(`[arena-discord-bridge] ${operation} failed: ${code}`);
}
