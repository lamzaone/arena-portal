import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { commandDefinitions, registerCommands, createCommandHandler } from '../src/commands.mjs';
import { createRoleSync } from '../src/scheduler.mjs';

const userId = '444444444444444444', guildId = '111111111111111111';
const config = { guildId, portalUrl: 'https://arena.example' };
const snapshot = () => ({ groups: [{ id: '1', name: 'Admin', isAdmin: true, enabled: true, color: null }],
  members: [{ discordUserId: userId, steamId: '76561198000000001', groupIds: ['1'] }], roles: [] });
function interaction(name, overrides = {}) {
  const replies = [];
  return { commandName: name, guildId, user: { id: userId }, isChatInputCommand: () => true,
    memberPermissions: { has: () => false }, replies,
    deferReply: async value => replies.push(value), editReply: async value => replies.push(value), ...overrides };
}
function handler(overrides = {}) {
  return createCommandHandler({ config, portal: { snapshot: async () => snapshot() }, sync: async () => ({ added: 1, removed: 0, linked: true }), ...overrides });
}

test('registers all five commands by upsert and preserves unrelated commands', async () => {
  const calls = [];
  await registerCommands({ rest: { post: async (path, body) => calls.push({ path, body }) }, applicationId: '123', guildId });
  assert.deepEqual(calls.map(call => call.body.body.name), ['help', 'link', 'account', 'sync', 'sync-all']);
  assert.ok(calls.every(call => call.path === `/applications/123/guilds/${guildId}/commands`));
  assert.equal(commandDefinitions.length, 5);
});
test('help is ephemeral and unsupported commands are ignored', async () => {
  const run = handler(), help = interaction('help'), other = interaction('other');
  await run(help); await run(other);
  assert.equal(help.replies[0].flags, MessageFlags.Ephemeral);
  assert.match(help.replies[1].content, /\/sync-all/);
  assert.equal(other.replies.length, 0);
});
test('wrong guild cannot query account or mutate roles', async () => {
  let calls = 0;
  const run = handler({ portal: { snapshot: async () => { calls++; return snapshot(); } }, sync: async () => { calls++; } });
  const input = interaction('sync-all', { guildId: 'other' });
  await run(input);
  assert.equal(calls, 0);
  assert.match(input.replies[1].content, /ARENA Discord server/);
});
test('account shows only the caller identity and effective groups with mentions disabled', async () => {
  const input = interaction('account'); await handler()(input);
  assert.match(input.replies[1].content, /76561198000000001/);
  assert.match(input.replies[1].content, /Admin/);
  assert.deepEqual(input.replies[1].allowedMentions, { parse: [] });
});
test('unlinked account is told to use link', async () => {
  const input = interaction('account');
  await handler({ portal: { snapshot: async () => ({ ...snapshot(), members: [] }) } })(input);
  assert.match(input.replies[1].content, /not linked.*\/link/s);
});
test('sync targets only the caller and repeated requests are throttled', async () => {
  const calls = [], run = handler({ sync: async target => { calls.push(target); return { added: 1, removed: 0, linked: true }; } });
  const first = interaction('sync'), second = interaction('sync');
  await run(first); await run(second);
  assert.deepEqual(calls, [userId]);
  assert.match(first.replies[1].content, /1.*added/);
  assert.match(second.replies[1].content, /wait/i);
});
test('sync-all rejects non-admins and disabled groups, but accepts effective portal admins', async () => {
  for (const mode of ['unlinked', 'disabled', 'admin']) {
    let calls = 0;
    const data = snapshot();
    if (mode === 'unlinked') data.members = [];
    if (mode === 'disabled') data.groups[0].enabled = false;
    const input = interaction('sync-all');
    await handler({ portal: { snapshot: async () => data }, sync: async target => { assert.equal(target, undefined); calls++; return { added: 0, removed: 0 }; } })(input);
    assert.equal(calls, mode === 'admin' ? 1 : 0);
  }
});
test('Discord administrator can recover sync without a portal link', async () => {
  let calls = 0;
  const input = interaction('sync-all', { memberPermissions: { has: bit => bit === PermissionFlagsBits.Administrator } });
  await handler({ portal: { snapshot: async () => { throw new Error('not needed for authorization'); } }, sync: async () => { calls++; return { added: 0, removed: 0 }; } })(input);
  assert.equal(calls, 1);
});
test('portal failure fails closed without leaking private errors', async () => {
  const input = interaction('sync-all');
  await handler({ portal: { snapshot: async () => { throw new Error('secret-token'); } }, sync: async () => assert.fail('unauthorized sync') })(input);
  assert.match(input.replies[1].content, /unavailable/i);
  assert.ok(!input.replies[1].content.includes('secret-token'));
});
test('scheduled and manual role sync cannot overlap and recover after a rejection', async () => {
  let release;
  const sync = createRoleSync(async target => { await new Promise(resolve => { release = resolve; }); return target; });
  const first = sync(userId);
  await assert.rejects(sync(), /already running/);
  release(); assert.equal(await first, userId);
  const second = sync(); release(); await second;
});
