"use client";

import { LoaderCircle, Trophy } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import { PaginatedItemGrid } from "@/components/economy/item-grid";
import {
  formatTokens,
  rarityClass,
  rarityName,
  rarityRankClass,
  toEconomyItem,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { SearchField } from "@/components/ui/search-field";
import {
  crateDropStateFromResponse,
  formatCrateDropRate,
  sortCrateDrops,
  type CrateDrop,
  type CrateDropState,
} from "@/lib/economy/crate-presentation";

const DISPLAYED_RARITY_RANKS = [3, 4, 5, 6, 7] as const;

export type EconomyCrateDrop = CrateDrop<EconomyItemView>;
export type EconomyCrateDropState = CrateDropState<EconomyItemView>;

function normalizedText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function economyCrateDropStateFromResponse(
  value: unknown,
): EconomyCrateDropState {
  return crateDropStateFromResponse(value, toEconomyItem);
}

function responseMessage(value: unknown) {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).message === "string"
    ? ((value as Record<string, unknown>).message as string).trim()
    : "";
}

export function CrateDropPreview({
  catalogueId,
  state,
  onStateChange,
}: {
  catalogueId?: number | null;
  state?: EconomyCrateDropState;
  onStateChange?: (state: EconomyCrateDropState) => void;
}) {
  const [loadedState, setLoadedState] = useState<EconomyCrateDropState>({
    status: "idle",
  });

  useEffect(() => {
    if (state !== undefined) return;
    if (!catalogueId) {
      setLoadedState({
        status: "error",
        message: "This container has no catalogue drop pool.",
      });
      return;
    }
    const controller = new AbortController();
    setLoadedState({ status: "loading" });
    void (async () => {
      try {
        const response = await fetch(
          `/api/economy/crates/${catalogueId}/drops`,
          {
            credentials: "same-origin",
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            responseMessage(payload) || "Crate odds are temporarily unavailable.",
          );
        }
        setLoadedState(economyCrateDropStateFromResponse(payload));
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadedState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Crate odds are temporarily unavailable.",
        });
      }
    })();
    return () => controller.abort();
  }, [catalogueId, state]);

  const visibleState = state ?? loadedState;

  useEffect(() => {
    onStateChange?.(visibleState);
  }, [onStateChange, visibleState]);

  if (visibleState.status === "idle") return null;
  if (visibleState.status === "loading") {
    return (
      <div className="crate-odds-loading" aria-live="polite">
        <LoaderCircle aria-hidden="true" />
        <span>Loading possible drops and their rates...</span>
      </div>
    );
  }
  if (visibleState.status === "empty" || visibleState.status === "error") {
    return (
      <p
        className="crate-odds-unavailable"
        role={visibleState.status === "error" ? "alert" : undefined}
      >
        {visibleState.message}
      </p>
    );
  }
  return (
    <CrateDropPreviewReady
      key={catalogueId ?? visibleState.drops[0]?.lootEntryId}
      totalWeight={visibleState.totalWeight}
      drops={visibleState.drops}
    />
  );
}

