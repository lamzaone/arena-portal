"use client";

import {
  Check,
  Coins,
  Crosshair,
  Copy,
  PencilLine,
  Search,
  Shield,
  ShieldCheck,
  Sticker,
  Sword,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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
  itemCharmDefinitionIndex,
  itemSupportsCharm,
  itemIsVipMembership,
  humanize,
  itemStickerSlotCount,
  itemSupportsLoadout,
  itemSupportsNametag,
  itemSupportsStickers,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { TokenBalance } from "@/components/economy/token-balance";
import { PortalToast } from "@/components/success-toast";

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

function gridColumnCount(grid: HTMLElement) {
  return Math.max(
    1,
    getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
}

function rowEndIndex(itemIndex: number, columns: number, itemCount: number) {
  if (itemIndex < 0 || itemCount < 1) return -1;
  return Math.min(
    itemCount - 1,
    Math.ceil((itemIndex + 1) / columns) * columns - 1,
  );
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
  const [selectedTeams, setSelectedTeams] = useState<Array<"T" | "CT">>([
    "T",
  ]);
  const [nametag, setNametag] = useState("");
  const [nametagItemId, setNametagItemId] = useState("");
  const [charmItemId, setCharmItemId] = useState("");
  const [stickerId, setStickerId] = useState("");
  const [stickerSlot, setStickerSlot] = useState("0");
  const [saleConfirmationItemId, setSaleConfirmationItemId] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const inventoryGridRef = useRef<HTMLDivElement | null>(null);
  const [inventoryGridColumns, setInventoryGridColumns] = useState(1);
  const [inventoryInlineModalIndex, setInventoryInlineModalIndex] = useState(-1);
  const [inventoryModalHost, setInventoryModalHost] = useState<HTMLDivElement | null>(null);

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

  const selected = filtered.find((item) => item.id === selectedId) ?? null;
  const selectedIndex = filtered.findIndex((item) => item.id === selectedId);
  const selectedSalePayout =
    selected?.marketPriceTokens !== null && selected?.marketPriceTokens !== undefined
      ? Math.max(5, Math.floor(selected.marketPriceTokens / 10))
      : null;
  const salePriceIsKnown =
    selectedSalePayout !== null && selectedSalePayout >= 1;
  // Inventory records retain a saved snapshot while the Market can show a
  // fresher public quote. The server resolves that current quote on sale.
  const saleCanResolveFromMarket =
    selected !== null && selected.catalogueId !== null;
  const saleIsConfirming = selected?.id === saleConfirmationItemId;
  const saleUnavailableReason = !selected
    ? null
    : selected.state !== "available"
      ? "Attached or trade-reserved items cannot be sold."
      : selected.stickers.length
        ? "Remove the attached stickers before selling this item."
      : !salePriceIsKnown && !saleCanResolveFromMarket
        ? "This item needs a current market or last-known price before it can be sold."
        : null;
  const selectedVipMembership = selected ? itemIsVipMembership(selected) : false;
  const selectedSlots = selected
    ? (() => {
        const prototype = slotForItem(selected, "T");
        if (!prototype) return [];
        if (prototype.slotType === "music_kit") return [prototype];
        return selectedTeams
          .map((team) => slotForItem(selected, team))
          .filter((slot): slot is LoadoutSlotInput => slot !== null);
      })()
    : [];
  const selectedSlot = selectedSlots[0] ?? null;
  const selectedCharmDefinitionIndex = selected
    ? itemCharmDefinitionIndex(selected)
    : null;
  const stickerSlots = selected ? itemStickerSlotCount(selected) : 0;
  const stickers = items.filter(
    (item) => item.itemType === "sticker" && item.id,
  );
  const nametagItems = items.filter(
    (item) =>
      item.itemType === "nametag" && item.state === "available" && item.id,
  );
  const charms = items.filter(
    (item) => item.itemType === "keychain" && item.state === "available" && item.id,
  );
  const canCustomize =
    selected !== null &&
    (itemSupportsNametag(selected) ||
      itemSupportsCharm(selected) ||
      itemSupportsStickers(selected));

  useEffect(() => {
    if (!selected) return;
    setNametag(selected.nametag ?? "");
    setNametagItemId("");
    setCharmItemId("");
    setSelectedTeams(["T"]);
    setStickerId("");
    setStickerSlot("0");
    setSaleConfirmationItemId("");
  }, [loadoutView, selected?.id]);

  useEffect(() => {
    if (selectedId && !filtered.some((item) => item.id === selectedId)) {
      setSelectedId("");
      setInventoryInlineModalIndex(-1);
      setSaleConfirmationItemId("");
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    const grid = inventoryGridRef.current;
    if (!grid) return;

    const syncColumnCount = () => {
      const columns = gridColumnCount(grid);
      setInventoryGridColumns((current) => {
        const next = columns;
        return current === next ? current : next;
      });
      if (selectedIndex >= 0) {
        setInventoryInlineModalIndex(
          rowEndIndex(selectedIndex, columns, filtered.length),
        );
      }
    };

    syncColumnCount();
    const observer = new ResizeObserver(syncColumnCount);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [filtered.length, selectedIndex]);

  function selectInventoryItem(itemId: string) {
    const grid = inventoryGridRef.current;
    const columns = grid ? gridColumnCount(grid) : inventoryGridColumns;
    const nextSelectedId = selectedId === itemId ? "" : itemId;

    setInventoryGridColumns(columns);
    if (!nextSelectedId) {
      setInventoryInlineModalIndex(-1);
      setSaleConfirmationItemId("");
      setSelectedId("");
      return;
    }

    const itemIndex = filtered.findIndex((item) => item.id === itemId);
    setInventoryInlineModalIndex(rowEndIndex(itemIndex, columns, filtered.length));
    setSelectedId(nextSelectedId);
  }

  function toggleLoadoutTeam(team: "T" | "CT") {
    setSelectedTeams((current) => {
      if (current.includes(team)) {
        // Keep one team active so Equip and Clear are always meaningful.
        return current.length === 1
          ? current
          : current.filter((entry) => entry !== team);
      }
      return [...current, team].sort();
    });
  }

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
        <PortalToast
          variant={notice.type === "success" ? "success" : "danger"}
          message={notice.text}
          onDismiss={() => setNotice(null)}
        />
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
          <div ref={inventoryGridRef} className="feature-grid inventory-item-grid">
            {filtered.map((item, index) => (
              <Fragment key={item.id || `${item.catalogueId}-${item.displayName}`}>
                <EconomyItemCard
                  item={item}
                  selected={selected?.id === item.id}
                  onSelect={() => selectInventoryItem(item.id)}
                  selectionLabel={`Manage ${item.displayName}`}
                  selectionControls={selected?.id === item.id ? `inventory-item-modal-${item.id}` : undefined}
                  enableMarketPreview
                />
                {index === inventoryInlineModalIndex ? <div ref={setInventoryModalHost} className="inventory-inline-modal-host" aria-live="polite" /> : null}
              </Fragment>
            ))}
          </div>
          {!filtered.length ? (
            <EconomyEmptyState
              title="No inventory items match"
              description="Clear a filter or search for another item."
            />
          ) : null}
          {inventoryModalHost && selected ? createPortal(
          <section
            id={`inventory-item-modal-${selected.id}`}
            className="panel crate-inline-modal inventory-inline-modal"
            aria-label="Selected item controls"
          >
              <header className="crate-inline-modal-header inventory-inline-modal-header">
                <div>
                  <p className="eyebrow"><Sword aria-hidden="true" /> Item management</p>
                  <h3>{selected.displayName}</h3>
                </div>
                <button type="button" className="button button-quiet crate-inline-modal-close" onClick={() => { setSelectedId(""); setInventoryInlineModalIndex(-1); setSaleConfirmationItemId(""); }} disabled={pending} aria-label={`Close ${selected.displayName} item management`}>
                  <X aria-hidden="true" /> Close
                </button>
              </header>
                <div className="inventory-detail-hero">
                  <MarketplaceItemPreview item={selected} enableMarketPreview />
                  <div className="inventory-detail-heading">
                    <p>
                      {selected.rarity} · {selectedVipMembership ? "VIP membership" : humanize(selected.itemType)}
                    </p>
                  </div>
                </div>
                <details className="inventory-inline-extra">
                  <summary>Extra details and trade ID</summary>
                  <div className="inventory-inline-extra-body">
                    {selected.description ? (
                      <p className="inventory-detail-description">
                        {selected.description}
                      </p>
                    ) : null}
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
                  </div>
                </details>
                {selectedVipMembership ? (
                  <fieldset className="form-panel inventory-vip-activation">
                    <legend>Use VIP membership</legend>
                    <p className="empty-copy">
                      Activate this item when you are ready. It will be consumed
                      and extend the matching VIP tier immediately. Until then,
                      it remains a normal item that you can trade or sell.
                    </p>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={pending || !selected.id || selected.state !== "available"}
                      onClick={() =>
                        runAction(
                          "/api/economy/items/vip/activate",
                          { itemId: selected.id },
                          `${selected.displayName} was activated.`,
                        )
                      }
                    >
                      <ShieldCheck aria-hidden="true" />{" "}
                      {pending ? "Activating…" : "Activate VIP membership"}
                    </button>
                  </fieldset>
                ) : null}
                {itemSupportsLoadout(selected) ? (
                  <fieldset className="form-panel">
                    <legend>Equip item</legend>
                    {selectedSlot?.slotType !== "music_kit" ? (
                      <fieldset className="inventory-team-switch">
                        <legend>Loadout teams</legend>
                        <div role="group" aria-label="Loadout teams">
                          <button
                            type="button"
                            className={`inventory-team-choice is-terrorist${selectedTeams.includes("T") ? " is-selected" : ""}`}
                            aria-pressed={selectedTeams.includes("T")}
                            disabled={pending}
                            onClick={() => toggleLoadoutTeam("T")}
                          >
                            <Crosshair aria-hidden="true" />
                            <span><strong>T</strong><small>Terrorist</small></span>
                          </button>
                          <button
                            type="button"
                            className={`inventory-team-choice is-counter-terrorist${selectedTeams.includes("CT") ? " is-selected" : ""}`}
                            aria-pressed={selectedTeams.includes("CT")}
                            disabled={pending}
                            onClick={() => toggleLoadoutTeam("CT")}
                          >
                            <Shield aria-hidden="true" />
                            <span><strong>CT</strong><small>Counter-Terrorist</small></span>
                          </button>
                        </div>
                        <p className="empty-copy">
                          Select both teams to apply this item to T and CT in
                          one update.
                        </p>
                      </fieldset>
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
                        disabled={pending || !selected.id || !selectedSlots.length}
                        onClick={() =>
                          selectedSlots.length
                            ? runAction(
                                "/api/economy/loadout/equip",
                                { itemId: selected.id, slots: selectedSlots },
                                `${selected.displayName} has been equipped for ${selectedSlots.length === 2 ? "T and CT" : "the selected team"}.`,
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
                        disabled={pending || !selectedSlots.length}
                        onClick={() =>
                          selectedSlots.length
                            ? runAction(
                                "/api/economy/loadout/clear",
                                { slots: selectedSlots },
                                `${selectedSlots.length === 2 ? "Both loadout slots cleared." : "Loadout slot cleared."}`,
                              )
                            : undefined
                        }
                      >
                        Clear slot
                      </button>
                    </div>
                  </fieldset>
                ) : !selectedVipMembership ? (
                  <p className="empty-copy">
                    This item is kept in your inventory and cannot be equipped
                    in a loadout slot.
                  </p>
                ) : null}

                {canCustomize ? (
                  <details className="inventory-customize-panel">
                    <summary>
                      <span><Sticker aria-hidden="true" /> Customize</span>
                      <small>Name tag, charm, stickers</small>
                    </summary>
                    <div className="inventory-customize-panel-body">
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

                {itemSupportsCharm(selected) ? (
                  <fieldset className="form-panel">
                    <legend>Charm</legend>
                    <label htmlFor="inventory-charm">
                      Owned charm
                      <select
                        id="inventory-charm"
                        value={charmItemId}
                        onChange={(event) => setCharmItemId(event.target.value)}
                      >
                        <option value="">Choose an owned charm</option>
                        {charms.map((charm) => (
                          <option key={charm.id} value={charm.id}>
                            {charm.displayName} · {charm.rarity}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedCharmDefinitionIndex !== null ? (
                      <p className="empty-copy">
                        Current charm: game definition {selectedCharmDefinitionIndex}.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={pending || !selected.id || !charmItemId}
                      onClick={() =>
                        runAction(
                          "/api/economy/items/charm",
                          {
                            weaponItemId: selected.id,
                            charmItemId,
                          },
                          "Charm applied to your weapon.",
                        )
                      }
                    >
                      <Sticker aria-hidden="true" /> {pending ? "Saving…" : "Apply charm"}
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
                    </div>
                  </details>
                ) : null}
                <details className="inventory-sell-panel">
                  <summary>
                    <span><Coins aria-hidden="true" /> Sell to market</span>
                    <small>10% buyback</small>
                  </summary>
                  <div className="inventory-sell-panel-body">
                    {saleUnavailableReason ? (
                      <p className="empty-copy">{saleUnavailableReason}</p>
                    ) : (
                      <>
                        <div className="inventory-sell-price">
                          <span>Current buyback payout</span>
                          <strong>
                            {salePriceIsKnown
                              ? `${formatTokens(selectedSalePayout)} Tokens`
                              : "Market quote"}
                          </strong>
                          <small>
                            {salePriceIsKnown
                              ? selected.marketPriceTokens !== null && selected.marketPriceTokens < 50
                                ? `Minimum 5-Token buyback for this ${formatTokens(selected.marketPriceTokens)}-Token market price.`
                                : `10% of the current ${formatTokens(selected.marketPriceTokens ?? 0)}-Token market price.`
                              : "Your final 10% payout is resolved from the same current quote shown in Market."}
                          </small>
                        </div>
                        <p className="empty-copy">
                          Uses the current portal Market price or its staff-set last-known price. Selling permanently removes this item from your inventory and clears it from your loadout.
                        </p>
                        {saleIsConfirming ? (
                          <div className="hero-actions inventory-sell-confirmation">
                            <button
                              type="button"
                              className="button inventory-sell-confirm"
                              disabled={pending}
                              onClick={() =>
                                runAction(
                                  "/api/economy/items/sell",
                                  { itemId: selected.id },
                                  `${selected.displayName} sale completed.`,
                                )
                              }
                            >
                              <Coins aria-hidden="true" /> {pending
                                ? "Selling…"
                                : salePriceIsKnown
                                  ? `Confirm sale for ${formatTokens(selectedSalePayout)} Tokens`
                                  : "Confirm sale at market price"}
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={pending}
                              onClick={() => setSaleConfirmationItemId("")}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="button inventory-sell-start"
                            disabled={pending}
                            onClick={() => setSaleConfirmationItemId(selected.id)}
                          >
                            <Coins aria-hidden="true" /> {salePriceIsKnown
                              ? `Sell for ${formatTokens(selectedSalePayout)} Tokens`
                              : "Sell at market price"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </details>
          </section>, inventoryModalHost) : null}
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
