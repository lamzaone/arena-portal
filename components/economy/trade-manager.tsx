"use client";

import { ArrowLeftRight, Check, Coins, Send, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
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
  type EconomyTradeView,
} from "@/components/economy/economy-view-model";
import { TokenBalance } from "@/components/economy/token-balance";
import { PortalToast } from "@/components/success-toast";

type TradeManagerProps = {
  inventory: unknown;
  wallet: unknown;
  trades: unknown;
  csrf: string;
};

function parseItemIds(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => /^[A-Za-z0-9_-]{1,128}$/.test(entry)),
    ),
  ];
}

function validSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
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
        <>
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
                    className={
                      item.specialKind === "vip_membership"
                        ? "badge economy-special-badge"
                        : rarityClass(item.rarityRank)
                    }
                  >
                    {item.specialKind === "vip_membership" ? "Special" : item.rarity}
                  </span>
                  <strong>{item.displayName}</strong>
                  <p>
                    {item.specialKind === "vip_membership"
                      ? "VIP membership"
                      : humanize(item.itemType)}
                    {item.floatValue !== null
                      ? ` · Float ${item.floatValue.toFixed(6)}`
                      : ""}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <div className="tag-list trade-item-summary">
          {tokens ? (
            <span className="tag">
              <Coins aria-hidden="true" /> {formatTokens(tokens)} tokens
            </span>
          ) : null}
          {items.map((item) => (
            <span key={item.id} className="tag">
              {item.displayName} · {item.rarity}
            </span>
          ))}
          </div>
        </>
      ) : (
        <em>No items or tokens</em>
      )}
    </div>
  );
}

