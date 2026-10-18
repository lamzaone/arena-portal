import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export type RecruitmentStatus = "submitted" | "reviewing" | "accepted" | "declined";
export type RecruitmentFilters = { name: string; status: "all" | RecruitmentStatus };
export type RecruitmentApplication = {
  id: string;
  steamId: string;
  nickname: string;
  age: number;
  discordProfile: string;
  discordLinked: boolean;
  steamGroupMember: boolean;
  playtimeSeconds: number | null;
  reason: string;
  adminResponse: string | null;
  status: RecruitmentStatus;
  createdAt: number;
  reviewedBy: string | null;
  reviewedAt: number | null;
};
export type RecruitmentSubmission = {
  steamId: string;
  nickname: string;
  age: string;
  discordProfile: string;
  steamGroupMember: string;
  reason: string;
  playtimeSeconds: number | null;
};
type SettingsRow = RowDataPacket & { is_open: number; updated_by: string | null; updated_at: number | string | null };
type ApplicationRow = RowDataPacket & {
  id: string; steam_id: string; nickname: string; age: number; discord_profile: string;
  discord_linked: number; steam_group_member: number; playtime_seconds: number | string | null;
  reason: string; admin_response?: string | null; status: RecruitmentStatus; created_at: number | string; reviewed_by: string | null; reviewed_at: number | string | null;
};

export function normalizeRecruitmentFilters(input?: { name?: string; status?: string }): RecruitmentFilters {
  const name = typeof input?.name === "string" ? input.name.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 128) : "";
  const status = typeof input?.status === "string" ? input.status.trim().toLowerCase() : "all";
  return { name, status: ["submitted", "reviewing", "accepted", "declined"].includes(status) ? status as RecruitmentStatus : "all" };
}

function adminResponse(value: string) {
  if (typeof value !== "string") throw new Error("application-response");
  // Feedback is stored and rendered as plain text. Preserve useful newlines,
  // strip invisible control characters, and bound the normalized content.
  const response = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (response.length > 2000) throw new Error("application-response");
  return response || null;
}

