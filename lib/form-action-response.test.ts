import assert from "node:assert/strict";
import test from "node:test";

import { formActionRedirect } from "./form-action-response.ts";

test("native VIP ticket redirects use SITE_URL behind the hosting proxy", (context) => {
  context.mock.property(process, "env", { ...process.env, SITE_URL: "https://tapped.ro" });
  const request = new Request("https://0.0.0.0:3000/api/tickets", { method: "POST" });
  const destination = new URL("/tickets?submitted=1#requests", request.url);
  const response = formActionRedirect(request, destination);

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://tapped.ro/tickets?submitted=1#requests");
  assert.equal(destination.origin, "https://0.0.0.0:3000");
});

test("enhanced forms receive the public redirect and preserve navigation options", async (context) => {
  context.mock.property(process, "env", { ...process.env, SITE_URL: "https://tapped.ro" });
  const request = new Request("http://0.0.0.0:3000/api/tickets", {
    method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  const response = formActionRedirect(request, "/tickets?submitted=1", { replace: true, refresh: true });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, redirect: "https://tapped.ro/tickets?submitted=1", replace: true, refresh: true,
  });
});

test("signed-out submissions return to the public Steam login route", (context) => {
  context.mock.property(process, "env", { ...process.env, SITE_URL: "https://tapped.ro" });
  const request = new Request("http://0.0.0.0:3000/api/tickets", {
    headers: { "x-forwarded-host": "untrusted.example", "x-forwarded-proto": "http" },
  });
  assert.equal(formActionRedirect(request, "/api/auth/steam").headers.get("location"),
    "https://tapped.ro/api/auth/steam");
});

test("local development falls back to its request origin without SITE_URL", (context) => {
  context.mock.property(process, "env", { ...process.env, SITE_URL: "" });
  const request = new Request("http://localhost:3000/api/tickets");
  assert.equal(formActionRedirect(request, "/tickets?error=validation").headers.get("location"),
    "http://localhost:3000/tickets?error=validation");
});
