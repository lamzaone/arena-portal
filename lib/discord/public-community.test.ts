import assert from "node:assert/strict";
import test from "node:test";

import { createPublicCommunityReader, parsePublicCommunity } from "./public-community.ts";

const invite = {
  guild: { name: "TAPPED.RO" },
  approximate_member_count: 312,
  approximate_presence_count: 28,
};

test("reads only public aggregate Discord counts and labels them as approximate", () => {
  assert.deepEqual(parsePublicCommunity(invite, 1_000), {
    state: "available", name: "TAPPED.RO", members: 312, online: 28,
    checkedAt: "1970-01-01T00:00:01.000Z",
  });
  assert.equal(parsePublicCommunity({ ...invite, approximate_presence_count: 0 }, 1_000)?.online, 0);
  for (const payload of [null, {}, { ...invite, approximate_member_count: -1 },
    { ...invite, approximate_presence_count: "28" }, { ...invite, approximate_presence_count: 313 },
    { ...invite, approximate_member_count: 3.5 }]) {
    assert.equal(parsePublicCommunity(payload, 1_000), null);
  }
});

test("deduplicates requests, caches success, and refreshes expired counts", async () => {
  let now = 1_000;
  let requests = 0;
  const reader = createPublicCommunityReader({
    now: () => now,
    fetch: async (input, init) => {
      requests += 1;
      assert.equal(String(input), "https://discord.com/api/v10/invites/eEkXZpSzrD?with_counts=true");
      assert.ok(init?.signal instanceof AbortSignal);
      return Response.json(invite);
    },
  });
  const [first, second] = await Promise.all([reader(), reader()]);
  assert.deepEqual(first, second);
  assert.equal(requests, 1);
  now += 299_999;
  await reader();
  assert.equal(requests, 1);
  now += 1;
  await reader();
  assert.equal(requests, 2);
});

test("falls back to unavailable rather than inventing counts and briefly caches failures", async () => {
  let now = 1_000;
  let requests = 0;
  const reader = createPublicCommunityReader({
    now: () => now,
    fetch: async () => { requests += 1; throw new Error("Discord unavailable"); },
  });
  const result = await reader();
  assert.equal(result.state, "unavailable");
  assert.equal(result.members, null);
  assert.equal(result.online, null);
  await reader();
  assert.equal(requests, 1);
  now += 30_000;
  await reader();
  assert.equal(requests, 2);
});

test("rejects rate-limited and malformed Discord responses without exposing response details", async () => {
  for (const response of [new Response("rate limited", { status: 429 }), Response.json({ members: 500 }), new Response("not json")]) {
    const reader = createPublicCommunityReader({ fetch: async () => response });
    const result = await reader();
    assert.equal(result.state, "unavailable");
    assert.equal(result.members, null);
  }
});
