"use client";

import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  LockKeyhole,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./player-workspace.module.css";

import { TradeActivity } from "@/components/economy/trade-activity";
import { PaginatedItemGrid, useItemGridLayout } from "@/components/economy/item-grid";
import { postEconomyAction } from "@/components/economy/economy-request";
import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  economyItems,
  economyTrades,
  economyWallet,
  formatTokens,
  itemIsTradable,
  rarityClass,
  rarityName,
  type EconomyTradeItemView,
} from "@/components/economy/economy-view-model";
import { PlayerIdentity } from "@/components/player-identity";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import {
  PlayerSearchField,
  type PlayerSearchResult,
} from "@/components/player-search-field";
import { TokenBalance } from "@/components/economy/token-balance";
import { PortalToast } from "@/components/success-toast";
import { AsyncButton } from "@/components/ui/async-button";
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  SearchField,
} from "@/components/ui/search-field";
import { economyItemTypeLabel } from "@/lib/economy/item-taxonomy";
import { economyItemDisplayName } from "@/lib/economy/item-display-name";
import { tradeWeaponPreviewFields } from "@/lib/economy/trade-preview";
import { ITEM_GRID_MAX_PAGE_SIZE, normalizeItemGridPageSize } from "@/lib/economy/item-grid-layout";
import type { PlayerIdentityData } from "@/lib/player-identities";

type TradeManagerProps = {
  inventory: unknown;
  wallet: unknown;
  trades: unknown;
  csrf: string;
  counterpartyIdentities: Readonly<Record<string, PlayerIdentityData>>;
};

type TradePlayer = PlayerSearchResult;

type PartnerInventoryState =
  | "idle"
  | "loading"
  | "ready"
  | "private"
  | "error";

type PartnerInventoryPage = {
  items: EconomyTradeItemView[];
  total: number | null;
  page: number;
  pageSize: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePartnerItem(value: unknown): EconomyTradeItemView | null {
  if (!isRecord(value)) return null;
  const id = text(value.id) || text(value.itemId);
  const baseDisplayName = text(value.displayName);
  const itemType = text(value.itemType);
  if (!id || !baseDisplayName || !itemType) return null;
  const rarityRank = Math.max(0, integer(value.rarityRank));
  const stattrak = value.stattrak === true;
  const visual = tradeWeaponPreviewFields(value);
  return {
    id,
    catalogueId:
      value.catalogueId === null || value.catalogueId === undefined
        ? null
        : integer(value.catalogueId),
    itemType,
    displayName: economyItemDisplayName(baseDisplayName, stattrak),
    rarity: rarityName(rarityRank),
    rarityRank,
    tradable: value.tradable !== false && value.tradable !== 0,
    imageUrl: text(value.imageUrl) || null,
    definitionIndex: visual.definitionIndex,
    paintkit: visual.paintkit,
    seed: visual.seed,
    raw: { attributes: visual.attributes, stickers: visual.stickers },
    floatValue:
      value.floatValue === null || value.floatValue === undefined
        ? null
        : nullableNumber(value.floatValue),
    stattrak,
    stattrakCount: Math.max(0, integer(value.stattrakCount)),
    nametag: text(value.nametag) || null,
  };
}

function parsePartnerInventory(value: unknown) {
  if (!isRecord(value)) return null;
  const visibility = value.visibility === "public" ? "public" : "private";
  const items = Array.isArray(value.items)
    ? value.items
        .map(parsePartnerItem)
        .filter((item): item is EconomyTradeItemView => item !== null)
    : [];
  const rawTotal = nullableNumber(value.total);
  return {
    visibility,
    items,
    total:
      visibility === "public" && rawTotal !== null
        ? Math.max(0, Math.floor(rawTotal))
        : null,
    page: Math.max(1, integer(value.page, 1)),
    pageSize: normalizeItemGridPageSize(value.pageSize),
  };
}

async function responseMessage(response: Response) {
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && typeof value.message === "string") {
      return value.message;
    }
  } catch {
    // A useful local fallback is returned below for non-JSON proxy failures.
  }
  return "The requested player data is unavailable right now.";
}

