import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type DiscordLinkErrorCode = "invalid_input" | "invalid_code" | "expired_code" | "already_linked" | "rate_limited" | "storage_unavailable";

export class DiscordLinkError extends Error {
  readonly code: DiscordLinkErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: DiscordLinkErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "DiscordLinkError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type DiscordLink = { steamId: string; discordUserId: string; linkedAt: string };
export type DiscordLinkRedemption = { steamId: string; code: string; source: "portal" | "game" };
type LinkRow = RowDataPacket & { steam_id: string; discord_user_id: string; linked_at_seconds: number | string };
type CodeRow = RowDataPacket & { discord_user_id: string; consumed_at: unknown; expired: number; age_seconds: number | string; expires_at_seconds: number | string };

export function normalizeDiscordLinkCode(value: string) {
  const normalized = value.trim().toUpperCase().replaceAll("-", "");
  if (!/^[A-F0-9]{12}$/.test(normalized)) {
    throw new DiscordLinkError("invalid_code", "Enter the 12-character link code from the Discord bot.");
  }
  return normalized;
}

export function hashDiscordLinkCode(value: string) {
  return createHash("sha256").update(normalizeDiscordLinkCode(value)).digest("hex");
}

function validateSteamId(value: string) {
  if (!/^7656119\d{10}$/.test(value)) throw new DiscordLinkError("invalid_input", "Sign in with a valid Steam account.");
}

function linked(row: LinkRow): DiscordLink {
  return { steamId: row.steam_id, discordUserId: row.discord_user_id, linkedAt: new Date(Number(row.linked_at_seconds) * 1000).toISOString() };
}

function alreadyLinked() {
  return new DiscordLinkError("already_linked", "This Steam or Discord account is already linked. Existing links cannot be replaced.");
}

function duplicate(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

async function transaction<T>(pool: Pick<Pool, "getConnection">, work: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  let reusable = true;
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { reusable = false; }
    throw error;
  } finally {
    if (reusable) connection.release();
    else connection.destroy();
  }
}

export function createDiscordLinkRepository(pool: Pick<Pool, "getConnection" | "query">) {
  return {
    async getForSteam(steamId: string): Promise<DiscordLink | null> {
      validateSteamId(steamId);
      const [rows] = await pool.query<LinkRow[]>(
        "SELECT steam_id, discord_user_id, UNIX_TIMESTAMP(linked_at) AS linked_at_seconds FROM portal_discord_links WHERE steam_id = ? LIMIT 1",
        [steamId],
      );
      return rows[0] ? linked(rows[0]) : null;
    },

    async issue(discordUserId: string): Promise<{ code: string; expiresAt: string }> {
      if (!/^[1-9]\d{16,19}$/.test(discordUserId)) throw new DiscordLinkError("invalid_input", "A valid Discord user ID is required.");
      const rawCode = randomBytes(6).toString("hex").toUpperCase();
      const codeHash = hashDiscordLinkCode(rawCode);
      return transaction(pool, async (connection) => {
        // Establish a row even for first issuance. The unique Discord index
        // serializes competing issuers before they inspect the cooldown.
        // The placeholder is expired and consumed until the transaction updates it.
        await connection.execute(
          `INSERT INTO portal_discord_link_codes (code_hash, discord_user_id, expires_at, consumed_at, created_at)
           VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), TIMESTAMPADD(SECOND, -60, UTC_TIMESTAMP()))
           ON DUPLICATE KEY UPDATE discord_user_id = discord_user_id`,
          [codeHash, discordUserId],
        );
        const [codes] = await connection.query<CodeRow[]>(
          "SELECT discord_user_id, TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age_seconds FROM portal_discord_link_codes WHERE discord_user_id = ? FOR UPDATE",
          [discordUserId],
        );
        if (!codes[0]) throw new DiscordLinkError("storage_unavailable", "A link code could not be created. Try again.");
        const [links] = await connection.query<RowDataPacket[]>(
          "SELECT steam_id FROM portal_discord_links WHERE discord_user_id = ? LIMIT 1",
          [discordUserId],
        );
        if (links.length) throw alreadyLinked();
        const age = Number(codes[0].age_seconds);
        if (age < 60) {
          const retryAfter = Math.max(1, 60 - age);
          throw new DiscordLinkError("rate_limited", `Wait ${retryAfter} seconds before requesting another code.`, retryAfter);
        }
        await connection.execute(
          "UPDATE portal_discord_link_codes SET code_hash = ?, expires_at = TIMESTAMPADD(MINUTE, 10, UTC_TIMESTAMP()), consumed_at = NULL, created_at = UTC_TIMESTAMP() WHERE discord_user_id = ?",
          [codeHash, discordUserId],
        );
        const [expires] = await connection.query<CodeRow[]>(
          "SELECT UNIX_TIMESTAMP(expires_at) AS expires_at_seconds FROM portal_discord_link_codes WHERE discord_user_id = ?",
          [discordUserId],
        );
        return { code: `${rawCode.slice(0, 4)}-${rawCode.slice(4, 8)}-${rawCode.slice(8)}`, expiresAt: new Date(Number(expires[0].expires_at_seconds) * 1000).toISOString() };
      });
    },

    async redeem(input: DiscordLinkRedemption): Promise<DiscordLink> {
      validateSteamId(input.steamId);
      if (input.source !== "portal" && input.source !== "game") throw new DiscordLinkError("invalid_input", "Invalid link source.");
      const codeHash = hashDiscordLinkCode(input.code);
      return transaction(pool, async (connection) => {
        const [codes] = await connection.query<CodeRow[]>(
          "SELECT discord_user_id, consumed_at, expires_at <= UTC_TIMESTAMP() AS expired FROM portal_discord_link_codes WHERE code_hash = ? FOR UPDATE",
          [codeHash],
        );
        const code = codes[0];
        if (!code || code.consumed_at !== null) throw new DiscordLinkError("invalid_code", "This link code is invalid or has already been used. Request a new code from the Discord bot.");
        if (Number(code.expired)) throw new DiscordLinkError("expired_code", "This link code has expired. Request a new code from the Discord bot.");
        try {
          // Both unique indexes enforce the same one-to-one rule for portal and game.
          await connection.execute(
            "INSERT INTO portal_discord_links (steam_id, discord_user_id) VALUES (?, ?)",
            [input.steamId, code.discord_user_id],
          );
        } catch (error) {
          if (duplicate(error)) throw alreadyLinked();
          throw error;
        }
        // Insertion may have waited on a different account's unique-index lock.
        // Recheck database time before consuming and committing the new link.
        const [consumed] = await connection.execute<ResultSetHeader>(
          "UPDATE portal_discord_link_codes SET consumed_at = UTC_TIMESTAMP() WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()",
          [codeHash],
        );
        if (consumed.affectedRows !== 1) throw new DiscordLinkError("expired_code", "This link code has expired. Request a new code from the Discord bot.");
        await connection.execute(
          "INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id, metadata) VALUES ('player', ?, 'discord.linked', 'discord-link', ?, ?)",
          [input.steamId, input.steamId, JSON.stringify({ source: input.source, discordUserId: code.discord_user_id })],
        );
        const [links] = await connection.query<LinkRow[]>(
          "SELECT steam_id, discord_user_id, UNIX_TIMESTAMP(linked_at) AS linked_at_seconds FROM portal_discord_links WHERE steam_id = ? LIMIT 1",
          [input.steamId],
        );
        return linked(links[0]);
      });
    },
  };
}
