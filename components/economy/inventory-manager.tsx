"use client";

import {
  Check,
  Copy,
  PencilLine,
  Search,
  ShieldCheck,
  Sticker,
  Sword,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  EconomyEmptyState,
  EconomyItemCard,
} from "@/components/economy/economy-item-card";
import { postEconomyAction } from "@/components/economy/economy-request";
import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  economyItems,
  economyLoadout,
  economyWallet,
  formatTokens,
  humanize,
  itemStickerSlotCount,
  itemSupportsLoadout,
  itemSupportsNametag,
  itemSupportsStickers,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { TokenBalance } from "@/components/economy/token-balance";

type InventoryManagerProps = {
  inventory: unknown;
  loadout: unknown;
  wallet: unknown;
  csrf: string;
};

type SortMode = "newest" | "name" | "rarity" | "float";

type LoadoutSlotInput =
  | { slotType: "weapon"; team: "T" | "CT"; definitionIndex: number }
  | { slotType: "knife" | "glove" | "agent"; team: "T" | "CT" }
  | { slotType: "music_kit" };

function slotForItem(
  item: EconomyItemView,
  team: "T" | "CT",
): LoadoutSlotInput | null {
  if (
    (item.itemType === "skin" || item.itemType === "weapon") &&
    item.definitionIndex !== null
  )
    return { slotType: "weapon", team, definitionIndex: item.definitionIndex };
  if (
    item.itemType === "knife" ||
    item.itemType === "glove" ||
    item.itemType === "agent"
  )
    return { slotType: item.itemType, team };
  if (
    item.itemType === "music_kit" ||
    item.itemType === "music-kit" ||
    item.itemType === "musickit"
  )
    return { slotType: "music_kit" };
  return null;
}

function compareItems(
  left: EconomyItemView,
  right: EconomyItemView,
  mode: SortMode,
) {
  if (mode === "name") return left.displayName.localeCompare(right.displayName);
  if (mode === "rarity")
    return (
      right.rarityRank - left.rarityRank ||
      left.displayName.localeCompare(right.displayName)
    );
  if (mode === "float")
    return (
      (left.floatValue ?? Number.POSITIVE_INFINITY) -
      (right.floatValue ?? Number.POSITIVE_INFINITY)
    );
  return 0;
}

