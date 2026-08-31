const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns the explicit Admins.Core/VIPCore locator pair for the physical game
 * server managed by this portal. The two plugins generate unrelated GUIDs, so
 * their native GUID columns must never be joined heuristically. These two
 * configured values are the cross-plugin identity contract.
 *
 * VIPCore server zero remains reserved for the global scope and is therefore
 * never returned as a physical-server link.
 *
 * @param {unknown} adminServerGuid
 * @param {unknown} vipServerId
 * @returns {{adminServerGuid: string, vipServerId: number} | null}
 */
export function configuredArenaServerScopeLink(adminServerGuid, vipServerId) {
  const guid = String(adminServerGuid ?? "").trim().toLowerCase();
  const serverId = Number(vipServerId);
  if (
    !GUID_PATTERN.test(guid) ||
    !Number.isSafeInteger(serverId) ||
    serverId <= 0
  ) return null;
  return { adminServerGuid: guid, vipServerId: serverId };
}
