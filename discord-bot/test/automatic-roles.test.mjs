import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutomaticRoleSync } from '../src/automatic-roles.mjs';

const snapshot = () => ({ groups: [{ id: '1', name: 'Admin', color: null, isAdmin: true, enabled: true }],
  members: [], roles: [], staffRoleId: null });
const member = { discordUserId: '444444444444444444', groupIds: ['1'] };

test('link, group update, expiry and unlink trigger automatic sync, unchanged snapshots do not', async () => {
  const calls = [], run = createAutomaticRoleSync({ sync: async data => calls.push(structuredClone(data)), now: () => 1000 });
  const data = snapshot();
  await run(data); await run(data); assert.equal(calls.length, 1);
  data.members.push(member); await run(data); assert.equal(calls.length, 2);
  data.groups[0].name = 'Moderator'; await run(data); assert.equal(calls.length, 3);
  data.members[0] = { ...member, groupIds: [] }; await run(data); assert.equal(calls.length, 4);
  data.members = []; await run(data); assert.equal(calls.length, 5);
});
test('periodic reconciliation and member joins repair Discord drift even without portal changes', async () => {
  let calls = 0, now = 0;
  const run = createAutomaticRoleSync({ sync: async () => { calls++; }, now: () => now });
  await run(snapshot()); now = 59_000; await run(snapshot()); assert.equal(calls, 1);
  now = 60_000; await run(snapshot()); assert.equal(calls, 2);
  run.invalidate(); await run(snapshot()); assert.equal(calls, 3);
});
test('failed sync is retried and invalid snapshots cannot trigger role writes', async () => {
  let calls = 0;
  const run = createAutomaticRoleSync({ sync: async () => { if (++calls === 1) throw new Error('Discord unavailable'); } });
  await assert.rejects(run(snapshot())); await run(snapshot()); assert.equal(calls, 2);
  await assert.rejects(run({ groups: [] })); assert.equal(calls, 2);
});

test('portal rank-only changes do not trigger role repositioning or extra syncs', async () => {
  let calls = 0;
  const run = createAutomaticRoleSync({ sync: async () => { calls++; } });
  const data = snapshot();
  await run(data); data.groups[0].rankWeight = 100; await run(data);
  assert.equal(calls, 1);
});
test('changes and invalidations arriving during an active sync are picked up on the next poll', async () => {
  let release, calls = 0;
  const run = createAutomaticRoleSync({ sync: async () => { calls++; await new Promise(resolve => { release = resolve; }); } });
  const data = snapshot(), first = run(data);
  run.invalidate(); await run(data); assert.equal(calls, 1);
  release(); await first;
  const second = run(data); assert.equal(calls, 2); release(); await second;
});
