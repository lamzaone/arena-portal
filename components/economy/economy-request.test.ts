import assert from "node:assert/strict";
import { test } from "node:test";
import { postEconomyAction } from "./economy-request.ts";

test("identical purchases share one request through flight and a 500ms minimum lock", async t => {
  let calls = 0;
  let finish!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const start = performance.now();
  const first = postEconomyAction("/api/economy/purchase", "csrf", { catalogueId: 1 }, "first");
  const second = postEconomyAction("/api/economy/purchase", "csrf", { catalogueId: 1 }, "second");
  assert.equal(calls, 1, "rapid clicks must not send a second purchase with a new key");
  finish(Response.json({ ok: true, itemId: "one" }));
  assert.deepEqual(await first, await second);
  assert.ok(performance.now() - start >= 480, "busy UI must cover the minimum cooldown");
});

test("different items remain independent and a failed request is never retried automatically", async t => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_path: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: false, message: "Insufficient Tokens" }, { status: 409 });
  });
  const results = await Promise.allSettled([
    postEconomyAction("/api/economy/purchase", "csrf", { catalogueId: 2 }, "key-two"),
    postEconomyAction("/api/economy/purchase", "csrf", { catalogueId: 3 }, "key-three"),
  ]);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies.map(body => body.idempotencyKey), ["key-two", "key-three"]);
  assert.ok(results.every(result => result.status === "rejected" && /Insufficient Tokens/.test(result.reason.message)));
});
