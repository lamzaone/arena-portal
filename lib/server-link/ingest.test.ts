import assert from "node:assert/strict";
import test from "node:test";

import { handleHeartbeat } from "./ingest.ts";
import type { Heartbeat } from "./protocol.ts";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const SERVER_ID = "123e4567-e89b-42d3-a456-426614174000";
const SECRET = "server-link-test-secret-with-sufficient-entropy";

const heartbeat: Heartbeat = {
  version: 1,
  serverId: SERVER_ID,
  sessionId: "223e4567-e89b-42d3-a456-426614174000",
  sessionStartedAt: "2026-09-05T11:00:00.000Z",
  sequence: 7,
  capturedAt: "2026-09-05T11:59:55.000Z",
  map: "de_mirage",
  maxPlayers: 12,
  players: 1,
  bots: 0,
  roster: [{ steamId: "76561198000000001", name: "Ada" }],
};

function request(body: BodyInit, token = SECRET, extra: RequestInit = {}) {
  return new Request("https://arena.example/api/server-link/heartbeat", {
    method: "POST",
    body,
    headers: { authorization: `Bearer ${token}`, ...extra.headers },
    ...extra,
  });
}

function dependencies(save: (value: Heartbeat) => Promise<boolean>) {
  return { secret: SECRET, serverId: SERVER_ID, save, now: NOW };
}

test("unauthorized ingestion never calls save even when the body is invalid", async () => {
  let saved = false;
  const response = await handleHeartbeat(
    request("not valid JSON", "wrong-secret"),
    dependencies(async () => {
      saved = true;
      return true;
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(saved, false);
});

test("an oversized streamed payload is rejected before JSON parsing or save", async () => {
  let saved = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(40_000));
      controller.enqueue(new Uint8Array(25_537));
      controller.close();
    },
  });
  const response = await handleHeartbeat(
    request(body, SECRET, { duplex: "half" } as RequestInit),
    dependencies(async () => {
      saved = true;
      return true;
    }),
  );
  assert.equal(response.status, 413);
  assert.equal(saved, false);
});

test("a stalled body is rejected at the five-second deadline even if source cancellation stalls", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const body = new ReadableStream<Uint8Array>({
    pull() {
      return new Promise<void>(() => undefined);
    },
    cancel() {
      return new Promise<void>(() => undefined);
    },
  });
  const incoming = request(body, SECRET, { duplex: "half" } as RequestInit);
  const pending = handleHeartbeat(incoming, dependencies(async () => true));
  while (!incoming.bodyUsed) await new Promise((resolve) => setImmediate(resolve));
  context.mock.timers.tick(5_000);
  const response = await pending;
  assert.equal(response.status, 408);
});

test("a valid heartbeat is normalized and saved", async () => {
  const saved: Heartbeat[] = [];
  const response = await handleHeartbeat(
    request(JSON.stringify({ ...heartbeat, serverId: SERVER_ID.toUpperCase() })),
    dependencies(async (value) => {
      saved.push(value);
      return true;
    }),
  );
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(saved[0]?.serverId, SERVER_ID);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a rejected old or duplicate heartbeat does not report a freshness update", async () => {
  const response = await handleHeartbeat(
    request(JSON.stringify(heartbeat)),
    dependencies(async () => false),
  );
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: false });
});

test("invalid payloads and storage failures return safe errors", async () => {
  const invalid = await handleHeartbeat(
    request(JSON.stringify({ ...heartbeat, players: 2 })),
    dependencies(async () => true),
  );
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "Invalid heartbeat." });

  const failed = await handleHeartbeat(
    request(JSON.stringify(heartbeat)),
    dependencies(async () => {
      throw new Error("mysql://user:password@host/private");
    }),
  );
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.clone().json(), { error: "Heartbeat storage unavailable." });
  assert.equal((await failed.text()).includes("password"), false);
});

test("missing server configuration fails closed without reading the body", async () => {
  let saved = false;
  const response = await handleHeartbeat(request(JSON.stringify(heartbeat)), {
    secret: undefined,
    serverId: undefined,
    save: async () => {
      saved = true;
      return true;
    },
    now: NOW,
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Heartbeat ingestion unavailable." });
  assert.equal(saved, false);
});
