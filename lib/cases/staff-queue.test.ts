import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { caseQueueWhere, normalizeCaseFilter } from "./staff-queue.ts";

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE portal_tickets (id INTEGER, steam_id TEXT, subject TEXT, body TEXT, status TEXT);
  CREATE TABLE portal_ban_appeals (id INTEGER, steam_id TEXT, body TEXT, status TEXT);
  CREATE TABLE portal_ticket_messages (ticket_id INTEGER, author_type TEXT);
  CREATE TABLE portal_appeal_messages (appeal_id INTEGER, author_type TEXT);
  INSERT INTO portal_tickets VALUES (1,'76561198000000001','Account help','Need help','open'),(2,'76561198000000002','Report','Evidence','open'),(3,'76561198000000003','Resolved','Resolved','solved'),(4,'76561198000000004','Unresolved','Pending','unsolved'),(5,'76561198000000005','Legacy','Closed','closed');
  ALTER TABLE portal_tickets ADD COLUMN category TEXT DEFAULT 'other';
  INSERT INTO portal_ticket_messages VALUES (1,'player'),(2,'staff'),(3,'staff');
  INSERT INTO portal_ban_appeals VALUES (1,'76561198000000001','Ban review','submitted'),(2,'76561198000000002','Ban review','reviewing'),(3,'76561198000000003','Ban upheld','closed-banned'),(4,'76561198000000004','Ban removed','closed-unbanned'),(5,'76561198000000005','Legacy','closed');
  INSERT INTO portal_appeal_messages VALUES (1,'player'),(2,'staff'),(3,'staff');`);
test.after(() => db.close());

function ids(kind: "appeal" | "ticket", filter: string, query = "") {
  const { where, values } = caseQueueWhere(kind, { filter, query });
  const table = kind === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  return db.prepare(`SELECT c.id FROM ${table} c ${where} ORDER BY c.id`).all(...values).map((row) => row.id);
}

test("ticket resolution filters distinguish solved, unsolved, legacy closed and open cases", () => {
  assert.deepEqual(ids("ticket", "open"), [1, 2]);
  assert.deepEqual(ids("ticket", "closed"), [3, 4, 5]);
  assert.deepEqual(ids("ticket", "solved"), [3]);
  assert.deepEqual(ids("ticket", "unsolved"), [4]);
});

test("appeal decision filters distinguish banned and unbanned outcomes", () => {
  assert.deepEqual(ids("appeal", "open"), [1, 2]);
  assert.deepEqual(ids("appeal", "closed"), [3, 4, 5]);
  assert.deepEqual(ids("appeal", "banned"), [3]);
  assert.deepEqual(ids("appeal", "unbanned"), [4]);
});

test("reply filters count staff responses, excluding original player messages and closed conversations", () => {
  for (const kind of ["ticket", "appeal"] as const) {
    assert.deepEqual(ids(kind, "no-reply"), [1, 4, 5]);
    assert.deepEqual(ids(kind, "replied-open"), [2]);
  }
});

test("search and filters compose before pagination and bind untrusted input", () => {
  assert.deepEqual(ids("ticket", "open", "Account"), [1]);
  assert.deepEqual(ids("appeal", "closed", "76561198000000004"), [4]);
  assert.deepEqual(ids("ticket", "all", "' OR 1=1 --"), []);
  assert.equal(normalizeCaseFilter("ticket", "unbanned"), "all");
  assert.equal(normalizeCaseFilter("appeal", "solved"), "all");
});
