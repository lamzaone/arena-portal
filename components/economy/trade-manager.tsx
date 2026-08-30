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

import { EconomyEmptyState } from "@/components/economy/economy-item-card";
import { postEconomyAction } from "@/components/economy/economy-request";
import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  economyItems,
  economyTrades,
  economyWallet,
  formatTokens,
  humanize,
  itemIsTradable,
  rarityClass,
  rarityName,
  type EconomyItemView,
  type EconomyTradeItemView,
  type EconomyTradeView,
} from "@/components/economy/economy-view-model";
import { PlayerIdentity } from "@/components/player-identity";
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
    pageSize: Math.max(1, integer(value.pageSize, 60)),
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

function TradeItems({
  title,
  items,
  tokens,
}: {
  title: string;
  items: EconomyTradeView["offeredItems"];
  tokens: number;
}) {
  return (
    <div className="group-block">
      <span>{title}</span>
      {items.length || tokens ? (
        <div className="trade-asset-list">
          {tokens ? (
            <span className="trade-token-asset">
              <Coins aria-hidden="true" /> {formatTokens(tokens)} tokens
            </span>
          ) : null}
          {items.map((item) => (
            <article key={item.id} className="trade-item-preview">
              <MarketplaceItemPreview item={item} enableMarketPreview />
              <div>
                <span
                  className={rarityClass(item.rarityRank)}
                >
                  {item.rarity}
                </span>
                <strong>{item.displayName}</strong>
                <p>
                  {economyItemTypeLabel(item.itemType)}
                  {item.floatValue !== null
                    ? ` · Float ${item.floatValue.toFixed(6)}`
                    : ""}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <em>No items or tokens</em>
      )}
    </div>
  );
}

function TradeItemButton({
  item,
  selected,
  onToggle,
}: {
  item: Pick<
    EconomyItemView,
    | "id"
    | "catalogueId"
    | "displayName"
    | "floatValue"
    | "imageUrl"
    | "itemType"
    | "rarity"
    | "rarityRank"
  >;
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
    pageSize: 60,
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
    if (!selectedPlayer) {
      setPartnerState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPartnerState("loading");
      const params = new URLSearchParams({ page: String(partnerPage) });
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
          if (result.visibility === "private") {
            setPartnerInventory({ items: [], total: null, page: 1, pageSize: 60 });
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
          setPartnerInventory({ items: [], total: null, page: 1, pageSize: 60 });
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
  }, [partnerPage, partnerQuery, selectedPlayer]);

  function choosePlayer(player: TradePlayer) {
    setSelectedPlayer(player);
    setPartnerQuery("");
    setPartnerPage(1);
    setPartnerInventory({ items: [], total: null, page: 1, pageSize: 60 });
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
    setPartnerInventory({ items: [], total: null, page: 1, pageSize: 60 });
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

  return (
    <section aria-label="Player trading">
      <div className="content-grid trade-intro-grid">
        <div className="panel">
          <p className="eyebrow">
            <ArrowLeftRight aria-hidden="true" /> Player trades
          </p>
          <h2>Build both sides of the offer.</h2>
          <p className="empty-copy">
            Find another player, select what you will give on the left and what
            you want on the right. Pending offers safely reserve only your own
            included assets.
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

      <section className="panel trade-builder">
        <div className="panel-heading trade-builder-heading">
          <div>
            <h2>Create trade offer</h2>
            <p>Search by a player&apos;s current name or exact SteamID64.</p>
          </div>
          {selectedPlayer ? (
            <div className="trade-selected-player">
              <PlayerIdentity
                player={{
                  steamId: selectedPlayer.steamId,
                  displayName: selectedPlayer.displayName,
                  avatarUrl: selectedPlayer.avatarUrl,
                  presence: selectedPlayer.presence,
                  profileThemeKey: selectedPlayer.profileThemeKey,
                  identityGroups: [],
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
            </div>
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
                <div className="trade-offer-picker">
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
                </div>
              ) : (
                <div className="trade-side-empty">
                  <Coins aria-hidden="true" />
                  <strong>No matching tradable items</strong>
                  <p>Equipped, reserved, or non-tradable items are excluded.</p>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="trade-side-panel trade-partner-panel">
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
                pending={partnerState === "loading" && Boolean(partnerQuery.trim())}
                disabled={partnerState === "private"}
              />
            ) : null}
            <span className="sr-only" role="status" aria-live="polite">
              {!selectedPlayer
                ? "No trade partner selected."
                : partnerState === "loading"
                  ? `Loading ${selectedPlayer.displayName}'s public inventory.`
                  : partnerState === "private"
                    ? `${selectedPlayer.displayName}'s inventory is private.`
                    : partnerState === "error"
                      ? `${selectedPlayer.displayName}'s inventory could not be loaded.`
                      : partnerState === "ready"
                        ? `${partnerInventory.total ?? partnerInventory.items.length} available items found. Page ${partnerInventory.page} of ${partnerPageCount}.`
                        : `${selectedPlayer.displayName} selected.`}
            </span>
            <div className="trade-side-scroll" aria-busy={partnerState === "loading"}>
              {!selectedPlayer ? (
                <div className="trade-side-empty">
                  <UserRound aria-hidden="true" />
                  <strong>Choose a player</strong>
                  <p>Their public tradable inventory will appear here.</p>
                </div>
              ) : partnerState === "loading" ? (
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
              ) : partnerState === "ready" && partnerInventory.items.length ? (
                <>
                  <div className="trade-offer-picker">
                    {partnerInventory.items.map((item) => (
                      <TradeItemButton
                        key={item.id}
                        item={item}
                        selected={requestedItemIds.includes(item.id)}
                        onToggle={() =>
                          toggleItem(item.id, requestedItemIds, setRequestedItemIds)
                        }
                      />
                    ))}
                  </div>
                </>
              ) : partnerState === "ready" ? (
                <div className="trade-side-empty">
                  <Coins aria-hidden="true" />
                  <strong>No matching available items</strong>
                  <p>This public inventory has no items matching the current filter.</p>
                </div>
              ) : null}
              {selectedPlayer && partnerInventory.total !== null && partnerPageCount > 1 ? (
                <nav className="trade-partner-pagination" aria-label="Other player inventory pages">
                  <button
                    type="button"
                    aria-disabled={partnerState === "loading" || partnerInventory.page <= 1}
                    onClick={() => {
                      if (partnerState === "loading" || partnerInventory.page <= 1) return;
                      setPartnerPage((page) => Math.max(1, page - 1));
                    }}
                  >
                    <ChevronLeft aria-hidden="true" /> Previous
                  </button>
                  <span>{partnerInventory.page} / {partnerPageCount}</span>
                  <button
                    type="button"
                    aria-disabled={partnerState === "loading" || partnerInventory.page >= partnerPageCount}
                    onClick={() => {
                      if (partnerState === "loading" || partnerInventory.page >= partnerPageCount) return;
                      setPartnerPage((page) => page + 1);
                    }}
                  >
                    Next <ChevronRight aria-hidden="true" />
                  </button>
                </nav>
              ) : null}
            </div>
          </fieldset>
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

      <section className="history-section">
        <div className="section-heading compact">
          <p className="eyebrow">Trade activity</p>
          <h2>Incoming and outgoing offers</h2>
        </div>
        {tradeList.length ? (
          <div className="history-grid">
            {tradeList.map((trade) => (
              <article key={trade.id} className="panel trade-history-card">
                <div className="panel-heading">
                  <div>
                    <span className="badge">{humanize(trade.status)}</span>
                    <h3>
                      {trade.direction === "incoming"
                        ? "Incoming offer"
                        : trade.direction === "outgoing"
                          ? "Sent offer"
                          : "Trade offer"}
                    </h3>
                    <PlayerIdentity
                      player={counterpartyIdentities[trade.counterpartySteamId] ?? {
                        steamId: trade.counterpartySteamId,
                        displayName: trade.counterpartySteamId,
                        avatarUrl: null,
                        presence: "unknown",
                        profileThemeKey: null,
                        identityGroups: [],
                      }}
                      variant="compact"
                    />
                  </div>
                </div>
                <TradeItems
                  title="They offer"
                  items={
                    trade.direction === "incoming"
                      ? trade.offeredItems
                      : trade.requestedItems
                  }
                  tokens={
                    trade.direction === "incoming"
                      ? trade.offeredTokens
                      : trade.requestedTokens
                  }
                />
                <TradeItems
                  title="You offer"
                  items={
                    trade.direction === "incoming"
                      ? trade.requestedItems
                      : trade.offeredItems
                  }
                  tokens={
                    trade.direction === "incoming"
                      ? trade.requestedTokens
                      : trade.offeredTokens
                  }
                />
                {trade.createdAt &&
                !Number.isNaN(new Date(trade.createdAt).getTime()) ? (
                  <p className="empty-copy">
                    Created{" "}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(trade.createdAt))}
                  </p>
                ) : null}
                {trade.status.toLowerCase() === "pending" &&
                trade.direction === "incoming" ? (
                  <div className="hero-actions">
                    <AsyncButton
                      type="button"
                      className="button button-primary"
                      disabled={pending}
                      pending={pendingAction === `accept:${trade.id}`}
                      pendingLabel="Accepting"
                      icon={<Check aria-hidden="true" />}
                      onClick={() => respond(trade.id, "accept")}
                    >
                      Accept
                    </AsyncButton>
                    <AsyncButton
                      type="button"
                      className="button button-secondary"
                      disabled={pending}
                      pending={pendingAction === `reject:${trade.id}`}
                      pendingLabel="Declining"
                      icon={<X aria-hidden="true" />}
                      onClick={() => respond(trade.id, "reject")}
                    >
                      Decline
                    </AsyncButton>
                  </div>
                ) : null}
                {trade.status.toLowerCase() === "pending" &&
                trade.direction === "outgoing" ? (
                  <div className="hero-actions">
                    <AsyncButton
                      type="button"
                      className="button button-secondary"
                      disabled={pending}
                      pending={pendingAction === `cancel:${trade.id}`}
                      pendingLabel="Cancelling"
                      icon={<X aria-hidden="true" />}
                      onClick={() => cancel(trade.id)}
                    >
                      Cancel offer
                    </AsyncButton>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EconomyEmptyState
            title="No trade offers yet"
            description="Find another player above to exchange eligible inventory items or Tokens."
          />
        )}
      </section>
    </section>
  );
}
