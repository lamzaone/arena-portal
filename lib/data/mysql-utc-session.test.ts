import assert from "node:assert/strict";
import test from "node:test";

import {
  installMysqlUtcSessionInitializer,
  MYSQL_UTC_CLIENT_TIMEZONE,
  MYSQL_UTC_SESSION_SQL,
} from "./mysql-utc-session.ts";

type ConnectionListener = (connection: {
  query(sql: string, callback: (error: Error | null) => void): void;
  destroy(): void;
}) => void;

function installedListener() {
  let listener: ConnectionListener | null = null;
  installMysqlUtcSessionInitializer({
    on(event, registered) {
      assert.equal(event, "connection");
      listener = registered;
    },
  });
  assert.ok(listener);
  return listener as ConnectionListener;
}

test("mysql UTC configuration uses client and server UTC semantics", () => {
  assert.equal(MYSQL_UTC_CLIENT_TIMEZONE, "Z");
  assert.equal(MYSQL_UTC_SESSION_SQL, "SET SESSION time_zone = '+00:00'");
});

test("a new pooled connection queues UTC session initialization", () => {
  const listener = installedListener();
  const queries: string[] = [];
  let destroyed = false;

  listener({
    query(sql, callback) {
      queries.push(sql);
      callback(null);
    },
    destroy() {
      destroyed = true;
    },
  });

  assert.deepEqual(queries, [MYSQL_UTC_SESSION_SQL]);
  assert.equal(destroyed, false);
});

test("a connection is destroyed when UTC session initialization fails", () => {
  const listener = installedListener();
  let destroyed = false;

  listener({
    query(_sql, callback) {
      callback(new Error("server rejected session time zone"));
    },
    destroy() {
      destroyed = true;
    },
  });

  assert.equal(destroyed, true);
});
