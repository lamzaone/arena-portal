import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route.ts";

test("health check returns an uncached success response without external dependencies", async () => {
  const response = await GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});
