import assert from "node:assert/strict";
import test from "node:test";

import { shouldAcceptHeartbeat } from "./repository.ts";

const current = {
  sessionId: "223e4567-e89b-42d3-a456-426614174000",
  sessionStartedAt: "2026-09-05T11:00:00.000Z",
  sequence: 7,
  capturedAt: "2026-09-05T11:59:55.000Z",
};

test("a same-session heartbeat needs both a higher sequence and newer capture", () => {
  assert.equal(shouldAcceptHeartbeat(current, { ...current, sequence: 8, capturedAt: "2026-09-05T11:59:56.000Z" }), true);
  assert.equal(shouldAcceptHeartbeat(current, { ...current, sequence: 7, capturedAt: "2026-09-05T11:59:56.000Z" }), false);
  assert.equal(shouldAcceptHeartbeat(current, { ...current, sequence: 8 }), false);
});

test("an earlier session cannot overwrite a newer session regardless of sequence", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    sessionId: "323e4567-e89b-42d3-a456-426614174000",
    sessionStartedAt: "2026-09-05T10:00:00.000Z",
    sequence: 999,
    capturedAt: "2026-09-05T11:59:56.000Z",
  }), false);
});

test("a new session cannot replace a snapshot with an older capture", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    sessionId: "323e4567-e89b-42d3-a456-426614174000",
    sessionStartedAt: "2026-09-05T11:30:00.000Z",
    sequence: 0,
    capturedAt: "2026-09-05T11:59:54.000Z",
  }), false);
});

test("a genuinely newer session and capture are accepted", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    sessionId: "323e4567-e89b-42d3-a456-426614174000",
    sessionStartedAt: "2026-09-05T11:30:00.000Z",
    sequence: 0,
    capturedAt: "2026-09-05T11:59:56.000Z",
  }), true);
});

test("a session identifier cannot silently change its start time", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    ...current,
    sessionStartedAt: "2026-09-05T11:30:00.000Z",
    sequence: 8,
    capturedAt: "2026-09-05T11:59:56.000Z",
  }), false);
});
