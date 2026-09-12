import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.mjs';
import { createPortalClient, PortalError } from '../src/portal-client.mjs';
import { reconcileRoles } from '../src/roles.mjs';
import { buildNotification, deliverNotifications, resolveAdminRoles } from '../src/notifications.mjs';
import { handleLink } from '../src/link.mjs';

const guildId = '111111111111111111';
const roleId = '222222222222222222';
const extraId = '333333333333333333';
const userId = '444444444444444444';
const config = { portalUrl: 'https://arena.example', guildId, adminRoleIds: [], secret: 'x'.repeat(32), timeoutMs: 1000 };
const group = { id: 'admin', name: 'Admin', color: '#ff8800', enabled: true, isAdmin: true };
const snapshot = () => ({ groups: [{ ...group }], roles: [{ groupId: 'admin', discordRoleId: roleId }], members: [{ discordUserId: userId, groupIds: ['admin'] }] });

function fakeGuild({ members = [{ id: userId, roles: [extraId] }], roles = [{ id: roleId }] } = {}) {
  const actions = [];
  const roleMap = new Map(roles.map(data => {
    const role = { name: 'Admin', color: 0xff8800, permissions: { bitfield: 0n }, hoist: true, mentionable: true, editable: true, managed: false, ...data };
    role.edit = async options => { actions.push(['edit', role.id, options]); Object.assign(role, options); return role; };
    role.delete = async () => { actions.push(['delete', role.id]); roleMap.delete(role.id); };
    return [role.id, role];
  }));
  const memberMap = new Map(members.map(data => {
    const cache = new Map(data.roles.map(id => [id, roleMap.get(id) ?? { id }]));
    return [data.id, { id: data.id, user: { bot: false }, roles: { cache,
      add: async id => { actions.push(['add', data.id, id]); cache.set(id, roleMap.get(id)); },
      remove: async id => { actions.push(['remove', data.id, id]); cache.delete(id); }
    } }];
  }));
  return { id: guildId, actions, roles: { cache: roleMap, fetch: async () => roleMap,
    create: async options => {
      actions.push(['create', options]);
      const role = { id: '555555555555555555', editable: true, managed: false, ...options, delete: async () => actions.push(['delete', '555555555555555555']) };
      roleMap.set(role.id, role);
      return role;
    }
  }, members: { cache: memberMap, fetch: async options => options?.user ? memberMap.get(options.user) : memberMap } };
}

test('self sync does not change any other member and AdminCore roles are hoisted', async () => {
  const other = '666666666666666666';
  const guild = fakeGuild({ roles: [{ id: roleId, hoist: false }], members: [{ id: userId, roles: [] }, { id: other, roles: [roleId] }] });
  const result = await reconcileRoles({ guild, portal: { snapshot: async () => snapshot() }, userId });
  assert.equal(result.linked, true);
  assert.equal(guild.members.cache.get(other).roles.cache.has(roleId), true);
  assert.equal(guild.actions.find(action => action[0] === 'edit')[2].hoist, true);
});

test('managed roles follow portal rank within their existing slots', async () => {
  const guild = fakeGuild({ roles: [{ id: roleId, position: 2 }, { id: extraId, position: 5 }] });
  const data = snapshot(); data.groups[0].rankWeight = 100;
  data.groups.push({ ...group, id: 'helper', rankWeight: 10 });
  data.roles.push({ groupId: 'helper', discordRoleId: extraId });
  guild.roles.setPositions = async values => guild.actions.push(['positions', values]);
  await reconcileRoles({ guild, portal: { snapshot: async () => data } });
  assert.deepEqual(guild.actions.find(action => action[0] === 'positions')[1], [
    { role: extraId, position: 2 }, { role: roleId, position: 5 },
  ]);
});

