export class RuntimeError extends Error {}
export const isSnowflake = value => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value);
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const textOrNull = value => value === null || typeof value === 'string';

/** Reject partial/malformed snapshots before making any Discord mutation. */
export function validateSnapshot(data) {
  if (!data || !Array.isArray(data.groups) || !Array.isArray(data.members) || !Array.isArray(data.roles)) throw new RuntimeError('Invalid portal snapshot');
  const groups = new Set();
  for (const group of data.groups) {
    if (!group || !identifier(group.id) || groups.has(group.id) || typeof group.name !== 'string' || !group.name.trim() || !textOrNull(group.color) || typeof group.enabled !== 'boolean' || typeof group.isAdmin !== 'boolean') throw new RuntimeError('Invalid portal group');
    groups.add(group.id);
    if (group.rankWeight !== undefined && !Number.isFinite(group.rankWeight)) throw new RuntimeError('Invalid portal group rank');
  }
  const mappedGroups = new Set(), mappedRoles = new Set(), users = new Set();
  for (const role of data.roles) {
    if (!role || !identifier(role.groupId) || !isSnowflake(role.discordRoleId) || mappedGroups.has(role.groupId) || mappedRoles.has(role.discordRoleId)) throw new RuntimeError('Invalid portal role mapping');
    mappedGroups.add(role.groupId); mappedRoles.add(role.discordRoleId);
  }
  for (const member of data.members) {
    if (!member || !isSnowflake(member.discordUserId) || users.has(member.discordUserId) || !Array.isArray(member.groupIds) || member.groupIds.some(id => !groups.has(id))) throw new RuntimeError('Invalid portal member');
    users.add(member.discordUserId);
    if (member.steamId !== undefined && (typeof member.steamId !== 'string' || !/^7656119\d{10}$/.test(member.steamId))) throw new RuntimeError('Invalid linked Steam identity');
  }
  if (data.staffRoleId != null && (!isSnowflake(data.staffRoleId) || mappedRoles.has(data.staffRoleId))) throw new RuntimeError('Invalid Staff role mapping');
  return data;
}

export function validateEvents(data) {
  if (!data || !Array.isArray(data.events) || data.events.length > 100) throw new RuntimeError('Invalid notification batch');
  const ids = new Set();
  for (const event of data.events) {
    if (!event || !identifier(event.id) || ids.has(event.id) || !identifier(event.leaseToken) || typeof event.eventType !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/i.test(event.eventType) || typeof event.title !== 'string' || typeof event.body !== 'string' || !textOrNull(event.url) || !textOrNull(event.steamId)) throw new RuntimeError('Invalid notification event');
    ids.add(event.id);
  }
  return data;
}

/** Only URLs on the configured portal origin can become clickable bot links. */
export function safePortalUrl(value, portalUrl) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value, portalUrl);
    if (url.origin !== new URL(portalUrl).origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

/** External error messages/objects can contain tokens, payloads and private codes. */
export function safeError(error) {
  if (error instanceof RuntimeError) return error.message;
  if (typeof error?.code === 'number' && Number.isSafeInteger(error.code)) return `Discord API error ${error.code}`;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Request timed out or aborted';
  return 'Operation failed; check service connectivity and Discord permissions';
}
