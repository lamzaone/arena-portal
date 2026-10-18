import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  return next(specifier, context);
} });
const { createStaffRecruitmentRepository } = await import("./staff-recruitment.ts");
const database = new DatabaseSync(":memory:");
let failAudit = false;
let transactionTail = Promise.resolve();
const sql = (statement: string) => statement.replaceAll(" FOR UPDATE", "");
const pool = {
  async query(statement: string, args: unknown[] = []) { return [database.prepare(sql(statement)).all(...args as never[]), []]; },
  async getConnection() {
    let releaseLock!: () => void;
    const previous = transactionTail;
    transactionTail = new Promise(resolve => { releaseLock = resolve; });
    await previous;
    return {
      async beginTransaction() { database.exec("BEGIN"); },
      async query(statement: string, args: unknown[] = []) { return pool.query(statement, args); },
      async execute(statement: string, args: unknown[] = []) {
        if (failAudit && statement.includes("portal_audit_events")) throw new Error("audit unavailable");
        const result = database.prepare(sql(statement)).run(...args as never[]);
        return [{ affectedRows: Number(result.changes) }, []];
      },
      async commit() { database.exec("COMMIT"); },
      async rollback() { database.exec("ROLLBACK"); },
      release() { releaseLock(); },
    };
  },
};
const migration = readFileSync(new URL("../../db/041_staff_recruitment.sql", import.meta.url), "utf8")
  .replace(/\b(?:BIGINT|TINYINT|INT) UNSIGNED\b/g, "INTEGER")
  .replace(/UNIQUE KEY \w+\s*\(/g, "UNIQUE (")
  .replace(/,\s*KEY \w+\s*\([^)]*\)/g, "")
  .replace(/\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/g, ")");
database.exec(migration);
database.exec(readFileSync(new URL("../../db/044_staff_recruitment_responses.sql", import.meta.url), "utf8").replace("ADD COLUMN IF NOT EXISTS", "ADD COLUMN").replace(" AFTER reason", ""));
database.exec("CREATE TABLE portal_discord_links (steam_id TEXT PRIMARY KEY, discord_user_id TEXT); CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT)");
const repository = createStaffRecruitmentRepository(pool as never);
const steamId = "76561198000000001";
const input: import("./staff-recruitment.ts").RecruitmentSubmission = { steamId, nickname: "  Arena player  ", age: "21", discordProfile: "https://discord.com/users/12345678901234567", steamGroupMember: "yes", reason: "I would like to help keep the community friendly and fair.", playtimeSeconds: 3600 };

test.beforeEach(() => {
  failAudit = false;
  database.exec("DELETE FROM portal_staff_applications; DELETE FROM portal_discord_links; DELETE FROM portal_audit_events; UPDATE portal_staff_recruitment SET is_open = 0, updated_by = NULL, updated_at = NULL");
});
test.after(() => database.close());

test("migration starts closed and rejects applications until staff opens recruitment", async () => {
  assert.equal((await repository.getState()).open, false);
  await assert.rejects(repository.submit(input), { message: "recruitment-closed" });
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM portal_staff_applications").get()?.n, 0);
  await repository.setOpen(true, steamId);
  assert.equal((await repository.getState()).open, true);
});

test("submission persists a server-derived Discord link and accepts less than 30 hours", async () => {
  await repository.setOpen(true, steamId);
  database.prepare("INSERT INTO portal_discord_links VALUES (?, ?)").run(steamId, "98765432109876543");
  const id = await repository.submit({ ...input, discordProfile: "forged", discordLinked: false } as typeof input);
  const application = await repository.getOwnLatest(steamId);
  assert.equal(application?.id, id);
  assert.equal(application?.nickname, "Arena player");
  assert.equal(application?.discordProfile, "https://discord.com/users/98765432109876543");
  assert.equal(application?.discordLinked, true);
  assert.equal(application?.playtimeSeconds, 3600);
  assert.equal(application?.status, "submitted");
});

test("all active statuses block duplicates and a final decision permits a new application", async () => {
  await repository.setOpen(true, steamId);
  const id = await repository.submit(input);
  await assert.rejects(repository.submit(input), { message: "application-active" });
  await repository.review(id, "reviewing", steamId);
  await assert.rejects(repository.submit(input), { message: "application-active" });
  await repository.review(id, "declined", steamId);
  const next = await repository.submit(input);
  assert.notEqual(next, id);
  assert.equal((await repository.getPage(1)).total, 2);
});

