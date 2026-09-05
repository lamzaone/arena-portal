import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { StoredHeartbeat } from "./repository.ts";

type ServerStatusTestGlobal = typeof globalThis & {
  __serverStatusRead?: (serverId: string) => Promise<StoredHeartbeat | null>;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    if (specifier === "./server-link/repository") {
      return {
        url: "data:text/javascript,export function getStoredHeartbeat(serverId){return globalThis.__serverStatusRead(serverId)}",
        shortCircuit: true,
      };
    }
    if (specifier === "./server-link/protocol") {
      return nextResolve("./server-link/protocol.ts", context);
    }
    return nextResolve(specifier, context);
  },
});

test("server status evaluates freshness after the database read completes", async () => {
  const originalNow = Date.now;
  const originalServerId = process.env.GAME_SERVER_GUID;
  let now = Date.parse("2026-09-05T12:00:44.000Z");
  const stored: StoredHeartbeat = {
    heartbeat: {
      version: 1,
      serverId: "123e4567-e89b-42d3-a456-426614174000",
      sessionId: "223e4567-e89b-42d3-a456-426614174000",
      sessionStartedAt: "2026-09-05T11:00:00.000Z",
      sequence: 7,
      capturedAt: "2026-09-05T11:59:55.000Z",
      map: "de_mirage",
      maxPlayers: 12,
      players: 1,
      bots: 0,
      roster: [{ steamId: "76561198000000001", name: "Ada" }],
    },
    receivedAt: "2026-09-05T12:00:00.000Z",
  };

  try {
    Date.now = () => now;
    process.env.GAME_SERVER_GUID = stored.heartbeat.serverId;
    (globalThis as ServerStatusTestGlobal).__serverStatusRead = async () => {
      now += 2_000;
      return stored;
    };
    const { getServerStatus } = await import("../server-status.ts");

    const status = await getServerStatus();

    assert.equal(status.state, "lost");
    assert.deepEqual(status.roster, []);
    assert.equal(status.checkedAt, "2026-09-05T12:00:46.000Z");
  } finally {
    Date.now = originalNow;
    if (originalServerId === undefined) delete process.env.GAME_SERVER_GUID;
    else process.env.GAME_SERVER_GUID = originalServerId;
    delete (globalThis as ServerStatusTestGlobal).__serverStatusRead;
  }
});