test('Staff is assigned only to active admins while VIP/custom groups and configured permissions are preserved', async () => {
  const staffId = '777777777777777777', vipId = '888888888888888888', customId = '999999999999999999';
  const other = '666666666666666666';
  const guild = fakeGuild({ roles: [{ id: roleId, name: 'outdated', permissions: { bitfield: 8n } },
    { id: staffId, name: 'Staff', permissions: { bitfield: 32n } }, { id: vipId }, { id: customId }],
    members: [{ id: userId, roles: [] }, { id: other, roles: [staffId] }] });
  const data = snapshot(); data.staffRoleId = staffId;
  data.groups.push({ ...group, id: 'vip', isAdmin: false }, { ...group, id: 'custom', isAdmin: false });
  data.roles.push({ groupId: 'vip', discordRoleId: vipId }, { groupId: 'custom', discordRoleId: customId });
  data.members.push({ discordUserId: other, groupIds: ['vip', 'custom'] });
  await reconcileRoles({ guild, portal: { snapshot: async () => data } });
  assert.equal(guild.members.cache.get(userId).roles.cache.has(staffId), true);
  assert.equal(guild.members.cache.get(other).roles.cache.has(staffId), false);
  assert.equal(guild.members.cache.get(other).roles.cache.has(vipId), true);
  assert.equal(guild.members.cache.get(other).roles.cache.has(customId), true);
  assert.equal(guild.roles.cache.get(roleId).permissions.bitfield, 8n);
  assert.equal(guild.roles.cache.get(staffId).permissions.bitfield, 32n);
  assert.ok(guild.actions.filter(action => action[0] === 'edit').every(action => !('permissions' in action[2])));
});

test('new Staff role is saved before assignment and never adopts a same-name role', async () => {
  const guild = fakeGuild({ roles: [{ id: roleId }, { id: extraId, name: 'Staff' }] });
  const data = snapshot(); data.staffRoleId = null;
  await reconcileRoles({ guild, portal: { snapshot: async () => data, saveRole: async (...args) => guild.actions.push(['save', ...args]) } });
  const create = guild.actions.find(action => action[0] === 'create');
  assert.equal(create[1].name, 'Staff'); assert.equal(create[1].permissions, 0n);
  const save = guild.actions.findIndex(action => action[0] === 'save' && action[1] === 'staff');
  assert.ok(save >= 0);
  assert.ok(guild.actions.findIndex(action => action[0] === 'add' && action[2] === '555555555555555555') > save);
});

test('Staff persistence failure rolls back the new role before membership changes', async () => {
  const guild = fakeGuild(); const data = snapshot(); data.staffRoleId = null;
  await assert.rejects(reconcileRoles({ guild, portal: { snapshot: async () => data,
    saveRole: async () => { throw new Error('database offline'); } } }));
  assert.deepEqual(guild.actions.map(action => action[0]), ['create', 'delete']);
});

test('disabled admin membership removes Staff even while a VIP membership remains', async () => {
  const staffId = '777777777777777777';
  const guild = fakeGuild({ roles: [{ id: roleId }, { id: staffId, name: 'Staff' }, { id: extraId }],
    members: [{ id: userId, roles: [roleId, staffId, extraId] }] });
  const data = snapshot(); data.groups[0].enabled = false; data.staffRoleId = staffId;
  data.groups.push({ ...group, id: 'vip', isAdmin: false });
  data.roles.push({ groupId: 'vip', discordRoleId: extraId }); data.members[0].groupIds.push('vip');
  await reconcileRoles({ guild, portal: { snapshot: async () => data } });
  assert.deepEqual([...guild.members.cache.get(userId).roles.cache.keys()], [extraId]);
});