export function InventoryManager({
  inventory,
  loadout,
  wallet,
  csrf,
}: InventoryManagerProps) {
  const router = useRouter();
  const items = useMemo(() => economyItems(inventory), [inventory]);
  const loadoutView = useMemo(() => economyLoadout(loadout), [loadout]);
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [selectedId, setSelectedId] = useState("");
  const [team, setTeam] = useState<"T" | "CT">("T");
  const [nametag, setNametag] = useState("");
  const [nametagItemId, setNametagItemId] = useState("");
  const [stickerId, setStickerId] = useState("");
  const [stickerSlot, setStickerSlot] = useState("0");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const types = useMemo(
    () => [...new Set(items.map((item) => item.itemType))].sort(),
    [items],
  );
  const rarities = useMemo(
    () => [...new Set(items.map((item) => item.rarity))].sort(),
    [items],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items
      .filter((item) => {
        const haystack = [
          item.displayName,
          item.description ?? "",
          item.itemType,
          item.rarity,
          item.nametag ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase();
        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (type === "all" || item.itemType === type) &&
          (rarity === "all" || item.rarity === rarity)
        );
      })
      .sort((left, right) => compareItems(left, right, sort));
  }, [items, query, rarity, sort, type]);

  const selected =
    filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const selectedSlot = selected ? slotForItem(selected, team) : null;
  const stickerSlots = selected ? itemStickerSlotCount(selected) : 0;
  const stickers = items.filter(
    (item) => item.itemType === "sticker" && item.id,
  );
  const nametagItems = items.filter(
    (item) =>
      item.itemType === "nametag" && item.state === "available" && item.id,
  );

  useEffect(() => {
    if (!selected) return;
    setNametag(selected.nametag ?? "");
    setNametagItemId("");
    setTeam("T");
    setStickerId("");
    setStickerSlot("0");
  }, [loadoutView, selected?.id]);

  function runAction(
    path: string,
    payload: Record<string, unknown>,
    success: string,
  ) {
    if (!selected) return;
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await postEconomyAction(path, csrf, payload);
        setNotice({ type: "success", text: result.message || success });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "The inventory change could not be saved.",
        });
      }
    });
  }

  async function copyTradeItemId() {
    if (!selected?.id) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(selected.id);
      setNotice({
        type: "success",
        text: "Trade item ID copied. Share it only with the player making the offer.",
      });
    } catch {
      setNotice({
        type: "error",
        text: "Could not copy the trade item ID. Select and copy it manually below.",
      });
    }
  }

  return (
    <section className="inventory-manager" aria-label="Inventory manager">
      <div className="content-grid">
        <div className="panel">
          <p className="eyebrow">
            <ShieldCheck aria-hidden="true" /> Token inventory
          </p>
          <h2>Every item you own, in one place.</h2>
          <p className="empty-copy">
            Browse, search, equip, name, and customize eligible items. Changes
            are checked against your owned item instance before the server
            loadout is updated.
          </p>
        </div>
        <TokenBalance wallet={walletView} />
      </div>

      {notice ? (
        <p
          className={`notice notice-${notice.type === "success" ? "success" : "danger"}`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      <form
        className="panel form-panel inventory-filter-panel"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="form-grid">
          <label htmlFor="inventory-search">
            Search inventory
            <input
              id="inventory-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, rarity, tag, or type"
            />
          </label>
          <label htmlFor="inventory-sort">
            Sort by
            <select
              id="inventory-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
            >
              <option value="newest">Newest first</option>
              <option value="name">Name</option>
              <option value="rarity">Rarity</option>
              <option value="float">Float value</option>
            </select>
          </label>
          <label htmlFor="inventory-type">
            Item type
            <select
              id="inventory-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="all">All item types</option>
              {types.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="inventory-rarity">
            Rarity
            <select
              id="inventory-rarity"
              value={rarity}
              onChange={(event) => setRarity(event.target.value)}
            >
              <option value="all">All rarities</option>
              {rarities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inventory-filter-summary">
          <p className="empty-copy">
            <Search aria-hidden="true" /> {filtered.length} of {items.length}{" "}
            items shown
          </p>
          {query || type !== "all" || rarity !== "all" || sort !== "newest" ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setQuery("");
                setType("all");
                setRarity("all");
                setSort("newest");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </form>

      {items.length ? (
        <div className="inventory-layout">
          <div>
            <div className="feature-grid inventory-item-grid">
              {filtered.map((item) => (
                <EconomyItemCard
                  key={item.id || `${item.catalogueId}-${item.displayName}`}
                  item={item}
                  selected={selected?.id === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  selectionLabel={`Manage ${item.displayName}`}
                  enableMarketPreview
                />
              ))}
            </div>
            {!filtered.length ? (
              <EconomyEmptyState
                title="No inventory items match"
                description="Clear a filter or search for another item."
              />
            ) : null}
          </div>
          <aside
            className="panel inventory-detail-panel"
            aria-label="Selected item controls"
          >
            {selected ? (
              <>
                <div className="inventory-detail-hero">
                  <MarketplaceItemPreview item={selected} enableMarketPreview />
                  <div className="inventory-detail-heading">
                    <p className="eyebrow">
                      <Sword aria-hidden="true" /> Item management
                    </p>
                    <h2>{selected.displayName}</h2>
                    <p>
                      {selected.rarity} · {humanize(selected.itemType)}
                    </p>
                    {selected.description ? (
                      <p className="inventory-detail-description">
                        {selected.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="tag-list">
                  <code>{selected.id}</code>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={copyTradeItemId}
                  >
                    <Copy aria-hidden="true" /> Copy trade ID
                  </button>
                </div>
                <p className="empty-copy">
                  Share this ID only when you want another player to request
                  this exact item in a trade.
                </p>
                {itemSupportsLoadout(selected) ? (
                  <fieldset className="form-panel">
                    <legend>Equip item</legend>
                    {selectedSlot?.slotType !== "music_kit" ? (
                      <label htmlFor="inventory-team">
                        Loadout team
                        <select
                          id="inventory-team"
                          value={team}
                          onChange={(event) =>
                            setTeam(event.target.value === "CT" ? "CT" : "T")
                          }
                        >
                          <option value="T">Terrorist</option>
                          <option value="CT">Counter-Terrorist</option>
                        </select>
                      </label>
                    ) : (
                      <p className="empty-copy">
                        Music kits are equipped globally for both sides.
                      </p>
                    )}
                    {selectedSlot?.slotType === "weapon" ? (
                      <p className="empty-copy">
                        This finish will be equipped for weapon definition{" "}
                        {selectedSlot.definitionIndex}.
                      </p>
                    ) : null}
                    <div className="hero-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={pending || !selected.id || !selectedSlot}
                        onClick={() =>
                          selectedSlot
                            ? runAction(
                                "/api/economy/loadout/equip",
                                { itemId: selected.id, slot: selectedSlot },
                                `${selected.displayName} has been equipped.`,
                              )
                            : undefined
                        }
                      >
                        <Check aria-hidden="true" />{" "}
                        {pending ? "Saving…" : "Equip"}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={pending || !selectedSlot}
                        onClick={() =>
                          selectedSlot
                            ? runAction(
                                "/api/economy/loadout/clear",
                                { slot: selectedSlot },
                                "Loadout slot cleared.",
                              )
                            : undefined
                        }
                      >
                        Clear slot
                      </button>
                    </div>
                  </fieldset>
                ) : (
                  <p className="empty-copy">
                    This item is kept in your inventory and cannot be equipped
                    in a loadout slot.
                  </p>
                )}

                {itemSupportsNametag(selected) ? (
                  <fieldset className="form-panel">
                    <legend>Name tag</legend>
                    <label htmlFor="inventory-nametag">
                      Name tag{" "}
                      <small>200 Tokens, or use an owned name-tag item</small>
                      <input
                        id="inventory-nametag"
                        type="text"
                        maxLength={128}
                        value={nametag}
                        onChange={(event) => setNametag(event.target.value)}
                        placeholder="Enter a name tag"
                      />
                    </label>
                    <label htmlFor="inventory-nametag-item">
                      Payment
                      <select
                        id="inventory-nametag-item"
                        value={nametagItemId}
                        onChange={(event) =>
                          setNametagItemId(event.target.value)
                        }
                      >
                        <option value="">Spend 200 Tokens</option>
                        {nametagItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            Use {item.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={
                        pending ||
                        !selected.id ||
                        !nametag.trim() ||
                        nametag.trim() === (selected.nametag ?? "")
                      }
                      onClick={() =>
                        runAction(
                          "/api/economy/items/nametag",
                          {
                            itemId: selected.id,
                            nametag: nametag.trim(),
                            ...(nametagItemId ? { nametagItemId } : {}),
                          },
                          nametagItemId
                            ? "Name-tag item consumed and applied."
                            : "Your name tag has been updated.",
                        )
                      }
                    >
                      <PencilLine aria-hidden="true" />{" "}
                      {pending ? "Saving…" : "Apply name tag"}
                    </button>
                  </fieldset>
                ) : null}

                {itemSupportsStickers(selected) ? (
                  <fieldset className="form-panel">
                    <legend>Apply sticker</legend>
                    <label htmlFor="inventory-sticker">
                      Sticker
                      <select
                        id="inventory-sticker"
                        value={stickerId}
                        onChange={(event) => setStickerId(event.target.value)}
                      >
                        <option value="">Choose an owned sticker</option>
                        {stickers.map((sticker) => (
                          <option key={sticker.id} value={sticker.id}>
                            {sticker.displayName} · {sticker.rarity}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor="inventory-sticker-slot">
                      Slot
                      <select
                        id="inventory-sticker-slot"
                        value={stickerSlot}
                        onChange={(event) => setStickerSlot(event.target.value)}
                      >
                        {Array.from({ length: stickerSlots }, (_, value) => (
                          <option key={value} value={value}>
                            Slot {value + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={pending || !selected.id || !stickerId}
                      onClick={() =>
                        runAction(
                          "/api/economy/items/sticker",
                          {
                            weaponItemId: selected.id,
                            stickerItemId: stickerId,
                            slot: Number(stickerSlot),
                          },
                          "Sticker applied to your weapon.",
                        )
                      }
                    >
                      <Sticker aria-hidden="true" />{" "}
                      {pending ? "Saving…" : "Apply sticker"}
                    </button>
                    {selected.stickers.length ? (
                      <div className="tag-list">
                        {selected.stickers.map((entry) => (
                          <span
                            key={`${entry.slot}-${entry.itemId}`}
                            className="tag"
                          >
                            Slot {entry.slot + 1}: {entry.displayName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </fieldset>
                ) : null}
                <p className="empty-copy">
                  Current wallet: {formatTokens(walletView.balance)} tokens.
                </p>
                {loadoutView.length ? (
                  <div className="group-block">
                    <span>Current loadout slots</span>
                    <div className="tag-list">
                      {loadoutView.map((entry) => (
                        <span key={entry.slot} className="tag">
                          {humanize(entry.slot)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <EconomyEmptyState
                title="Select an item"
                description="Choose an item from the inventory list to manage it."
              />
            )}
          </aside>
        </div>
      ) : (
        <EconomyEmptyState
          title="Your inventory is empty"
          description="Earn eligible match rewards, wait for random drops, open crates, or buy an item from the marketplace to start a collection."
        />
      )}
    </section>
  );
}
