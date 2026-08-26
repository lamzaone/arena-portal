"use client";

import { Box, Gift, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  EconomyEmptyState,
  EconomyItemCard,
} from "@/components/economy/economy-item-card";
import { postEconomyAction } from "@/components/economy/economy-request";
import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  economyCrates,
  economyItems,
  economyWallet,
  formatTokens,
  humanize,
  rarityClass,
  toEconomyItem,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { TokenBalance } from "@/components/economy/token-balance";

type CrateOpenerProps = {
  crates: unknown;
  inventory: unknown;
  wallet: unknown;
  csrf: string;
};

function isCrate(item: EconomyItemView) {
  return ["crate", "case", "capsule"].includes(item.itemType);
}

export function CrateOpener({
  crates,
  inventory,
  wallet,
  csrf,
}: CrateOpenerProps) {
  const router = useRouter();
  const crateCatalogue = useMemo(() => economyCrates(crates), [crates]);
  const ownedCrates = useMemo(
    () => economyItems(inventory).filter(isCrate),
    [inventory],
  );
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const [selectedCrateId, setSelectedCrateId] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [unboxed, setUnboxed] = useState<EconomyItemView | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedCrate =
    ownedCrates.find((item) => item.id === selectedCrateId) ?? null;
  const selectedCratePrice =
    selectedCrate?.cratePriceTokens ?? selectedCrate?.marketPriceTokens ?? null;

  function openCrate() {
    if (!selectedCrate) return;
    setNotice(null);
    setUnboxed(null);
    startTransition(async () => {
      try {
        const result = await postEconomyAction("/api/economy/crates/open", csrf, {
          crateItemId: selectedCrate.id,
        });
        const resultItem = result.item ? toEconomyItem(result.item) : null;
        setUnboxed(
          resultItem?.id || resultItem?.displayName !== "Unnamed item"
            ? resultItem
            : null,
        );
        setNotice({
          type: "success",
          text: result.message || "Crate opened. The item is now in your inventory.",
        });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error ? error.message : "The crate could not be opened.",
        });
      }
    });
  }

  return (
    <section aria-label="Crate opening">
      <div className="content-grid">
        <div className="panel">
          <p className="eyebrow">
            <Gift aria-hidden="true" /> Crate opening
          </p>
          <h2>Open crates without a key.</h2>
          <p className="empty-copy">
            Select a crate from your inventory and reveal one random item.
            Cases and capsules can also be acquired in the market for their
            listed token price.
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

      {unboxed ? (
        <section className="panel unboxed-reveal" aria-live="polite">
          <div>
            <p className="eyebrow">
              <Sparkles aria-hidden="true" /> Unboxed item
            </p>
            <h2>Added to your inventory</h2>
            <p className="empty-copy">
              Your new item is ready to inspect, equip, trade, or customize
              from Inventory.
            </p>
          </div>
          <EconomyItemCard item={unboxed} enableMarketPreview />
        </section>
      ) : null}

      <section className="history-section crate-picker-section">
        <div className="section-heading compact">
          <p className="eyebrow">
            <Box aria-hidden="true" /> Your crates
          </p>
          <h2>Choose one to open</h2>
        </div>
        {ownedCrates.length ? (
          <div className="crate-opening-layout">
            <div className="feature-grid crate-item-grid">
              {ownedCrates.map((crate) => (
                <EconomyItemCard
                  key={crate.id}
                  item={crate}
                  selected={selectedCrateId === crate.id}
                  onSelect={() => setSelectedCrateId(crate.id)}
                  selectionLabel={`Select ${crate.displayName} to open`}
                  enableMarketPreview
                />
              ))}
            </div>
            <aside className="panel crate-opening-stage" aria-live="polite">
              {selectedCrate ? (
                <>
                  <MarketplaceItemPreview
                    item={selectedCrate}
                    enableMarketPreview
                  />
                  <div className="crate-opening-stage-copy">
                    <span className={rarityClass(selectedCrate.rarityRank)}>
                      {selectedCrate.rarity}
                    </span>
                    <h3>{selectedCrate.displayName}</h3>
                    <p>
                      {selectedCrate.description ??
                        `Ready to open this ${humanize(selectedCrate.itemType)}.`}
                    </p>
                    <div className="tag-list">
                      {selectedCratePrice !== null ? (
                        <span className="tag">
                          {formatTokens(selectedCratePrice)} token market rate
                        </span>
                      ) : null}
                      {selectedCrate.floatValue !== null ? (
                        <span className="tag">
                          Float {selectedCrate.floatValue.toFixed(6)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button-primary button-large"
                    disabled={pending}
                    onClick={openCrate}
                  >
                    {pending ? "Opening…" : `Open ${selectedCrate.displayName}`}
                  </button>
                </>
              ) : (
                <div className="crate-selection-empty">
                  <Gift aria-hidden="true" />
                  <h3>Select a crate</h3>
                  <p>
                    Choose an owned case or capsule to inspect it here, then
                    open it without a key.
                  </p>
                </div>
              )}
            </aside>
          </div>
        ) : (
          <EconomyEmptyState
            title="You do not have a crate yet"
            description="Crates can arrive as match drops, hourly drops, map-end drops, or direct marketplace purchases."
            icon={<Gift aria-hidden="true" />}
          />
        )}
      </section>

      <section className="history-section">
        <div className="section-heading compact">
          <p className="eyebrow">Crate catalogue</p>
          <h2>Possible cases and capsules</h2>
          <p>
            Crate prices are the required half-price Token rate derived from
            their last recorded market value.
          </p>
        </div>
        {crateCatalogue.length ? (
          <div className="feature-grid crate-catalogue-grid">
            {crateCatalogue.map((crate) => (
              <EconomyItemCard
                key={`${crate.catalogueId ?? crate.id}-${crate.displayName}`}
                item={crate}
                enableMarketPreview
                actions={
                  <span className="tag">
                    {crate.priceTokens === null
                      ? "Price unavailable"
                      : `${formatTokens(crate.priceTokens)} tokens · half-price crate`}
                    {crate.possibleItems
                      ? ` · ${crate.possibleItems} possible items`
                      : ""}
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <p className="empty-copy">
            The current crate catalogue has not been published by the economy
            service yet.
          </p>
        )}
      </section>
    </section>
  );
}
