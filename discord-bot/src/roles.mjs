import { RuntimeError, validateSnapshot } from './validation.mjs';

function roleOptions(group) {
  const color = /^#[0-9a-f]{6}$/i.test(group.color ?? '') ? Number.parseInt(group.color.slice(1), 16) : 0;
  return { name: group.name.replace(/[\r\n\t]/g, ' ').trim().slice(0, 100), colors: { primaryColor: color }, hoist: group.enabled && group.isAdmin, mentionable: group.enabled && group.isAdmin, reason: 'ARENA portal group synchronization' };
}

function assertEditable(role, guildId) {
  if (role.id === guildId || role.managed || !role.editable) throw new RuntimeError('Mapped Discord role is protected or above the bot; check role hierarchy');
}

/** Reconcile only persisted bot-owned role IDs; never match or adopt roles by name. */
export async function reconcileRoles({ guild, portal, userId, signal }) {
  const checkRunning = () => signal?.throwIfAborted();
  checkRunning();
  const snapshot = validateSnapshot(await portal.snapshot());
  const [roles, fetched] = await Promise.all([guild.roles.fetch(), userId ? guild.members.fetch({ user: userId, force: true }) : guild.members.fetch({ time: 30_000 })]);
  const members = userId ? new Map([[userId, fetched]]) : fetched;
  const mapping = new Map(snapshot.roles.map(role => [role.groupId, role.discordRoleId]));
  let staffRoleId = snapshot.staffRoleId;
  // Preflight every existing mapping before touching any role or membership.
  for (const id of [...mapping.values(), ...(staffRoleId ? [staffRoleId] : [])]) {
    if (id === guild.id) throw new RuntimeError('The everyone role cannot be managed');
    const role = roles.get(id);
    if (role) assertEditable(role, guild.id);
  }
  for (const group of snapshot.groups) {
    checkRunning();
    let role = roles.get(mapping.get(group.id));
    if (!role && !group.enabled) continue;
    const options = roleOptions(group);
    if (!role) {
      role = await guild.roles.create({ ...options, permissions: 0n });
      try { await portal.saveRole(group.id, role.id, mapping.get(group.id) ?? null); }
      catch (error) {
        // Avoid adopting an orphan by name on the next run. Rollback is best effort.
        try { await role.delete('ARENA mapping persistence failed'); } catch { /* A zero-permission orphan is safe and can be removed manually. */ }
        throw error;
      }
      mapping.set(group.id, role.id);
      roles.set(role.id, role);
    } else if (role.name !== options.name || role.color !== options.colors.primaryColor || role.hoist !== options.hoist || role.mentionable !== options.mentionable) {
      await role.edit(options);
    }
  }
  // An absent field means the portal is still on the older bridge contract.
  if (Object.hasOwn(snapshot, 'staffRoleId')) {
    checkRunning();
    let staff = roles.get(staffRoleId);
    const options = { name: 'Staff', hoist: true, mentionable: true, reason: 'ARENA AdminCore staff membership' };
    if (!staff) {
      staff = await guild.roles.create({ ...options, permissions: 0n });
      try { await portal.saveRole('staff', staff.id, staffRoleId ?? null); }
      catch (error) {
        try { await staff.delete('ARENA Staff mapping persistence failed'); } catch { /* Unassigned orphan can be removed manually. */ }
        throw error;
      }
      staffRoleId = staff.id;
    } else if (staff.name !== options.name || !staff.hoist || !staff.mentionable) {
      await staff.edit(options);
    }
  }
  // Reorder only our roles within the slots they already occupy. Custom Discord
  // roles and the bot's own role are never explicitly moved.
  const ranked = snapshot.groups.filter(group => group.enabled && Number.isFinite(group.rankWeight) && mapping.has(group.id));
  if (ranked.length > 1) {
    checkRunning();
    const current = await guild.roles.fetch();
    const ordered = ranked.map(group => ({ group, role: current.get(mapping.get(group.id)) }));
    for (const item of ordered) {
      if (!item.role) throw new RuntimeError('A managed role disappeared during synchronization');
      assertEditable(item.role, guild.id);
    }
    ordered.sort((a, b) => a.group.rankWeight - b.group.rankWeight || a.group.id.localeCompare(b.group.id));
    const slots = ordered.map(item => item.role.position).sort((a, b) => a - b);
    const positions = ordered.map((item, index) => ({ role: item.role.id, position: slots[index] }));
    checkRunning();
    if (ordered.some((item, index) => item.role.position !== slots[index])) await guild.roles.setPositions(positions);
  }
  const enabled = new Set(snapshot.groups.filter(group => group.enabled).map(group => group.id));
  const adminGroups = new Set(snapshot.groups.filter(group => group.enabled && group.isAdmin).map(group => group.id));
  const desiredByUser = new Map(snapshot.members.map(member => {
    const desired = new Set(member.groupIds.filter(id => enabled.has(id)).map(id => mapping.get(id)).filter(Boolean));
    if (staffRoleId && member.groupIds.some(id => adminGroups.has(id))) desired.add(staffRoleId);
    return [member.discordUserId, desired];
  }));
  const managed = new Set(mapping.values());
  if (staffRoleId) managed.add(staffRoleId);
  let added = 0, removed = 0;
  // Fetching all guild members also cleans expired links and members no longer in the snapshot.
  for (const member of members.values()) {
    checkRunning();
    const desired = desiredByUser.get(member.id) ?? new Set();
    for (const roleId of member.roles.cache.keys()) {
      if (managed.has(roleId) && !desired.has(roleId)) {
        checkRunning();
        await member.roles.remove(roleId, 'ARENA group expired or link removed');
        removed++;
      }
    }
    for (const roleId of desired) {
      if (!member.roles.cache.has(roleId)) {
        checkRunning();
        await member.roles.add(roleId, 'ARENA effective portal group');
        added++;
      }
    }
  }
  return { added, removed, ...(userId ? { linked: desiredByUser.has(userId) } : {}) };
}
