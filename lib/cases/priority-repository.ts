import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPortalDatabasePool } from "@/lib/data/database-pools";
import { parseCasePriority, type CasePriority } from "./priority.ts";
import type { StaffCaseType } from "./staff-queue.ts";

function isMissingPriorityStorage(error: unknown) {
  return error instanceof Error && (/portal_case_priorities/.test(error.message))
    && (/doesn't exist|does not exist|no such table/i.test(error.message));
}

export async function getStaffCasePriorities(caseType: StaffCaseType, caseIds: number[]) {
  const pool = getPortalDatabasePool();
  const priorities = new Map<number, CasePriority>();
  if (!pool) return { priorities, available: false };
  try {
    const [rows] = await pool.query<Array<RowDataPacket & { case_id: number; priority: string }>>(
      `SELECT case_id, priority FROM portal_case_priorities WHERE case_type = ?${caseIds.length ? ` AND case_id IN (${caseIds.map(() => "?").join(",")})` : " AND 1 = 0"}`,
      [caseType, ...caseIds],
    );
    for (const row of rows) priorities.set(Number(row.case_id), parseCasePriority(row.priority) ?? "normal");
    return { priorities, available: true };
  } catch {
    // Migration 042 is additive. Existing case queues remain readable before it is applied.
    return { priorities, available: false };
  }
}

/** The API checks staff permissions and target immunity before calling this transaction. */
export async function setStaffCasePriority(input: { caseType: StaffCaseType; caseId: number; priority: string; actorSteamId: string }) {
  const priority = parseCasePriority(input.priority);
  if (!priority) throw new Error("priority");
  if (!["appeal", "ticket"].includes(input.caseType) || !Number.isSafeInteger(input.caseId) || input.caseId <= 0) throw new Error("case");
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("priority-storage");
  const table = input.caseType === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [cases] = await connection.query<RowDataPacket[]>(`SELECT id FROM ${table} WHERE id = ? FOR UPDATE`, [input.caseId]);
    if (!cases.length) throw new Error("case");
    await connection.execute(
      "INSERT INTO portal_case_priorities (case_type, case_id, priority, updated_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE priority = VALUES(priority), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP",
      [input.caseType, input.caseId, priority, input.actorSteamId],
    );
    await connection.execute(
      "INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id) VALUES ('player', ?, ?, ?, ?)",
      [input.actorSteamId, `staff.${input.caseType}.priority.${priority}`, input.caseType, String(input.caseId)],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (isMissingPriorityStorage(error)) throw new Error("priority-storage");
    throw error;
  } finally { connection.release(); }
}