function CrateDropPreviewReady({
  totalWeight,
  drops,
}: {
  totalWeight: number;
  drops: EconomyCrateDrop[];
}) {
  const searchId = `crate-drop-search-${useId().replaceAll(":", "")}`;
  const [rarityFilter, setRarityFilter] = useState("all");
  const [query, setQuery] = useState("");
  const queryTerms = useMemo(
    () => normalizedText(query).split(" ").filter(Boolean),
    [query],
  );
  const rarityGroups = useMemo(
    () =>
      DISPLAYED_RARITY_RANKS.map((rank) => {
        const matching = drops.filter(
          (drop) => drop.item.rarityRank === rank,
        );
        const weight = matching.reduce((total, drop) => total + drop.weight, 0);
        return { rank, count: matching.length, weight };
      }),
    [drops],
  );
  const filteredDrops = useMemo(
    () =>
      sortCrateDrops(drops).filter(
        (drop) =>
          (rarityFilter === "all" ||
            drop.item.rarityRank === Number(rarityFilter)) &&
          (!queryTerms.length ||
            queryTerms.every((term) =>
              normalizedText(
                [
                  drop.item.displayName,
                  drop.item.marketHashName ?? "",
                  drop.item.itemType,
                  drop.item.rarity,
                ].join(" "),
              ).includes(term),
            )),
      ),
    [drops, queryTerms, rarityFilter],
  );
  return (
    <section className="crate-drop-odds" aria-label="Possible crate drops">
      <header>
        <div>
          <p className="eyebrow">
            <Trophy aria-hidden="true" /> Verified crate odds
          </p>
          <h3>Possible drops</h3>
        </div>
        <span>{drops.length.toLocaleString()} outcomes</span>
      </header>
      <p className="empty-copy">
        These are the active server entries. Select a rarity or search a finish
        to browse the full pool; displayed percentages are the actual per-item
        chance.
      </p>
      <div className="crate-drop-tier-tabs" aria-label="Filter crate drops by rarity">
        <button
          type="button"
          aria-pressed={rarityFilter === "all"}
          className={rarityFilter === "all" ? "active" : ""}
          onClick={() => setRarityFilter("all")}
        >
          All <span>100%</span>
        </button>
        {rarityGroups.map((group) => (
          <button
            key={group.rank}
            type="button"
            aria-pressed={rarityFilter === String(group.rank)}
            className={`${rarityRankClass(group.rank)} ${rarityFilter === String(group.rank) ? "active" : ""}`}
            onClick={() => setRarityFilter(String(group.rank))}
            disabled={group.count === 0}
          >
            <span>{rarityName(group.rank)}</span>
            <small>{((group.weight / totalWeight) * 100).toFixed(2)}%</small>
          </button>
        ))}
      </div>
      <div className="crate-drop-toolbar">
        <SearchField
          id={searchId}
          label="Search this crate"
          value={query}
          onValueChange={setQuery}
          placeholder="Butterfly, Fade, AK-47..."
          autoComplete="off"
        />
        <p aria-live="polite">
          {filteredDrops.length
            ? `${filteredDrops.length.toLocaleString()} drops match this filter`
            : "No drops match this filter"}
        </p>
      </div>
      {filteredDrops.length ? (
        <PaginatedItemGrid className="crate-drop-grid" label="Possible crate drops" resetKey={`${query}:${rarityFilter}`}>
          {filteredDrops.map((drop) => (
            <article
              key={drop.lootEntryId}
              className={`crate-drop-card ${rarityRankClass(drop.item.rarityRank)}`}
            >
              <MarketplaceItemPreview
                item={drop.item}
                enableMarketPreview
                floatValue={drop.minFloat ?? drop.item.minFloat}
              />
              <div>
                <span className={rarityClass(drop.item.rarityRank)}>
                  {drop.item.rarity}
                </span>
                <h4>{drop.item.displayName}</h4>
                <strong>{formatCrateDropRate(drop, totalWeight)}%</strong>
                <small>
                  {formatTokens(drop.weight)} of {formatTokens(totalWeight)} weight
                </small>
                {drop.minFloat !== null || drop.maxFloat !== null ? (
                  <small>
                    Float {(drop.minFloat ?? drop.maxFloat ?? 0).toFixed(2)} -{" "}
                    {(drop.maxFloat ?? drop.minFloat ?? 1).toFixed(2)}
                  </small>
                ) : null}
                {drop.stattrakChanceBps ? (
                  <small>
                    StatTrak chance {(drop.stattrakChanceBps / 100).toFixed(2)}%
                  </small>
                ) : null}
              </div>
            </article>
          ))}
        </PaginatedItemGrid>
      ) : (
        <p className="crate-odds-unavailable">No possible drops match this filter.</p>
      )}
    </section>
  );
}
