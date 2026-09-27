import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCompletePlayerEconomyInventory, getPlayerEconomyInventoryPage } from "@/lib/economy/player-inventory";
import { normalizeItemGridPageSize } from "@/lib/economy/item-grid-layout";
import { isEconomyItemType, isEconomyRarityRank } from "@/lib/economy/item-taxonomy";
import type { EconomyInventoryFilter } from "@/lib/data/portal-repository";

const headers = { "Cache-Control": "private, no-store" };
const sorts = new Set(["newest", "name", "rarity", "float"]);

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return json({ ok: false, message: "Sign in to view your inventory." }, 401);

  const params = new URL(request.url).searchParams;
  if (params.get("mode") === "materials") {
    try {
      const result = await getCompletePlayerEconomyInventory(session.steamId, {
        itemTypes: ["sticker", "nametag", "keychain"],
      });
      return json({ ok: true, items: result.items });
    } catch {
      return json({ ok: false, message: "Attachment items are temporarily unavailable." }, 503);
    }
  }
  const pageText = params.get("page") ?? "1";
  const page = Number(pageText);
  const type = params.get("type") ?? "all";
  const rarityText = params.get("rarity") ?? "all";
  const rarity = Number(rarityText);
  const sort = params.get("sort") ?? "newest";
  const query = params.get("q")?.trim() ?? "";
  const hideEquipped = params.get("hideEquipped") === "1";
  if (
    !/^\d+$/.test(pageText) || !Number.isSafeInteger(page) || page < 1 ||
    (type !== "all" && !isEconomyItemType(type)) ||
    (rarityText !== "all" && !isEconomyRarityRank(rarity)) ||
    !sorts.has(sort) || query.length > 120 ||
    ![null, "0", "1"].includes(params.get("hideEquipped"))
  ) return json({ ok: false, message: "Choose valid inventory filters." }, 400);

  const filter: EconomyInventoryFilter = {
    page,
    pageSize: normalizeItemGridPageSize(params.get("pageSize")),
    query,
    itemTypes: type === "all" ? undefined : [type],
    rarityRanks: rarityText === "all" ? undefined : [rarity],
    sort: sort as EconomyInventoryFilter["sort"],
    hideEquipped,
  };
  try {
    const result = await getPlayerEconomyInventoryPage(session.steamId, filter);
    return json({ ok: true, ...result });
  } catch {
    return json({ ok: false, message: "Inventory is temporarily unavailable." }, 503);
  }
}
