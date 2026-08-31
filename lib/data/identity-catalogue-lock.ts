import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";

type CatalogueLockRow = RowDataPacket & {
  acquired: number | string | null;
};

export const identityCatalogueMutationLockName =
  "portal.identity.catalogue.sync";

export async function acquireIdentityCatalogueMutationLock(
  connection: PoolConnection,
  timeoutSeconds = 10,
) {
  const [rows] = await connection.query<CatalogueLockRow[]>(
    "SELECT GET_LOCK(?, ?) AS acquired",
    [identityCatalogueMutationLockName, timeoutSeconds],
  );
  return Number(rows[0]?.acquired ?? 0) === 1;
}

export async function releaseIdentityCatalogueMutationLock(
  connection: PoolConnection,
) {
  await connection.query("SELECT RELEASE_LOCK(?)", [
    identityCatalogueMutationLockName,
  ]);
}