test("validation rejects malformed ages, group answers, empty reasons and arbitrary Discord URLs", async () => {
  await repository.setOpen(true, steamId);
  for (const change of [{ age: "21years" }, { age: "0" }, { age: "121" }, { steamGroupMember: "maybe" }, { reason: "" }, { nickname: "" }, { discordProfile: "https://example.com/me" }, { playtimeSeconds: -1 }]) {
    await assert.rejects(repository.submit({ ...input, ...change }), { message: "application-details" });
  }
  assert.equal((await repository.getPage(1)).total, 0);
});

test("an unverified applicant remains unverified even with a claimed Discord profile", async () => {
  await repository.setOpen(true, steamId);
  await repository.submit({ ...input, discordLinked: true, playtimeSeconds: null } as typeof input);
  const application = await repository.getOwnLatest(steamId);
  assert.equal(application?.discordLinked, false);
  assert.equal(application?.playtimeSeconds, null);
});

test("settings and submissions roll back if audit persistence fails", async () => {
  failAudit = true;
  await assert.rejects(repository.setOpen(true, steamId), /audit unavailable/);
  assert.equal((await repository.getState()).open, false);
  failAudit = false;
  await repository.setOpen(true, steamId);
  failAudit = true;
  await assert.rejects(repository.submit(input), /audit unavailable/);
  assert.equal((await repository.getPage(1)).total, 0);
});

test("pagination retains all applications and own reads do not expose another player", async () => {
  await repository.setOpen(true, steamId);
  for (let index = 0; index < 27; index++) await repository.submit({ ...input, steamId: `7656119800000${String(index).padStart(4, "0")}` });
  const first = await repository.getPage(1);
  const second = await repository.getPage(2);
  assert.equal(first.total, 27);
  assert.equal(first.applications.length, 25);
  assert.equal(second.applications.length, 2);
  assert.equal(new Set([...first.applications, ...second.applications].map(application => application.id)).size, 27);
  assert.equal(await repository.getOwnLatest("76561198999999999"), null);
});

test("responses are trimmed plain text, omitted responses preserve feedback and explicit blanks clear it", async () => {
  await repository.setOpen(true, steamId);
  const id = await repository.submit(input);
  assert.equal((await repository.getOwnLatest(steamId))?.adminResponse, null);
  await repository.review(id, "reviewing", steamId, "  Thanks for applying.\n<script>literal text</script>  ");
  assert.equal((await repository.getOwnLatest(steamId))?.adminResponse, "Thanks for applying.\n<script>literal text</script>");
  await repository.review(id, "reviewing", steamId);
  assert.equal((await repository.getOwnLatest(steamId))?.adminResponse, "Thanks for applying.\n<script>literal text</script>");
  await repository.review(id, "reviewing", steamId, " \n\t ");
  assert.equal((await repository.getOwnLatest(steamId))?.adminResponse, null);
  await repository.review(id, "reviewing", steamId, "x".repeat(2000));
  await assert.rejects(repository.review(id, "accepted", steamId, "x".repeat(2001)), { message: "application-response" });
  const saved = await repository.getOwnLatest(steamId);
  assert.equal(saved?.status, "reviewing"); assert.equal(saved?.adminResponse?.length, 2000);
});

test("final decisions are immutable while the same final status can save or clear a response", async () => {
  await repository.setOpen(true, steamId);
  const id = await repository.submit(input);
  await repository.review(id, "accepted", steamId, "Welcome to the team.");
  const secondReviewer = "76561198000000002";
  await repository.review(id, "accepted", secondReviewer, "Welcome. We will contact you on Discord.");
  let saved = await repository.getOwnLatest(steamId);
  assert.equal(saved?.status, "accepted"); assert.equal(saved?.reviewedBy, secondReviewer);
  assert.equal(saved?.adminResponse, "Welcome. We will contact you on Discord.");
  for (const status of ["declined", "reviewing"]) await assert.rejects(repository.review(id, status, secondReviewer, "Attempted replacement"), { message: "application-closed" });
  saved = await repository.getOwnLatest(steamId);
  assert.equal(saved?.status, "accepted"); assert.equal(saved?.adminResponse, "Welcome. We will contact you on Discord.");
  await repository.review(id, "accepted", secondReviewer, "");
  assert.equal((await repository.getOwnLatest(steamId))?.adminResponse, null);
});

