import { randomBytes } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type NotificationInput = {
  eventType: string; title: string; body: string; steamId?: string | null; path?: string | null;
};
export async function enqueueDiscordNotification(executor: Pick<PoolConnection, "execute">, input: NotificationInput) {
  await executor.execute(
    "INSERT INTO portal_discord_notifications (event_type, title, body, target_steam_id, target_path) VALUES (?, ?, ?, ?, ?)",
    [input.eventType, input.title.slice(0, 256), input.body.slice(0, 12000), input.steamId ?? null, input.path ?? null],
  );
}

type NotificationRow = RowDataPacket & {
  id: string; event_type: string; title: string; body: string;
  target_steam_id: string | null; target_path: string | null; attempts: number;
};
export type NotificationSettlement = {
  action: "complete" | "retry"; id: string; leaseToken: string; messageId?: string;
};

export function createNotificationRepository(pool: Pool) {
  return {
    async claim() {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        // MariaDB 10.5 has no SKIP LOCKED. Claim transactions only persist the
        // lease; Discord delivery happens after commit, so brief serialization
        // preserves exclusive claims without holding locks during network I/O.
        const [rows] = await connection.query<NotificationRow[]>(
          "SELECT id, event_type, title, body, target_steam_id, target_path, attempts FROM portal_discord_notifications " +
          "WHERE (status = 'pending' AND available_at <= UTC_TIMESTAMP()) " +
          "OR (status = 'processing' AND lease_expires_at <= UTC_TIMESTAMP()) " +
          "ORDER BY id LIMIT 1 FOR UPDATE",
        );
        const events = [];
        for (const row of rows) {
          const leaseToken = randomBytes(32).toString("hex");
          await connection.execute(
            "UPDATE portal_discord_notifications SET status = 'processing', attempts = attempts + 1, lease_token = ?, " +
            "lease_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 120 SECOND) WHERE id = ?",
            [leaseToken, row.id],
          );
          events.push({ id: String(row.id), leaseToken, eventType: row.event_type, title: row.title,
            body: row.body, steamId: row.target_steam_id, path: row.target_path });
        }
        await connection.commit();
        return events;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    },
    async settle(input: NotificationSettlement) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query<NotificationRow[]>(
          "SELECT attempts FROM portal_discord_notifications WHERE id = ? AND status = 'processing' " +
          "AND lease_token = ? AND lease_expires_at > UTC_TIMESTAMP() FOR UPDATE",
          [input.id, input.leaseToken],
        );
        if (!rows.length) { await connection.commit(); return false; }
        if (input.action === "complete") {
          const [result] = await connection.execute<ResultSetHeader>(
            "UPDATE portal_discord_notifications SET status = 'sent', discord_message_id = ?, processed_at = UTC_TIMESTAMP(), " +
            "lease_token = NULL, lease_expires_at = NULL, last_error = NULL WHERE id = ? AND lease_token = ?",
            [input.messageId ?? null, input.id, input.leaseToken],
          );
          if (result.affectedRows !== 1) throw new Error("Discord notification lease changed.");
          await connection.execute(
            "INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id, metadata) " +
            "VALUES ('bot', 'discord', 'discord.notification.sent', 'discord-notification', ?, ?)",
            [input.id, JSON.stringify({ messageId: input.messageId })],
          );
        } else {
          const delay = Math.min(300, 5 * 2 ** Math.min(Number(rows[0].attempts), 6));
          await connection.execute(
            "UPDATE portal_discord_notifications SET status = 'pending', available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), " +
            "lease_token = NULL, lease_expires_at = NULL, last_error = 'Discord delivery failed; will retry.' WHERE id = ? AND lease_token = ?",
            [delay, input.id, input.leaseToken],
          );
        }
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    },
  };
}
