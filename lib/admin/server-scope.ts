export const DEFAULT_GAME_SERVER_GUID =
  "05eda3ad-2921-4083-adfb-2e23596c8caa";

export function configuredGameServerGuid() {
  return process.env.GAME_SERVER_GUID?.trim() || DEFAULT_GAME_SERVER_GUID;
}

export function isAssignedToConfiguredGameServer(
  serverGuids: readonly string[] | null | undefined,
) {
  const expected = configuredGameServerGuid().toLocaleLowerCase("en-US");
  return Boolean(
    serverGuids?.some(
      (serverGuid) =>
        serverGuid.trim().toLocaleLowerCase("en-US") === expected,
    ),
  );
}
