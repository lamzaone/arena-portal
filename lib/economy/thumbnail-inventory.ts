import { thumbnailForSource, type WeaponThumbnail } from "./weapon-thumbnail.ts";
import type { ThumbnailTicket } from "./thumbnail-cache.ts";

type Row = Record<string, unknown>;
type Dependencies = {
  readRows: (sql: string, values: unknown[]) => Promise<Row[]>;
  request: (item: WeaponThumbnail, owner: string, options: { background: true }) => Promise<ThumbnailTicket>;
};
const selectItems = `SELECT i.id,i.owner_steam_id,i.item_type,i.definition_index,i.paintkit,
  i.float_value,i.seed,i.stattrak,i.stattrak_count,i.nametag,i.attributes,c.metadata AS catalogue_metadata
  FROM portal_inventory_items AS i LEFT JOIN portal_economy_catalogue AS c ON c.id=i.catalogue_id
  WHERE i.state IN ('available','escrowed') AND i.item_type IN ('skin','weapon','knife','glove')`;

function record(value: unknown): Row {
  if (typeof value === "string") { try { return record(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

export function ownedThumbnailPrewarmEnabled(environment: Record<string, string | undefined>) {
  if (environment.NEXT_PHASE === "phase-production-build" || environment.WEAPON_THUMBNAIL_PREWARM_ENABLED === "false") return false;
  return environment.WEAPON_THUMBNAIL_PREWARM_ENABLED === "true"
    || Boolean(environment.ARENA_HOSTING_ROOT && environment.NODE_ENV === "production");
}

/** The inventory is the durable work list; no job table or database writes. */
export function createInventoryThumbnailPrewarmer({ readRows, request }: Dependencies) {
  let cursor = "";
  let active: Promise<void> | undefined;
  async function scan() {
    // Changed items get first consideration every pass, including game/plugin
    // changes. A separate keyset cursor eventually visits all older inventory.
    const recent = await readRows(`${selectItems} ORDER BY i.updated_at DESC,i.id DESC LIMIT 20`, []);
    const backlog = await readRows(`${selectItems} AND i.id > ? ORDER BY i.id ASC LIMIT 100`, [cursor]);
    const unique = new Map([...recent, ...backlog].map(row => [String(row.id), row]));
    if (!unique.size) { cursor = ""; return; }
    const ids = [...unique.keys()];
    const stickers = await readRows(`SELECT weapon_item_id,sticker_slot,sticker_definition_index,attributes
      FROM portal_inventory_item_stickers WHERE weapon_item_id IN (${ids.map(() => "?").join(",")})`, ids);
    const status = new Map<string, ThumbnailTicket["status"]>();
    for (const [id, row] of unique) {
      // An owned item's unknown float/seed must not become a sample snapshot.
      if (row.float_value == null || row.seed == null || row.definition_index == null || row.paintkit == null) continue;
      const owner = String(row.owner_steam_id);
      if (!/^\d{17}$/.test(owner)) continue;
      const preview = thumbnailForSource({
        itemType: String(row.item_type), definitionIndex: Number(row.definition_index), paintkit: Number(row.paintkit),
        floatValue: Number(row.float_value), seed: Number(row.seed), stattrak: Number(row.stattrak) === 1,
        stattrakCount: Number(row.stattrak_count), nametag: row.nametag == null ? null : String(row.nametag),
        raw: { attributes: record(row.attributes), catalogue: { metadata: record(row.catalogue_metadata) },
          stickers: stickers.filter(sticker => String(sticker.weapon_item_id) === id).map(sticker => ({
            slot: Number(sticker.sticker_slot), definitionIndex: Number(sticker.sticker_definition_index), attributes: record(sticker.attributes),
          })),
        },
      });
      if (preview) status.set(id, (await request(preview.item, owner, { background: true })).status);
    }
    // Retry queue overflow before moving on. Renderer failures are revisited
    // on the next sweep so one broken model cannot trap the entire backfill.
    // Later rows may still be accepted for other owners in the same pass.
    let blocked = false;
    for (const row of backlog) {
      const value = status.get(String(row.id));
      if (value === "busy") blocked = true;
      if (!blocked) cursor = String(row.id);
    }
    if (!blocked && backlog.length < 100) cursor = "";
  }
  return {
    runOnce(): Promise<void> {
      // Timer/manual wakeups share one bounded database scan.
      return active ??= scan().finally(() => { active = undefined; });
    },
  };
}