function TradeItemButton({
  item,
  selected,
  onToggle,
}: {
  item: EconomyTradeItemView;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`trade-offer-item${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <MarketplaceItemPreview item={item} enableMarketPreview />
      <span className="trade-offer-item-copy">
        <span className={rarityClass(item.rarityRank)}>{item.rarity}</span>
        <strong>{item.displayName}</strong>
        <small>
          {economyItemTypeLabel(item.itemType)}
          {item.floatValue !== null
            ? ` · ${item.floatValue.toFixed(6)} float`
            : ""}
        </small>
      </span>
      <span className="trade-offer-selection">
        {selected ? <><Check aria-hidden="true" /> Selected</> : "Select item"}
      </span>
    </button>
  );
}

export function TradeManager({
  inventory,
  wallet,
  trades,
  csrf,
  counterpartyIdentities,
}: TradeManagerProps) {
  const router = useRouter();
  const { gridProps: partnerGridProps, pageSize: partnerPageSize, measured: partnerGridMeasured } = useItemGridLayout();
  const inventoryItems = useMemo(() => economyItems(inventory), [inventory]);
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const tradeList = useMemo(() => economyTrades(trades), [trades]);
  const tradableItems = useMemo(
    () => inventoryItems.filter(itemIsTradable),
    [inventoryItems],
  );

  const [playerSearchKey, setPlayerSearchKey] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<TradePlayer | null>(null);
  const [partnerState, setPartnerState] =
    useState<PartnerInventoryState>("idle");
  const [partnerInventory, setPartnerInventory] = useState<PartnerInventoryPage>({
    items: [],
    total: null,
    page: 1,
    pageSize: ITEM_GRID_MAX_PAGE_SIZE,
  });
  const [knownPartnerItems, setKnownPartnerItems] = useState<
    Record<string, EconomyTradeItemView>
  >({});
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerPage, setPartnerPage] = useState(1);
  const [ownQuery, setOwnQuery] = useState("");
  const [offeredItemIds, setOfferedItemIds] = useState<string[]>([]);
  const [requestedItemIds, setRequestedItemIds] = useState<string[]>([]);
  const [offeredTokens, setOfferedTokens] = useState("0");
  const [requestedTokens, setRequestedTokens] = useState("0");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleOwnItems = useMemo(() => {
    const query = ownQuery.trim().toLocaleLowerCase("en-US");
    if (!query) return tradableItems;
    return tradableItems.filter((item) =>
      `${item.displayName} ${item.itemType} ${item.rarity}`
        .toLocaleLowerCase("en-US")
        .includes(query),
    );
  }, [ownQuery, tradableItems]);

  const selectedOfferedItems = useMemo(
    () =>
      offeredItemIds.flatMap((id) => {
        const item = tradableItems.find((candidate) => candidate.id === id);
        return item ? [item] : [];
      }),
    [offeredItemIds, tradableItems],
  );
  const selectedRequestedItems = useMemo(
    () => requestedItemIds.flatMap((id) => knownPartnerItems[id] ?? []),
    [knownPartnerItems, requestedItemIds],
  );

  useEffect(() => {
    setPartnerPage(1);
  }, [partnerPageSize]);

  useEffect(() => {
    if (!selectedPlayer) {
      setPartnerState("idle");
      return;
    }
    if (!partnerGridMeasured) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPartnerState("loading");
      const params = new URLSearchParams({ page: String(partnerPage), pageSize: String(partnerPageSize) });
      if (partnerQuery.trim()) params.set("q", partnerQuery.trim());
      void fetch(
        `/api/economy/trades/partners/${selectedPlayer.steamId}/inventory?${params.toString()}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(await responseMessage(response));
          return response.json() as Promise<unknown>;
        })
        .then((body) => {
          if (controller.signal.aborted) return;
          const result = parsePartnerInventory(body);
          if (!result) throw new Error("The player inventory response was invalid.");
          if (result.pageSize !== partnerPageSize) throw new Error("The player inventory page size did not match this view.");
          if (result.visibility === "private") {
            setPartnerInventory({ items: [], total: null, page: 1, pageSize: partnerPageSize });
            setKnownPartnerItems({});
            setRequestedItemIds([]);
            setPartnerState("private");
            return;
          }
          const lastPage = result.total === null
            ? 1
            : Math.max(1, Math.ceil(result.total / result.pageSize));
          if (result.page > lastPage) {
            // Inventories can shrink while a later page is open. Refetch the
            // last real page instead of stranding the user on an empty page.
            setPartnerPage(lastPage);
            return;
          }
          setPartnerInventory(result);
          setKnownPartnerItems((current) => {
            const next = { ...current };
            for (const item of result.items) next[item.id] = item;
            return next;
          });
          setPartnerState("ready");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPartnerInventory({ items: [], total: null, page: 1, pageSize: partnerPageSize });
          setPartnerState("error");
          setNotice({
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "That inventory could not be loaded.",
          });
        });
    }, partnerQuery.trim() ? DEFAULT_SEARCH_DEBOUNCE_MS : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [partnerPage, partnerPageSize, partnerGridMeasured, partnerQuery, selectedPlayer]);

  function choosePlayer(player: TradePlayer) {
    setSelectedPlayer(player);
    setPartnerQuery("");
    setPartnerPage(1);
    setPartnerInventory({ items: [], total: null, page: 1, pageSize: partnerPageSize });
    setKnownPartnerItems({});
    setRequestedItemIds([]);
    setRequestedTokens("0");
    setNotice(null);
  }

  function clearPlayer(resetSearch = true) {
    setSelectedPlayer(null);
    if (resetSearch) setPlayerSearchKey((key) => key + 1);
    setPartnerQuery("");
    setPartnerPage(1);
    setPartnerInventory({ items: [], total: null, page: 1, pageSize: partnerPageSize });
    setKnownPartnerItems({});
    setRequestedItemIds([]);
    setRequestedTokens("0");
  }

  function toggleItem(
    itemId: string,
    selectedIds: string[],
    setSelectedIds: (value: string[]) => void,
  ) {
    if (selectedIds.includes(itemId)) {
      setSelectedIds(selectedIds.filter((id) => id !== itemId));
      return;
    }
    if (selectedIds.length >= 12) {
      setNotice({
        type: "error",
        text: "A trade can contain up to 12 items on each side.",
      });
      return;
    }
    setSelectedIds([...selectedIds, itemId]);
  }

  function tokenValue(value: string) {
    const normalized = value.trim();
    if (!normalized) return 0;
    if (!/^\d+$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function submitTrade() {
    const tokensOffered = tokenValue(offeredTokens);
    const tokensRequested = tokenValue(requestedTokens);
    if (tokensOffered === null || tokensRequested === null) {
      setNotice({
        type: "error",
        text: "Token amounts must be whole, non-negative numbers.",
      });
      return;
    }
    if (!selectedPlayer) {
      setNotice({ type: "error", text: "Search for and choose the other player first." });
      return;
    }
    if (
      !offeredItemIds.length &&
      !tokensOffered &&
      !requestedItemIds.length &&
      !tokensRequested
    ) {
      setNotice({
        type: "error",
        text: "Offer or request at least one item or some tokens.",
      });
      return;
    }
    if (tokensOffered > walletView.balance) {
      setNotice({
        type: "error",
        text: "Your offer cannot contain more tokens than your available wallet balance.",
      });
      return;
    }
    setNotice(null);
    setPendingAction("create");
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/trades/create",
          csrf,
          {
            counterpartySteamId: selectedPlayer.steamId,
            offeredItemIds,
            requestedItemIds,
            offeredTokens: tokensOffered,
            requestedTokens: tokensRequested,
          },
        );
        setNotice({ type: "success", text: result.message || "Trade offer sent." });
        setOfferedItemIds([]);
        setRequestedItemIds([]);
        setOfferedTokens("0");
        setRequestedTokens("0");
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "The trade offer could not be created.",
        });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function respond(tradeId: string, decision: "accept" | "reject") {
    setNotice(null);
    setPendingAction(`${decision}:${tradeId}`);
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/trades/respond",
          csrf,
          { tradeId, decision },
        );
        setNotice({
          type: "success",
          text:
            result.message ||
            `Trade ${decision === "accept" ? "accepted" : "declined"}.`,
        });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "The trade response could not be saved.",
        });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function cancel(tradeId: string) {
    setNotice(null);
    setPendingAction(`cancel:${tradeId}`);
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/trades/cancel",
          csrf,
          { tradeId },
        );
        setNotice({ type: "success", text: result.message || "Trade offer cancelled." });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "The trade could not be cancelled.",
        });
      } finally {
        setPendingAction(null);
      }
    });
  }

  const partnerPageCount =
    partnerInventory.total === null
      ? 1
      : Math.max(1, Math.ceil(partnerInventory.total / partnerInventory.pageSize));
  const partnerLoading = Boolean(selectedPlayer) && (
    partnerState === "loading" || !partnerGridMeasured ||
    partnerState === "ready" && (partnerInventory.pageSize !== partnerPageSize || partnerInventory.page !== partnerPage)
  );

  return (
    <section className={styles.workspace} aria-label="Player trading">
      <header className={styles.overview}>
        <div className={styles.overviewCopy}>
          <h2>Build both sides of the offer</h2>
          <p>Choose a player, then add items or Tokens. Your offered assets are reserved until the trade is resolved.</p>
        </div>
        <div className={styles.overviewMeta}>
          <TokenBalance wallet={walletView} compact />
          <a href="#trade-activity">Offers ({tradeList.length})</a>
        </div>
      </header>

      {notice ? (
        <PortalToast
          variant={notice.type === "success" ? "success" : "danger"}
          message={notice.text}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <section className="panel trade-builder">
        <div className="panel-heading trade-builder-heading">
          <div>
            <h2>Create trade offer</h2>
            <p>Search by a player&apos;s current name or exact SteamID64.</p>
          </div>
          {selectedPlayer ? (
            <ThemedPlayerContainer
              className="trade-selected-player"
              containerKind="selection"
              ownerSteamId={selectedPlayer.steamId}
              profileThemeKey={selectedPlayer.profileThemeKey}
            >
              <PlayerIdentity
                player={{
                  steamId: selectedPlayer.steamId,
                  displayName: selectedPlayer.displayName,
                  avatarUrl: selectedPlayer.avatarUrl,
                  presence: selectedPlayer.presence,
                  profileThemeKey: selectedPlayer.profileThemeKey,
                  identityGroups: selectedPlayer.identityGroups,
                }}
                variant="compact"
              />
              <button
                type="button"
                onClick={() => clearPlayer()}
                disabled={pendingAction === "create"}
                aria-label="Choose a different player"
              >
                <X aria-hidden="true" />
              </button>
            </ThemedPlayerContainer>
          ) : null}
        </div>

        <fieldset
          className="trade-builder-controls"
          disabled={pendingAction === "create"}
        >
        <legend className="sr-only">Trade offer controls</legend>
        <div className="trade-player-search">
          <PlayerSearchField
            key={playerSearchKey}
            id="trade-player-search"
            name="counterpartySteamId"
            label="Other player"
            mode="target"
            placeholder="Start typing a name or SteamID64"
            helpText="Choose a player to load their public tradable inventory."
            showInventoryVisibility
            onSelectionChange={(player) => {
              if (player) choosePlayer(player);
              else if (selectedPlayer) clearPlayer(false);
            }}
          />
        </div>

        <div className="trade-inventory-columns">
          <fieldset className="trade-side-panel">
            <legend>
              <span>You offer</span>
              <small>{offeredItemIds.length} / 12 selected</small>
            </legend>
            <SearchField
              id="trade-own-inventory-search"
              label="Filter your inventory"
              rootClassName="trade-inventory-search"
              value={ownQuery}
              onValueChange={setOwnQuery}
              placeholder="Name, rarity, or item type"
              autoComplete="off"
            />
            <div className="trade-side-scroll">
              {visibleOwnItems.length ? (
                <PaginatedItemGrid className="trade-offer-picker" label="Your trade inventory" resetKey={ownQuery}>
                  {visibleOwnItems.map((item) => (
                    <TradeItemButton
                      key={item.id}
                      item={item}
                      selected={offeredItemIds.includes(item.id)}
                      onToggle={() =>
                        toggleItem(item.id, offeredItemIds, setOfferedItemIds)
                      }
                    />
                  ))}
                </PaginatedItemGrid>
              ) : (
                <div className="trade-side-empty">
                  <Coins aria-hidden="true" />
                  <strong>No matching tradable items</strong>
                  <p>Equipped, reserved, or non-tradable items are excluded.</p>
                </div>
              )}
            </div>
          </fieldset>

          <ThemedPlayerContainer
            as="fieldset"
            className="trade-side-panel trade-partner-panel"
            containerKind="selection"
            enabled={Boolean(selectedPlayer)}
            ownerSteamId={selectedPlayer?.steamId}
            profileThemeKey={selectedPlayer?.profileThemeKey}
          >
            <legend>
              <span>You request</span>
              <small>{requestedItemIds.length} / 12 selected</small>
            </legend>
            {selectedPlayer ? (
              <SearchField
                id="trade-partner-inventory-search"
                label="Filter their inventory"
                rootClassName="trade-inventory-search"
                value={partnerQuery}
                onValueChange={(value) => {
                  setPartnerQuery(value);
                  setPartnerPage(1);
                }}
                onClear={() => {
                  setPartnerQuery("");
                  setPartnerPage(1);
                }}
                placeholder="Name, rarity, or item type"
                autoComplete="off"
                pending={partnerLoading && Boolean(partnerQuery.trim())}
                disabled={partnerState === "private"}
              />
            ) : null}
            <span className="sr-only" role="status" aria-live="polite">
              {!selectedPlayer
                ? "No trade partner selected."
                : partnerLoading
                  ? `Loading ${selectedPlayer.displayName}'s public inventory.`
                  : partnerState === "private"
                    ? `${selectedPlayer.displayName}'s inventory is private.`
                    : partnerState === "error"
                      ? `${selectedPlayer.displayName}'s inventory could not be loaded.`
                      : partnerState === "ready"
                        ? `${partnerInventory.total ?? partnerInventory.items.length} available items found. Page ${partnerInventory.page} of ${partnerPageCount}.`
                        : `${selectedPlayer.displayName} selected.`}
            </span>
            <div className="trade-side-scroll" aria-busy={partnerLoading}>
              {!selectedPlayer ? (
                <div className="trade-side-empty">
                  <UserRound aria-hidden="true" />
                  <strong>Choose a player</strong>
                  <p>Their public tradable inventory will appear here.</p>
                </div>
              ) : partnerLoading ? (
                <div className="trade-partner-loading" aria-label="Loading public inventory">
                  {Array.from({ length: 4 }, (_, index) => (
                    <span key={index} className="ui-skeleton-card" aria-hidden="true">
                      <i className="ui-skeleton ui-skeleton-media" />
                      <i className="ui-skeleton ui-skeleton-title" />
                    </span>
                  ))}
                </div>
              ) : partnerState === "private" ? (
                <div className="trade-side-empty is-private">
                  <LockKeyhole aria-hidden="true" />
                  <strong>This inventory is private</strong>
                  <p>
                    You can still offer your own items or Tokens, but you cannot
                    request hidden items. The owner can change this in Settings.
                  </p>
                </div>
              ) : partnerState === "error" ? (
                <div className="trade-side-empty">
                  <X aria-hidden="true" />
                  <strong>Inventory unavailable</strong>
                  <p>Try choosing this player again or return in a moment.</p>
                </div>
              ) : partnerState === "ready" && !partnerInventory.items.length ? (
                <div className="trade-side-empty">
                  <Coins aria-hidden="true" />
                  <strong>No matching available items</strong>
                  <p>This public inventory has no items matching the current filter.</p>
                </div>
              ) : null}
              <div {...partnerGridProps} className="trade-offer-picker" aria-label="Other player trade inventory">
                {selectedPlayer && partnerState === "ready" && !partnerLoading
                  ? partnerInventory.items.slice(0, partnerPageSize).map((item) => (
                      <TradeItemButton
                        key={item.id}
                        item={item}
                        selected={requestedItemIds.includes(item.id)}
                        onToggle={() =>
                          toggleItem(item.id, requestedItemIds, setRequestedItemIds)
                        }
                      />
                    ))
                  : null}
              </div>
              {selectedPlayer && partnerInventory.total !== null && partnerPageCount > 1 ? (
                <nav className="trade-partner-pagination" aria-label="Other player inventory pages">
                  <button
                    type="button"
                    disabled={partnerLoading || partnerInventory.page <= 1}
                    onClick={() => {
                      if (partnerLoading || partnerInventory.page <= 1) return;
                      setPartnerPage((page) => Math.max(1, page - 1));
                    }}
                  >
                    <ChevronLeft aria-hidden="true" /> Previous
                  </button>
                  <span>{partnerInventory.page} / {partnerPageCount}</span>
                  <button
                    type="button"
                    disabled={partnerLoading || partnerInventory.page >= partnerPageCount}
                    onClick={() => {
                      if (partnerLoading || partnerInventory.page >= partnerPageCount) return;
                      setPartnerPage((page) => page + 1);
                    }}
                  >
                    Next <ChevronRight aria-hidden="true" />
                  </button>
                </nav>
              ) : null}
            </div>
          </ThemedPlayerContainer>
        </div>

        <div className="trade-terms-grid">
          <label htmlFor="trade-offered-tokens">
            Tokens you offer
            <input
              id="trade-offered-tokens"
              type="number"
              min="0"
              max={walletView.balance}
              value={offeredTokens}
              onChange={(event) => setOfferedTokens(event.target.value)}
            />
          </label>
          <label htmlFor="trade-requested-tokens">
            Tokens you request
            <input
              id="trade-requested-tokens"
              type="number"
              min="0"
              value={requestedTokens}
              onChange={(event) => setRequestedTokens(event.target.value)}
              disabled={!selectedPlayer}
            />
          </label>
          <div className="trade-offer-summary" aria-live="polite">
            <span><strong>{selectedOfferedItems.length}</strong> item{selectedOfferedItems.length === 1 ? "" : "s"} offered</span>
            <ArrowLeftRight aria-hidden="true" />
            <span><strong>{selectedRequestedItems.length}</strong> item{selectedRequestedItems.length === 1 ? "" : "s"} requested</span>
          </div>
          <AsyncButton
            type="button"
            className="button button-primary trade-submit"
            disabled={pending || !selectedPlayer}
            pending={pendingAction === "create"}
            pendingLabel="Sending offer"
            icon={<Send aria-hidden="true" />}
            onClick={submitTrade}
          >
            Send trade offer
          </AsyncButton>
        </div>
        </fieldset>
      </section>

      <TradeActivity
        trades={tradeList}
        counterpartyIdentities={counterpartyIdentities}
        pending={pending}
        pendingAction={pendingAction}
        onRespond={respond}
        onCancel={cancel}
      />
    </section>
  );
}