export function TradeManager({
  inventory,
  wallet,
  trades,
  csrf,
}: TradeManagerProps) {
  const router = useRouter();
  const inventoryItems = useMemo(() => economyItems(inventory), [inventory]);
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const tradeList = useMemo(() => economyTrades(trades), [trades]);
  const tradableItems = useMemo(
    () => inventoryItems.filter(itemIsTradable),
    [inventoryItems],
  );
  const [recipientSteamId, setRecipientSteamId] = useState("");
  const [offeredItemIds, setOfferedItemIds] = useState<string[]>([]);
  const [requestedItemIds, setRequestedItemIds] = useState("");
  const [offeredTokens, setOfferedTokens] = useState("0");
  const [requestedTokens, setRequestedTokens] = useState("0");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleOfferedItem(itemId: string) {
    setOfferedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function numericValue(value: string) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  function submitTrade() {
    const normalizedRecipient = recipientSteamId.trim();
    const tokensOffered = numericValue(offeredTokens);
    const tokensRequested = numericValue(requestedTokens);
    const requestedIds = parseItemIds(requestedItemIds);
    if (!validSteamId(normalizedRecipient)) {
      setNotice({
        type: "error",
        text: "Enter the other player's 17-digit SteamID64.",
      });
      return;
    }
    if (
      !offeredItemIds.length &&
      !tokensOffered &&
      !requestedIds.length &&
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
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/trades/create",
          csrf,
          {
            counterpartySteamId: normalizedRecipient,
            offeredItemIds,
            requestedItemIds: requestedIds,
            offeredTokens: tokensOffered,
            requestedTokens: tokensRequested,
          },
        );
        setNotice({
          type: "success",
          text: result.message || "Trade offer sent.",
        });
        setOfferedItemIds([]);
        setRequestedItemIds("");
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
      }
    });
  }

  function respond(tradeId: string, decision: "accept" | "reject") {
    setNotice(null);
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
      }
    });
  }

  function cancel(tradeId: string) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/trades/cancel",
          csrf,
          { tradeId },
        );
        setNotice({
          type: "success",
          text: result.message || "Trade offer cancelled.",
        });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "The trade could not be cancelled.",
        });
      }
    });
  }

  return (
    <section aria-label="Player trading">
      <div className="content-grid">
        <div className="panel">
          <p className="eyebrow">
            <ArrowLeftRight aria-hidden="true" /> Player trades
          </p>
          <h2>Trade items or tokens directly.</h2>
          <p className="empty-copy">
            Offers reserve the included inventory items and tokens while they
            are pending. The recipient can accept or decline from their own
            portal.
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

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>Create trade offer</h2>
          <p>
            Use a SteamID64 and owned inventory items. To request a specific
            item, ask its owner to copy the Trade ID from their Inventory; every
            offer is still verified on the server.
          </p>
        </div>
        <div className="form-grid">
          <label htmlFor="trade-recipient">
            Recipient SteamID64
            <input
              id="trade-recipient"
              type="text"
              inputMode="numeric"
              value={recipientSteamId}
              onChange={(event) => setRecipientSteamId(event.target.value)}
              placeholder="7656119…"
            />
          </label>
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
            />
          </label>
          <label htmlFor="trade-requested-items">
            Requested Trade IDs (optional)
            <input
              id="trade-requested-items"
              type="text"
              value={requestedItemIds}
              onChange={(event) => setRequestedItemIds(event.target.value)}
              placeholder="Paste IDs shared by the other player"
            />
            <small>
              Owners can copy a Trade ID from their Inventory item-management
              panel.
            </small>
          </label>
        </div>
        <fieldset className="trade-offer-items">
          <legend>
            <span>Items you offer</span>
            <small>{offeredItemIds.length} selected</small>
          </legend>
          {tradableItems.length ? (
            <div className="trade-offer-picker">
              {tradableItems.map((item) => (
                <div key={item.id} className="trade-offer-item-wrap">
                  <button
                    type="button"
                    className={`trade-offer-item ${offeredItemIds.includes(item.id) ? "is-selected" : ""}`}
                    aria-pressed={offeredItemIds.includes(item.id)}
                    onClick={() => toggleOfferedItem(item.id)}
                  >
                    <MarketplaceItemPreview item={item} enableMarketPreview />
                    <span className="trade-offer-item-copy">
                      <span className={rarityClass(item.rarityRank)}>
                        {item.rarity}
                      </span>
                      <strong>{item.displayName}</strong>
                      <small>
                        {humanize(item.itemType)}
                        {item.floatValue !== null
                          ? ` · ${item.floatValue.toFixed(6)} float`
                          : ""}
                      </small>
                    </span>
                    <span className="trade-offer-selection">
                      {offeredItemIds.includes(item.id)
                        ? "Included"
                        : "Add item"}
                    </span>
                  </button>
                  <label className="tag">
                  <input
                    type="checkbox"
                    checked={offeredItemIds.includes(item.id)}
                    onChange={() => toggleOfferedItem(item.id)}
                  />{" "}
                  {item.displayName} · {item.rarity}
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              No currently tradable items. Equipped, reserved, or non-tradable
              items cannot be offered.
            </p>
          )}
        </fieldset>
        <div className="hero-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={pending}
            onClick={submitTrade}
          >
            <Send aria-hidden="true" />{" "}
            {pending ? "Sending…" : "Send trade offer"}
          </button>
        </div>
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
                    <p>{trade.counterpartySteamId}</p>
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
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={pending}
                      onClick={() => respond(trade.id, "accept")}
                    >
                      <Check aria-hidden="true" /> Accept
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={pending}
                      onClick={() => respond(trade.id, "reject")}
                    >
                      <X aria-hidden="true" /> Decline
                    </button>
                  </div>
                ) : null}
                {trade.status.toLowerCase() === "pending" &&
                trade.direction === "outgoing" ? (
                  <div className="hero-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={pending}
                      onClick={() => cancel(trade.id)}
                    >
                      <X aria-hidden="true" /> Cancel offer
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EconomyEmptyState
            title="No trade offers yet"
            description="Create an offer above to trade your eligible inventory items or tokens with another player."
          />
        )}
      </section>
    </section>
  );
}