function validSteamId(value: string) {
  if (!/^7656119\d{10}$/.test(value)) throw new Error("application-details");
}
function profileUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol === "https:" && ["discord.com", "www.discord.com"].includes(url.hostname) && !url.username && !url.password && !url.port && /^\/users\/[1-9]\d{16,19}\/?$/.test(url.pathname)) {
      return `https://discord.com${url.pathname.replace(/\/$/, "")}`;
    }
  } catch { /* The same validation applies to native and enhanced form posts. */ }
  throw new Error("application-details");
}
function application(row: ApplicationRow): RecruitmentApplication {
  return {
    id: row.id, steamId: row.steam_id, nickname: row.nickname, age: Number(row.age),
    discordProfile: row.discord_profile, discordLinked: Boolean(Number(row.discord_linked)),
    steamGroupMember: Boolean(Number(row.steam_group_member)),
    playtimeSeconds: row.playtime_seconds === null ? null : Number(row.playtime_seconds),
    reason: row.reason, adminResponse: row.admin_response ?? null, status: row.status, createdAt: Number(row.created_at),
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at === null ? null : Number(row.reviewed_at),
  };
}
async function transaction<T>(pool: Pick<Pool, "getConnection">, work: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const value = await work(connection);
    await connection.commit();
    return value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
async function audit(connection: PoolConnection, actorSteamId: string, action: string, targetId: string) {
  await connection.execute(
    "INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id) VALUES ('steam', ?, ?, 'staff-recruitment', ?)",
    [actorSteamId, action, targetId],
  );
}

export function createStaffRecruitmentRepository(pool: Pick<Pool, "query" | "getConnection">) {
  return {
    async getState() {
      const [rows] = await pool.query<SettingsRow[]>("SELECT is_open, updated_by, updated_at FROM portal_staff_recruitment WHERE id = 1");
      if (!rows[0]) throw new Error("recruitment-unavailable");
      return { open: Boolean(Number(rows[0].is_open)), updatedBy: rows[0].updated_by, updatedAt: rows[0].updated_at === null ? null : Number(rows[0].updated_at) };
    },
    async setOpen(open: boolean, actorSteamId: string) {
      validSteamId(actorSteamId);
      if (typeof open !== "boolean") throw new Error("application-details");
      return transaction(pool, async (connection) => {
        const [settings] = await connection.query<SettingsRow[]>("SELECT is_open FROM portal_staff_recruitment WHERE id = 1 FOR UPDATE");
        if (!settings[0]) throw new Error("recruitment-unavailable");
        await connection.execute("UPDATE portal_staff_recruitment SET is_open = ?, updated_by = ?, updated_at = ? WHERE id = 1", [Number(open), actorSteamId, Date.now()]);
        await audit(connection, actorSteamId, open ? "recruitment.opened" : "recruitment.closed", "1");
      });
    },
    async getOwnLatest(steamId: string) {
      validSteamId(steamId);
      const [rows] = await pool.query<ApplicationRow[]>("SELECT * FROM portal_staff_applications WHERE steam_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", [steamId]);
      return rows[0] ? application(rows[0]) : null;
    },
    async getPage(requestedPage: number, inputFilters?: { name?: string; status?: string }) {
      const filters = normalizeRecruitmentFilters(inputFilters);
      const conditions: string[] = [];
      const values: string[] = [];
      if (filters.name) {
        // '=' is an explicit LIKE escape character on both MariaDB and MySQL,
        // independent of the connection's NO_BACKSLASH_ESCAPES SQL mode.
        conditions.push("nickname LIKE ? ESCAPE '='");
        values.push(`%${filters.name.replace(/[=%_]/g, character => `=${character}`)}%`);
      }
      if (filters.status !== "all") { conditions.push("status = ?"); values.push(filters.status); }
      const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
      const [counts] = await pool.query<Array<RowDataPacket & { total: number | string }>>(`SELECT COUNT(*) AS total FROM portal_staff_applications${where}`, values);
      const total = Number(counts[0]?.total ?? 0);
      const pageCount = Math.max(1, Math.ceil(total / 25));
      const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
      const [rows] = await pool.query<ApplicationRow[]>(`SELECT * FROM portal_staff_applications${where} ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET ?`, [...values, (page - 1) * 25]);
      return { applications: rows.map(application), total, page, pageCount, filters };
    },
    async submit(input: RecruitmentSubmission) {
      validSteamId(input.steamId);
      const nickname = input.nickname.normalize("NFKC").trim();
      const reason = input.reason.trim();
      const age = Number(input.age);
      if (!nickname || nickname.length > 128 || /[\u0000-\u001f\u007f]/.test(nickname) || !/^\d{1,3}$/.test(input.age) || !Number.isInteger(age) || age < 1 || age > 120 || !["yes", "no"].includes(input.steamGroupMember) || reason.length < 20 || reason.length > 5000 || (input.playtimeSeconds !== null && (!Number.isSafeInteger(input.playtimeSeconds) || input.playtimeSeconds < 0))) {
        throw new Error("application-details");
      }
      try {
        return await transaction(pool, async (connection) => {
          // Admission and open/close actions share one lock, so a close cannot
          // race with a submission. The unique generated key also guards active
          // duplicates independently of application code.
          const [settings] = await connection.query<SettingsRow[]>("SELECT is_open FROM portal_staff_recruitment WHERE id = 1 FOR UPDATE");
          if (!settings[0]) throw new Error("recruitment-unavailable");
          if (!Number(settings[0].is_open)) throw new Error("recruitment-closed");
          const [active] = await connection.query<RowDataPacket[]>("SELECT id FROM portal_staff_applications WHERE steam_id = ? AND status IN ('submitted', 'reviewing') LIMIT 1 FOR UPDATE", [input.steamId]);
          if (active.length) throw new Error("application-active");
          const [links] = await connection.query<Array<RowDataPacket & { discord_user_id: string }>>("SELECT discord_user_id FROM portal_discord_links WHERE steam_id = ? LIMIT 1", [input.steamId]);
          const discordId = String(links[0]?.discord_user_id ?? "");
          const discordLinked = /^[1-9]\d{16,19}$/.test(discordId);
          const discordProfile = discordLinked ? `https://discord.com/users/${discordId}` : profileUrl(input.discordProfile);
          const id = randomUUID();
          await connection.execute(
            "INSERT INTO portal_staff_applications (id, steam_id, nickname, age, discord_profile, discord_linked, steam_group_member, playtime_seconds, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)",
            [id, input.steamId, nickname, age, discordProfile, Number(discordLinked), Number(input.steamGroupMember === "yes"), input.playtimeSeconds, reason, Date.now()],
          );
          await audit(connection, input.steamId, "recruitment.application.submitted", id);
          return id;
        });
      } catch (error) {
        if ((error as { code?: string })?.code === "ER_DUP_ENTRY") throw new Error("application-active");
        throw error;
      }
    },
    async review(id: string, status: string, actorSteamId: string, response?: string) {
      validSteamId(actorSteamId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !["reviewing", "accepted", "declined"].includes(status)) throw new Error("application-details");
      const normalizedResponse = response === undefined ? undefined : adminResponse(response);
      return transaction(pool, async (connection) => {
        const [rows] = await connection.query<ApplicationRow[]>("SELECT * FROM portal_staff_applications WHERE id = ? FOR UPDATE", [id]);
        if (!rows[0]) throw new Error("application-missing");
        const current = rows[0];
        const sameStatus = current.status === status;
        if (!["submitted", "reviewing"].includes(current.status) && !sameStatus) throw new Error("application-closed");
        if (sameStatus && (normalizedResponse === undefined || normalizedResponse === (current.admin_response ?? null))) return;
        if (normalizedResponse === undefined) {
          await connection.execute("UPDATE portal_staff_applications SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?", [status, actorSteamId, Date.now(), id]);
        } else {
          await connection.execute("UPDATE portal_staff_applications SET status = ?, admin_response = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?", [status, normalizedResponse, actorSteamId, Date.now(), id]);
        }
        await audit(connection, actorSteamId, `recruitment.application.${sameStatus ? "response_updated" : status}`, id);
      });
    },
  };
}
