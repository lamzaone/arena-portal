import { createHash } from 'node:crypto';
import { RuntimeError, safeError, safePortalUrl, validateEvents, validateSnapshot } from './validation.mjs';

export function resolveAdminRoles(snapshot, roles, canMentionEveryone, guildId) {
  validateSnapshot(snapshot);
  const id = snapshot.staffRoleId;
  if (!id) throw new RuntimeError('TAPPED STAFF is not synchronized; notifications remain queued');
  const role = roles.get(id);
  if (id === guildId || !role || (!role.mentionable && !canMentionEveryone)) throw new RuntimeError('TAPPED STAFF is missing or cannot be mentioned; notifications remain queued');
  return [id];
}

export function buildNotification(event, adminRoleIds, portalUrl) {
  const url = safePortalUrl(event.url, portalUrl);
  const embed = { title: event.title.slice(0, 256) || 'ARENA notification', description: event.body.slice(0, 4096) || 'Open the portal for details.', color: 0xf59e0b,
    footer: { text: `ARENA · ${event.eventType} · ${event.id}`.slice(0, 256) } };
  if (url) embed.url = url;
  if (event.steamId) embed.fields = [{ name: 'Steam ID', value: event.steamId.slice(0, 64), inline: true }];
  return { content: adminRoleIds.map(id => `<@&${id}>`).join(' '), embeds: [embed],
    allowedMentions: { parse: [], roles: adminRoleIds, users: [], repliedUser: false },
    nonce: createHash('sha256').update(`arena:${event.id}`).digest('hex').slice(0, 24), enforceNonce: true };
}

export async function deliverNotifications({ portal, channel, adminRoleIds, portalUrl }) {
  if (!adminRoleIds.length) throw new RuntimeError('No admin roles are configured; notifications remain queued');
  const { events } = validateEvents(await portal.claimNotifications());
  for (const event of events) {
    let message;
    try { message = await channel.send(buildNotification(event, adminRoleIds, portalUrl)); }
    catch (error) {
      await portal.finishNotification({ action: 'retry', id: event.id, leaseToken: event.leaseToken, error: safeError(error) });
      continue;
    }
    // If completion fails, leave the durable lease alone: it expires for retry.
    // Discord's nonce check narrows (but cannot eliminate) the crash duplicate window.
    await portal.finishNotification({ action: 'complete', id: event.id, leaseToken: event.leaseToken, messageId: message.id });
  }
  return events.length;
}
