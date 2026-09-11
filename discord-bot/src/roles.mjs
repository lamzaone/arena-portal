import { RuntimeError, validateSnapshot } from './validation.mjs';

function roleOptions(group) {
  const color = /^#[0-9a-f]{6}$/i.test(group.color ?? '') ? Number.parseInt(group.color.slice(1), 16) : 0;
  return { name: group.name.replace(/[\r\n\t]/g, ' ').trim().slice(0, 100), colors: { primaryColor: color }, permissions: 0n, mentionable: group.enabled && group.isAdmin, reason: 'ARENA portal group synchronization' };
}

function assertEditable(role, guildId) {
  if (role.id === guildId || role.managed || !role.editable) throw new RuntimeError('Mapped Discord role is protected or above the bot; check role hierarchy');
}

/** Reconcile only persisted bot-owned role IDs; never match or adopt roles by name. */
export async function reconcileRoles({ guild, portal }) {
  const snapshot = validateSnapshot(await portal.snapshot());
  const [roles, members] = await Promise.all([guild.roles.fetch(), guild.members.fetch({ time: 30_000 })]);
  const mapping = new Map(snapshot.roles.map(role => [role.groupId, role.discordRoleId]));
  // Preflight every existing mapping before touching any role or membership.
  for (const id of mapping.values()) {
    if (id === guild.id) throw new RuntimeError('The everyone role cannot be managed');
    const role = roles.get(id);
    if (role) assertEditable(role, guild.id);
  }
  for (const group of snapshot.groups) {
    let role = roles.get(mapping.get(group.id));
    if (!role && !group.enabled) continue;
    const options = roleOptions(group);
    if (!role) {
      role = await guild.roles.create(options);
      try { await portal.saveRole(group.id, role.id, mapping.get(group.id) ?? null); }
      catch (error) {
        // Avoid adopting an orphan by name on the next run. Rollback is best effort.
        try { await role.delete('ARENA mapping persistence failed'); } catch { /* A zero-permission orphan is safe and can be removed manually. */ }
        throw error;
      }
      mapping.set(group.id, role.id);
      roles.set(role.id, role);
    } else if (role.name !== options.name || role.color !== options.colors.primaryColor || role.mentionable !== options.mentionable || role.permissions.bitfield !== 0n) {
      await role.edit(options);
    }
  }
  const enabled = new Set(snapshot.groups.filter(group => group.enabled).map(group => group.id));
  const desiredByUser = new Map(snapshot.members.map(member => [member.discordUserId, new Set(member.groupIds.filter(id => enabled.has(id)).map(id => mapping.get(id)).filter(Boolean))]));
  const managed = new Set(mapping.values());
  let added = 0, removed = 0;
  // Fetching all guild members also cleans expired links and members no longer in the snapshot.
  for (const member of members.values()) {
    const desired = desiredByUser.get(member.id) ?? new Set();
    for (const roleId of member.roles.cache.keys()) {
      if (managed.has(roleId) && !desired.has(roleId)) {
        await member.roles.remove(roleId, 'ARENA group expired or link removed');
        removed++;
      }
    }
    for (const roleId of desired) {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId, 'ARENA effective portal group');
        added++;
      }
    }
  }
  return { added, removed };
}