test('shutdown after fetching role positions cannot reorder or assign roles', async () => {
  const controller = new AbortController();
  const guild = fakeGuild({ roles: [{ id: roleId, position: 2 }, { id: extraId, position: 5 }] });
  const data = snapshot(); data.groups[0].rankWeight = 100;
  data.groups.push({ ...group, id: 'helper', rankWeight: 10 });
  data.roles.push({ groupId: 'helper', discordRoleId: extraId });
  let fetches = 0;
  guild.roles.fetch = async () => { if (++fetches === 2) controller.abort(); return guild.roles.cache; };
  guild.roles.setPositions = async () => assert.fail('reordered during shutdown');
  await assert.rejects(reconcileRoles({ guild, portal: { snapshot: async () => data }, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(guild.actions.length, 0);
});

test('configuration rejects insecure remote HTTP and malformed IDs without exposing secrets', () => {
  const env = { DISCORD_BOT_TOKEN: 'private-token', DISCORD_BRIDGE_SECRET: 'x'.repeat(32), DISCORD_GUILD_ID: guildId, DISCORD_STAFF_CHANNEL_ID: extraId, PORTAL_URL: 'https://arena.example/' };
  assert.equal(readConfig(env).portalUrl, 'https://arena.example');
  assert.throws(() => readConfig({ ...env, PORTAL_URL: 'http://remote.example' }), /PORTAL_URL/);
  assert.throws(() => readConfig({ ...env, DISCORD_ADMIN_ROLE_IDS: 'bad' }), /DISCORD_ADMIN_ROLE_IDS/);
  assert.throws(() => readConfig({ ...env, DISCORD_BRIDGE_SECRET: 'private-token' }), error => !error.message.includes('private-token'));
});

test('portal requests authenticate, refuse redirects, and redact upstream errors', async () => {
  let request;
  const portal = createPortalClient(config, async (url, options) => { request = { url, options }; return new Response(JSON.stringify(snapshot()), { headers: { 'content-type': 'application/json' } }); });
  assert.deepEqual(await portal.snapshot(), snapshot());
  assert.equal(request.url, 'https://arena.example/api/discord/bot/snapshot');
  assert.equal(request.options.headers.Authorization, `Bearer ${config.secret}`);
  assert.equal(request.options.redirect, 'error');
  const failed = createPortalClient(config, async () => new Response('private-token', { status: 500 }));
  await assert.rejects(failed.snapshot(), error => error instanceof PortalError && !error.message.includes('private-token'));
});

test('portal client accepts dotted event types and sends compare-and-swap role mappings', async () => {
  const requests = [];
  const data = { events: [{ id: '12', leaseToken: 'a'.repeat(64), eventType: 'ticket.created', title: 'Ticket', body: 'Help', url: 'https://arena.example/admin/tickets', steamId: null }] };
  const portal = createPortalClient(config, async (url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json(url.endsWith('/notifications') ? data : { ok: true });
  });
  assert.deepEqual(await portal.claimNotifications(), data);
  await portal.saveRole('12', extraId, roleId);
  assert.deepEqual(requests, [{ action: 'claim' }, { groupId: '12', discordRoleId: extraId, previousRoleId: roleId }]);
});

test('failed completion acknowledgement leaves the lease untouched for recovery', async () => {
  const settlements = [];
  await assert.rejects(deliverNotifications({ portal: {
    claimNotifications: async () => ({ events: [event] }),
    finishNotification: async value => { settlements.push(value); throw new Error('response lost'); }
  }, channel: { send: async () => ({ id: extraId }) }, adminRoleIds: [roleId], portalUrl: config.portalUrl }));
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].action, 'complete');
});

test('role reconciliation adds effective roles and removes stale/expired roles while preserving unrelated roles', async () => {
  const staleId = '666666666666666666';
  const guild = fakeGuild({ members: [{ id: userId, roles: [extraId] }, { id: staleId, roles: [roleId, extraId] }] });
  await reconcileRoles({ guild, portal: { snapshot: async () => snapshot() } });
  assert.deepEqual(guild.actions, [['add', userId, roleId], ['remove', staleId, roleId]]);
  assert.equal(guild.members.cache.get(staleId).roles.cache.has(extraId), true);
  const disabled = snapshot(); disabled.groups[0].enabled = false;
  await reconcileRoles({ guild, portal: { snapshot: async () => disabled } });
  assert.equal(guild.members.cache.get(userId).roles.cache.has(roleId), false);
});

test('same-name roles are never adopted and mapping is persisted before role assignment', async () => {
  const guild = fakeGuild({ roles: [{ id: extraId }] });
  const data = snapshot(); data.roles = [];
  const portal = { snapshot: async () => data, saveRole: async (groupId, id) => guild.actions.push(['save', groupId, id]) };
  await reconcileRoles({ guild, portal });
  assert.equal(guild.actions[0][0], 'create');
  assert.equal(guild.actions[0][1].permissions, 0n);
  assert.equal(guild.actions[0][1].mentionable, true);
  assert.deepEqual(guild.actions.slice(1), [['save', 'admin', '555555555555555555'], ['add', userId, '555555555555555555']]);
});

test('snapshot failures and malformed members never remove roles', async () => {
  const guild = fakeGuild({ members: [{ id: userId, roles: [roleId] }] });
  await assert.rejects(reconcileRoles({ guild, portal: { snapshot: async () => { throw new Error('unavailable'); } } }));
  const data = snapshot(); delete data.members;
  await assert.rejects(reconcileRoles({ guild, portal: { snapshot: async () => data } }));
  assert.deepEqual(guild.actions, []);
});

test('unsafe mapped roles abort before any Discord mutation', async () => {
  for (const role of [{ id: roleId, managed: true }, { id: roleId, editable: false }]) {
    const guild = fakeGuild({ roles: [role] });
    await assert.rejects(reconcileRoles({ guild, portal: { snapshot: async () => snapshot() } }));
    assert.deepEqual(guild.actions, []);
  }
});

test('failed mapping persistence rolls back newly created role without assigning it', async () => {
  const guild = fakeGuild({ roles: [] });
  const data = snapshot(); data.roles = [];
  await assert.rejects(reconcileRoles({ guild, portal: { snapshot: async () => data, saveRole: async () => { throw new Error('offline'); } } }));
  assert.deepEqual(guild.actions.map(action => action[0]), ['create', 'delete']);
});

const event = { id: 'notification-123', leaseToken: 'lease', eventType: 'report', title: 'Reported @everyone', body: '@everyone <@123456789012345678> ' + 'x'.repeat(6000), url: 'javascript:alert(1)', steamId: '76561198000000000' };

test('notifications bound text, reject foreign/unsafe links, restrict mentions and use stable nonce', () => {
  const message = buildNotification(event, [roleId], config.portalUrl);
  assert.deepEqual(message.allowedMentions, { parse: [], roles: [roleId], users: [], repliedUser: false });
  assert.equal(message.content, `<@&${roleId}>`);
  assert.ok(message.embeds[0].description.length <= 4096);
  assert.equal(message.embeds[0].url, undefined);
  assert.equal(buildNotification({ ...event, url: 'https://evil.example' }, [roleId], config.portalUrl).embeds[0].url, undefined);
  assert.equal(message.enforceNonce, true);
  assert.ok(message.nonce.length <= 25);
  assert.equal(message.nonce, buildNotification(event, [roleId], config.portalUrl).nonce);
});

test('all admin mappings plus fallback roles are required before claiming notifications', () => {
  const data = snapshot(); data.groups.push({ ...group, id: 'owner' });
  const roles = new Map([[roleId, { id: roleId, mentionable: true }], [extraId, { id: extraId, mentionable: true }]]);
  assert.throws(() => resolveAdminRoles(data, roles, [extraId], false, guildId));
  data.roles.push({ groupId: 'owner', discordRoleId: extraId });
  assert.deepEqual(resolveAdminRoles(data, roles, [extraId], false, guildId), [roleId, extraId]);
  assert.throws(() => resolveAdminRoles({ groups: [], roles: [], members: [] }, roles, [], false, guildId));
});

test('delivery acknowledges only after successful send and retries failure with lease', async () => {
  const actions = [];
  const portal = { claimNotifications: async () => ({ events: [event] }), finishNotification: async payload => actions.push(payload) };
  await deliverNotifications({ portal, channel: { send: async () => { actions.push('send'); return { id: extraId }; } }, adminRoleIds: [roleId], portalUrl: config.portalUrl });
  assert.deepEqual(actions, ['send', { action: 'complete', id: event.id, leaseToken: 'lease', messageId: extraId }]);
  actions.length = 0;
  await deliverNotifications({ portal, channel: { send: async () => { throw new Error('private-token'); } }, adminRoleIds: [roleId], portalUrl: config.portalUrl });
  assert.equal(actions[0].action, 'retry');
  assert.equal(actions[0].leaseToken, 'lease');
  assert.ok(!actions[0].error.includes('private-token'));
});

test('empty admin list leaves notifications unclaimed', async () => {
  let claimed = false;
  await assert.rejects(deliverNotifications({ portal: { claimNotifications: async () => { claimed = true; } }, channel: {}, adminRoleIds: [], portalUrl: config.portalUrl }));
  assert.equal(claimed, false);
});

test('link defers ephemerally before minting private code and uses the invoking user ID', async () => {
  const actions = [];
  const interaction = { commandName: 'link', guildId, user: { id: userId }, isChatInputCommand: () => true,
    deferReply: async payload => actions.push(['defer', payload]), editReply: async payload => actions.push(['reply', payload]) };
  await handleLink(interaction, { config, portal: { createLinkCode: async id => { actions.push(['mint', id]); return { code: 'ABC123XY', expiresAt: '2030-01-01T00:00:00Z', linkUrl: 'https://arena.example/discord-link' }; } } });
  assert.equal(actions[0][0], 'defer');
  assert.equal(actions[0][1].flags, 64);
  assert.deepEqual(actions[1], ['mint', userId]);
  assert.match(actions[2][1].content, /ABC123XY/);
  assert.match(actions[2][1].content, /\/discordlink/);
  assert.deepEqual(actions[2][1].allowedMentions, { parse: [] });
});
