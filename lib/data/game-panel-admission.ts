import type { PoolConnection, RowDataPacket } from "mysql2/promise";
const operations: Record<string, string> = {
  "inventory.protect": "inventory.sale-lock.set",
  "inventory.sell": "marketplace.sale.bulk",
  "cases.open": "crate.open",
  "cases.open-bulk": "crate.open.bulk",
  "market.purchase": "marketplace.purchase",
  "loadout.equip": "loadout.equip",
  "loadout.clear": "loadout.clear",
  "customize.rename": "item.nametag.set",
  "customize.sticker": "item.sticker.attach",
  "customize.charm": "item.charm.attach",
  "benefits.vip-activate": "inventory.group_membership.activate",
  "benefits.theme-equip": "inventory.profile_theme.equip",
  "benefits.redeem": "redeem-code.claim",
  "trades.create": "trade.create",
  "trades.respond": "trade.respond",
  "trades.cancel": "trade.cancel",
};
export async function requireGamePanelAdmission(
  connection: PoolConnection,
  actor: string,
  key: string,
  operation: string,
  now = Date.now(),
) {
  if (!key.startsWith("gp1_")) return;
  const [rows] = await connection.query<
    Array<
      RowDataPacket & {
        operation_id: string;
        operation_name: string;
        state: string;
      }
    >
  >(
    "SELECT operation_id, operation_name, state FROM portal_game_panel_operations WHERE economy_key = ? AND actor_steam_id = ? LIMIT 1 FOR UPDATE",
    [key, actor],
  );
  const row = rows[0];
  const created =
    row && /^\d{13}_[a-f0-9]{32}$/.test(row.operation_id)
      ? Number(row.operation_id.slice(0, 13))
      : NaN;
  if (
    !row ||
    operations[row.operation_name] !== operation ||
    row.state !== "pending" ||
    !Number.isSafeInteger(created) ||
    created > now + 60_000 ||
    now > created + 86_400_000
  )
    throw Object.assign(
      new Error("This native operation requires reconciliation."),
      { code: "operation_expired" },
    );
}