test("response updates and reviewer identity roll back atomically if the audit fails", async () => {
  await repository.setOpen(true, steamId);
  const id = await repository.submit(input);
  await repository.review(id, "declined", steamId, "Please gain more server experience first.");
  const before = await repository.getOwnLatest(steamId);
  failAudit = true;
  await assert.rejects(repository.review(id, "declined", "76561198000000002", "New feedback"), /audit unavailable/);
  assert.deepEqual(await repository.getOwnLatest(steamId), before);
});

test("own latest application responses never include another account's feedback", async () => {
  await repository.setOpen(true, steamId);
  const other = "76561198000000002";
  const first = await repository.submit(input);
  const second = await repository.submit({ ...input, steamId: other });
  await repository.review(first, "reviewing", steamId, "First player's response.");
  await repository.review(second, "declined", steamId, "Second player's response.");
  assert.equal((await repository.getOwnLatest(steamId))?.adminResponse, "First player's response.");
  assert.equal((await repository.getOwnLatest(other))?.adminResponse, "Second player's response.");
});

test("name and status filters cover all records before pagination and clamp against the filtered total", async () => {
  await repository.setOpen(true, steamId);
  for (let index = 0; index < 72; index++) {
    const id = await repository.submit({ ...input, steamId: `7656119800000${String(index).padStart(4, "0")}`, nickname: index < 20 ? `Other teammate ${index}` : `Needle teammate ${index}` });
    if (index >= 20 && index % 2 === 0) await repository.review(id, "reviewing", steamId);
  }
  const first = await repository.getPage(1, { name: "  Ｎｅｅｄｌｅ  ", status: " REVIEWING " });
  const second = await repository.getPage(999, { name: "Needle", status: "reviewing" });
  assert.deepEqual(first.filters, { name: "Needle", status: "reviewing" });
  assert.equal(first.total, 26); assert.equal(first.pageCount, 2); assert.equal(first.applications.length, 25);
  assert.equal(second.page, 2); assert.equal(second.applications.length, 1);
  const matching = [...first.applications, ...second.applications];
  assert.equal(new Set(matching.map(entry => entry.id)).size, 26);
  assert.ok(matching.every(entry => entry.nickname.includes("Needle") && entry.status === "reviewing"));
  const empty = await repository.getPage(8, { name: "absent", status: "accepted" });
  assert.equal(empty.total, 0); assert.equal(empty.page, 1); assert.equal(empty.pageCount, 1);
});

test("search treats percent, underscore, escape characters and apostrophes as literal nickname text", async () => {
  await repository.setOpen(true, steamId);
  for (const [index, nickname] of ["100% good_player=1", "100X goodXplayerX1", "O'Neil", "semi; DROP TABLE portal_staff_applications; --"].entries()) {
    await repository.submit({ ...input, steamId: `7656119800000${String(index).padStart(4, "0")}`, nickname });
  }
  for (const name of ["%", "good_player", "="]) {
    const result = await repository.getPage(1, { name, status: "invalid" });
    assert.equal(result.total, 1); assert.equal(result.filters.status, "all");
    assert.equal(result.applications[0].nickname, "100% good_player=1");
  }
  assert.equal((await repository.getPage(1, { name: "_" })).total, 2);
  assert.equal((await repository.getPage(1, { name: "O'Neil" })).total, 1);
  assert.equal((await repository.getPage(1, { name: "DROP TABLE" })).total, 1);
  assert.equal((await repository.getPage(1)).total, 4);
});

test("competing final decisions serialize on the application and the losing response never overwrites the winner", async () => {
  await repository.setOpen(true, steamId);
  const id = await repository.submit(input);
  const decisions = await Promise.allSettled([
    repository.review(id, "accepted", steamId, "Accepted by the first reviewer."),
    repository.review(id, "declined", "76561198000000002", "This response must not overwrite acceptance."),
  ]);
  assert.equal(decisions[0].status, "fulfilled"); assert.equal(decisions[1].status, "rejected");
  if (decisions[1].status === "rejected") assert.equal(decisions[1].reason.message, "application-closed");
  const saved = await repository.getOwnLatest(steamId);
  assert.equal(saved?.status, "accepted"); assert.equal(saved?.adminResponse, "Accepted by the first reviewer.");
  const before = database.prepare("SELECT COUNT(*) AS total FROM portal_audit_events").get()?.total;
  await repository.review(id, "accepted", steamId, "Accepted by the first reviewer.");
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM portal_audit_events").get()?.total, before, "identical retries do not create new audit records");
});
