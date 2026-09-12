import { createHash } from 'node:crypto';
import { validateSnapshot } from './validation.mjs';

function fingerprint(snapshot) {
  const byId = (a, b) => a[0].localeCompare(b[0]);
  // Ignore presentation order and rank: Discord role positions are user-managed.
  return createHash('sha256').update(JSON.stringify([
    snapshot.groups.map(group => [group.id, group.name, group.color, group.enabled, group.isAdmin]).sort(byId),
    snapshot.members.map(member => [member.discordUserId, [...member.groupIds].sort()]).sort(byId),
    snapshot.roles.map(role => [role.groupId, role.discordRoleId]).sort(byId),
    Object.hasOwn(snapshot, 'staffRoleId'), snapshot.staffRoleId ?? null,
  ])).digest('hex');
}

/** Called from the existing portal poll; only successful syncs advance the marker. */
export function createAutomaticRoleSync({ sync, now = Date.now, fullSyncIntervalMs = 60_000 }) {
  let applied = null, completedAt = 0, running = false, revision = 0, appliedRevision = -1;
  const run = async data => {
    const snapshot = validateSnapshot(data);
    if (running) return false;
    const next = fingerprint(snapshot), currentRevision = revision;
    if (next === applied && appliedRevision === currentRevision && now() - completedAt < fullSyncIntervalMs) return false;
    running = true;
    try {
      await sync(snapshot);
      applied = next;
      appliedRevision = currentRevision;
      completedAt = now();
      return true;
    } finally { running = false; }
  };
  run.invalidate = () => { revision++; };
  return run;
}
