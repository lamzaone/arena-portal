import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverNotifications } from '../src/notifications.mjs';

const staffRole = '222222222222222222';
const events = ['game.report', 'game.calladmin', 'game.report.resolved'].map((eventType, index) => ({
  id: String(index + 1), leaseToken: `lease-${index}`, eventType,
  title: eventType, body: 'Server: ARENA\nActor: @everyone\nNote: Reviewed evidence',
  steamId: eventType === 'game.report' ? '76561198000000002' : null, url: null,
}));

test('report, assistance and resolution events use the existing configured channel with restricted staff mentions', async () => {
  const messages = []; const finished = [];
  const channel = { send: async message => { messages.push(message); return { id: String(messages.length) }; } };
  const portal = { claimNotifications: async () => ({ events }), finishNotification: async result => finished.push(result) };
  assert.equal(await deliverNotifications({ portal, channel, adminRoleIds: [staffRole], portalUrl: 'https://arena.example' }), 3);
  for (const message of messages) {
    assert.equal(message.content, `<@&${staffRole}>`);
    assert.deepEqual(message.allowedMentions, { parse: [], roles: [staffRole], users: [], repliedUser: false });
  }
  assert.deepEqual(finished.map(({ action, id, leaseToken }) => ({ action, id, leaseToken })), events.map(({ id, leaseToken }) => ({ action: 'complete', id, leaseToken })));
});

test('failed resolution delivery retries the durable lease and preserves its Discord deduplication nonce', async () => {
  const event = events[2]; const messages = []; const finished = [];
  let fail = true;
  const channel = { send: async message => { messages.push(message); if (fail) throw new Error('offline'); return { id: '123' }; } };
  const portal = { claimNotifications: async () => ({ events: [event] }), finishNotification: async result => finished.push(result) };
  await deliverNotifications({ portal, channel, adminRoleIds: [staffRole], portalUrl: 'https://arena.example' });
  fail = false;
  await deliverNotifications({ portal, channel, adminRoleIds: [staffRole], portalUrl: 'https://arena.example' });
  assert.equal(finished[0].action, 'retry'); assert.equal(finished[1].action, 'complete');
  assert.equal(messages[0].nonce, messages[1].nonce);
  assert.equal(messages[1].enforceNonce, true);
});
