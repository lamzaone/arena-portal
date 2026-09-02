"use client";

import {
  ChevronDown,
  Gift,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";

import {
  CrateDropPreview,
  economyCrateDropStateFromResponse,
  type EconomyCrateDrop as CrateDrop,
  type EconomyCrateDropState as CrateDropState,
} from "@/components/economy/crate-drop-preview";
import {
  createEconomyIdempotencyKey,
  postEconomyAction,
  type EconomyActionResult,
} from "@/components/economy/economy-request";
import { EconomyItemCard } from "@/components/economy/economy-item-card";
import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  humanize,
  rarityClass,
  rarityName,
  rarityRankClass,
  toEconomyItem,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { ECONOMY_SPECIAL_RARITY_RANK } from "@/lib/economy/item-taxonomy";
import {
  isOpenableInventoryCrate,
  partitionCrateOpeningIds,
  runSequentialCrateOpeningGroups,
} from "@/lib/economy/inventory-selection";

type OpeningState =
  | {
      phase: "verifying";
      crate: EconomyItemView;
      drops: CrateDrop[];
      run: number;
    }
  | {
      phase: "revealing";
      crate: EconomyItemView;
      reward: EconomyItemView;
      rewardLootEntryId: number | null;
      drops: CrateDrop[];
      run: number;
    };

export type BulkOpeningRow = {
  crate: EconomyItemView;
  status: "queued" | "verifying" | "revealing" | "complete" | "failed";
  opening: OpeningState | null;
  reward: EconomyItemView | null;
  message: string | null;
  error: string | null;
};

export type SingleCrateOpeningState = {
  crate: EconomyItemView | null;
  dropState: CrateDropState;
  opening: OpeningState | null;
  reward: EconomyItemView | null;
  rewardMessage: string | null;
  error: string | null;
};

export type CrateOpeningRequestGroup = {
  crateItemIds: string[];
  signature: string;
  idempotencyKey: string;
};

export type BulkCrateOpeningSession = {
  crates: EconomyItemView[];
  groups: CrateOpeningRequestGroup[];
  currentGroupIndex: number;
  completedCount: number;
  rows: BulkOpeningRow[];
  status: "running" | "failed" | "complete";
  error: string | null;
};

export type InventoryCrateOpeningController = {
  busy: boolean;
  consumedItemIds: ReadonlySet<string>;
  retainedSingleCrate: EconomyItemView | null;
  single: SingleCrateOpeningState;
  bulk: BulkCrateOpeningSession | null;
  prepareSingle(crate: EconomyItemView | null): void;
  setSingleDropState(crateId: string, state: CrateDropState): void;
  openSingle(crate: EconomyItemView): Promise<void>;
  completeSingleReveal(): void;
  dismissSingle(): void;
  openBulk(crates: readonly EconomyItemView[]): Promise<void>;
  retryRemaining(): Promise<void>;
  completeBulkReveal(crateId: string): void;
  dismissBulk(): void;
  playTick(): void;
};

const FINAL_REEL_DURATION_MS = 4_800;
const REDUCED_MOTION_FINAL_REEL_DURATION_MS = 1_500;
const REEL_ITEM_WIDTH_PX = 132;
const REEL_ITEM_GAP_PX = 10;
const REEL_ITEM_PITCH_PX = REEL_ITEM_WIDTH_PX + REEL_ITEM_GAP_PX;
const VERIFYING_REEL_LOOP_LENGTH = 18;
const VERIFYING_REEL_REPETITIONS = 4;
const REVEAL_WINNER_INDEX = 32;
const REVEAL_REEL_LENGTH = 42;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number | null = null) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function crateLootPresentation(item: EconomyItemView): EconomyItemView {
  if (item.itemType !== "knife" && item.itemType !== "glove") return item;
  return { ...item, rarityRank: 6, rarity: rarityName(6) };
}

function dropHeadline(rarityRank: number) {
  if (rarityRank >= ECONOMY_SPECIAL_RARITY_RANK) return "Special unbox";
  if (rarityRank >= 7) return "Extraordinary unbox";
  if (rarityRank >= 6) return "Covert unbox";
  if (rarityRank >= 5) return "Classified unbox";
  if (rarityRank >= 4) return "Restricted unbox";
  return "Crate reward";
}

function rewardWithDropArtwork(
  reward: EconomyItemView,
  drops: CrateDrop[],
  rewardLootEntryId: number | null = null,
) {
  const matchingDrop =
    (rewardLootEntryId === null
      ? null
      : drops.find((drop) => drop.lootEntryId === rewardLootEntryId)) ??
    drops.find((drop) => drop.item.catalogueId === reward.catalogueId);
  if (!matchingDrop) return crateLootPresentation(reward);
  return crateLootPresentation({
    ...matchingDrop.item,
    ...reward,
    rarityRank: matchingDrop.item.rarityRank,
    rarity: matchingDrop.item.rarity,
    imageUrl: reward.imageUrl ?? matchingDrop.item.imageUrl,
  });
}

function reelDropForIndex(drops: CrateDrop[], index: number, run: number) {
  const totalWeight = drops.reduce((total, drop) => total + drop.weight, 0);
  if (totalWeight <= 0) return null;
  let seed = (run ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35) >>> 0;
  const unit = ((seed ^ (seed >>> 16)) >>> 0) / 0x1_0000_0000;
  let remaining = unit * totalWeight;
  for (const drop of drops) {
    if (remaining < drop.weight) return drop;
    remaining -= drop.weight;
  }
  return drops[drops.length - 1] ?? null;
}

function reelPointerIndex(translateX: number) {
  return Math.max(
    0,
    Math.floor(
      (-translateX - REEL_ITEM_WIDTH_PX / 2) / REEL_ITEM_PITCH_PX + 0.0001,
    ),
  );
}

function translateXFromTransform(transform: string) {
  if (!transform || transform === "none") return -REEL_ITEM_WIDTH_PX / 2;
  const values = transform.match(/^matrix\((.+)\)$/)?.[1]
    .split(",")
    .map((value) => Number(value.trim()));
  if (values?.length === 6 && Number.isFinite(values[4])) return values[4];
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/)?.[1]
    .split(",")
    .map((value) => Number(value.trim()));
  return matrix3d?.length === 16 && Number.isFinite(matrix3d[12])
    ? matrix3d[12]
    : -REEL_ITEM_WIDTH_PX / 2;
}

function revealDuration() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_MOTION_FINAL_REEL_DURATION_MS
    : FINAL_REEL_DURATION_MS;
}

function CrateOpeningAnimation({
  opening,
  onRevealComplete,
  onTick,
}: {
  opening: OpeningState;
  onRevealComplete?: () => void;
  onTick?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const reel = useMemo(() => {
    const fallback =
      opening.phase === "revealing" ? opening.reward : opening.crate;
    const reelLength =
      opening.phase === "revealing"
        ? REVEAL_REEL_LENGTH
        : VERIFYING_REEL_LOOP_LENGTH * VERIFYING_REEL_REPETITIONS;
    return Array.from({ length: reelLength }, (_, index) =>
      opening.phase === "revealing" && index === REVEAL_WINNER_INDEX
        ? rewardWithDropArtwork(
            opening.reward,
            opening.drops,
            opening.rewardLootEntryId,
          )
        : reelDropForIndex(
              opening.drops,
              opening.phase === "verifying"
                ? index % VERIFYING_REEL_LOOP_LENGTH
                : index,
              opening.run,
            )?.item ?? fallback,
    );
  }, [opening]);
  const isVerifying = opening.phase === "verifying";
  const reelStyle = {
    "--reel-start-offset": `${-(REEL_ITEM_WIDTH_PX / 2)}px`,
    "--reel-loop-offset": `${-(
      VERIFYING_REEL_LOOP_LENGTH * REEL_ITEM_PITCH_PX +
      REEL_ITEM_WIDTH_PX / 2
    )}px`,
    "--reel-final-offset": `${-(
      REVEAL_WINNER_INDEX * REEL_ITEM_PITCH_PX + REEL_ITEM_WIDTH_PX / 2
    )}px`,
  } as CSSProperties;

  useEffect(() => {
    if (!onTick) return;
    let animationFrame = 0;
    let previousIndex = 0;
    const tickOnPassedItems = () => {
      const track = trackRef.current;
      if (track) {
        const currentIndex = reelPointerIndex(
          translateXFromTransform(getComputedStyle(track).transform),
        );
        if (currentIndex > previousIndex) onTick();
        previousIndex = currentIndex;
      }
      animationFrame = window.requestAnimationFrame(tickOnPassedItems);
    };
    animationFrame = window.requestAnimationFrame(tickOnPassedItems);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [onTick, opening.phase, opening.run]);

  return (
    <section
      className={`crate-opening-animation reeling ${isVerifying ? "is-verifying" : "is-revealing"}`}
      aria-live="polite"
    >
      <div className="crate-opening-pointer" aria-hidden="true" />
      <div className="crate-opening-reel-window">
        <div
          ref={trackRef}
          key={`${opening.run}-${opening.phase}`}
          className={`crate-opening-reel-track ${isVerifying ? "is-verifying" : "is-revealing"}`}
          style={reelStyle}
          onAnimationEnd={(event) => {
            if (!isVerifying && event.target === event.currentTarget)
              onRevealComplete?.();
          }}
        >
          {reel.map((item, index) => (
            <article
              key={`${opening.run}-${opening.phase}-${index}`}
              className={`crate-opening-reel-item ${
                !isVerifying && index === REVEAL_WINNER_INDEX ? "winner" : ""
              } ${rarityRankClass(item.rarityRank)}`}
            >
              <MarketplaceItemPreview item={item} enableMarketPreview={false} />
              <span>{item.displayName}</span>
            </article>
          ))}
        </div>
      </div>
      {isVerifying ? (
        <p aria-label="Opening crate">
          <LoaderCircle aria-hidden="true" className="crate-opening-spinner" />
        </p>
      ) : null}
    </section>
  );
}

function rewardMessage(reward: EconomyItemView, message: string | null) {
  return (
    <section
      className={`crate-inline-reward crate-drop-reveal ${rarityRankClass(reward.rarityRank)}`}
      aria-live="polite"
    >
      <div className="crate-inline-reward-copy">
        <p className="eyebrow">
          <Trophy aria-hidden="true" /> {dropHeadline(reward.rarityRank)}
        </p>
        <h3>{reward.displayName}</h3>
        <p className="empty-copy">Added to your Inventory.</p>
        <span className={rarityClass(reward.rarityRank)}>{reward.rarity}</span>
        {reward.rarityRank >= 4 ? (
          <p className="crate-global-drop-note">
            <Sparkles aria-hidden="true" /> Pink-and-above unboxes are
            announced in global chat while you are online.
          </p>
        ) : null}
        {message ? (
          <p className="crate-inline-reward-notice" role="status">
            <Sparkles aria-hidden="true" /> {message}
          </p>
        ) : null}
      </div>
      <EconomyItemCard item={reward} enableMarketPreview />
    </section>
  );
}

function initialSingleState(
  crate: EconomyItemView | null = null,
): SingleCrateOpeningState {
  return {
    crate,
    dropState: { status: "idle" },
    opening: null,
    reward: null,
    rewardMessage: null,
    error: null,
  };
}

function resolveBulkRows(
  crates: readonly EconomyItemView[],
  result: EconomyActionResult,
  run: number,
) {
  const dropsByCatalogueId = new Map<number, CrateDrop[]>();
  for (const rawPool of result.dropPools ?? []) {
    if (!isRecord(rawPool)) continue;
    const catalogueId = finiteNumber(rawPool.containerCatalogueId);
    if (catalogueId === null || !Number.isSafeInteger(catalogueId)) continue;
    const state = economyCrateDropStateFromResponse(rawPool);
    if (state.status === "ready")
      dropsByCatalogueId.set(catalogueId, state.drops);
  }
  const openingsByCrateId = new Map<string, Record<string, unknown>>();
  for (const rawOpening of result.openings ?? []) {
    if (!isRecord(rawOpening) || typeof rawOpening.crateItemId !== "string")
      continue;
    openingsByCrateId.set(rawOpening.crateItemId, rawOpening);
  }

  return crates.map((crate, index) => {
    if (crate.catalogueId === null)
      throw new Error("This crate is missing its catalogue drop pool.");
    const drops = dropsByCatalogueId.get(crate.catalogueId);
    const rawOpening = openingsByCrateId.get(crate.id);
    if (!drops?.length || !rawOpening)
      throw new Error(
        "The crates opened, but their reveal summary was incomplete. Reload Inventory to verify the rewards.",
      );
    const resultItem = rawOpening.item ? toEconomyItem(rawOpening.item) : null;
    if (
      !resultItem ||
      (!resultItem.id && resultItem.displayName === "Unnamed item")
    ) {
      throw new Error(
        "A crate opened, but its reward could not be displayed. Reload Inventory to verify it.",
      );
    }
    const rawLootEntryId = finiteNumber(rawOpening.rewardLootEntryId);
    const rewardLootEntryId =
      rawLootEntryId !== null && Number.isSafeInteger(rawLootEntryId)
        ? rawLootEntryId
        : null;
    const reward = rewardWithDropArtwork(
      resultItem,
      drops,
      rewardLootEntryId,
    );
    return {
      crate,
      status: "revealing" as const,
      opening: {
        phase: "revealing" as const,
        crate,
        reward,
        rewardLootEntryId,
        drops,
        run: run + index,
      },
      reward,
      message:
        rawOpening.globalAnnouncementQueued === true
          ? `${reward.displayName} was unboxed and announced in global chat.`
          : typeof rawOpening.message === "string"
            ? rawOpening.message
            : "Crate opened. The item is now in your Inventory.",
      error: null,
    } satisfies BulkOpeningRow;
  });
}

export function useInventoryCrateOpening({
  csrf,
}: {
  csrf: string;
}): InventoryCrateOpeningController {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [consumedItemIds, setConsumedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [single, setSingle] = useState<SingleCrateOpeningState>(() =>
    initialSingleState(),
  );
  const [bulk, setBulk] = useState<BulkCrateOpeningSession | null>(null);
  const bulkRef = useRef<BulkCrateOpeningSession | null>(null);
  const singleRequestRef = useRef<{
    crateId: string;
    idempotencyKey: string;
  } | null>(null);
  const singleRevealTimer = useRef<number | null>(null);
  const completeSingleRef = useRef<(() => void) | null>(null);
  const bulkDelayTimer = useRef<number | null>(null);
  const completeBulkDelayRef = useRef<(() => void) | null>(null);
  const reelAudio = useRef<AudioContext | null>(null);
  const reelTickCount = useRef(0);

  const updateBulk = useCallback(
    (
      update: (
        current: BulkCrateOpeningSession,
      ) => BulkCrateOpeningSession,
    ) => {
      setBulk((current) => {
        if (!current) return current;
        const next = update(current);
        bulkRef.current = next;
        return next;
      });
    },
    [],
  );

  const prepareAudio = useCallback(() => {
    try {
      const context = reelAudio.current ?? new AudioContext();
      reelAudio.current = context;
      if (context.state === "suspended")
        void context.resume().catch(() => undefined);
    } catch {
      // Audio is an enhancement; the authoritative opening still proceeds.
    }
  }, []);

  const playTick = useCallback(() => {
    const context = reelAudio.current;
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    const tick = reelTickCount.current++;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(tick % 3 === 0 ? 760 : 980, now);
    oscillator.frequency.exponentialRampToValueAtTime(510, now + 0.026);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.034);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, []);

  const prepareSingle = useCallback((crate: EconomyItemView | null) => {
    setSingle((current) => {
      if (current.crate?.id === crate?.id) return current;
      singleRequestRef.current = null;
      return initialSingleState(crate);
    });
  }, []);

  const setSingleDropState = useCallback(
    (crateId: string, state: CrateDropState) => {
      setSingle((current) =>
        current.crate?.id === crateId ? { ...current, dropState: state } : current,
      );
    },
    [],
  );

  const completeSingleReveal = useCallback(() => {
    completeSingleRef.current?.();
  }, []);

  const openSingle = useCallback(
    async (crate: EconomyItemView) => {
      if (busyRef.current || !isOpenableInventoryCrate(crate)) return;
      if (
        single.crate?.id !== crate.id ||
        single.dropState.status !== "ready"
      ) {
        setSingle((current) => ({
          ...current,
          error: "The verified drop pool is still loading. Try again in a moment.",
        }));
        return;
      }
      const drops = [...single.dropState.drops];
      if (singleRequestRef.current?.crateId !== crate.id) {
        singleRequestRef.current = {
          crateId: crate.id,
          idempotencyKey: createEconomyIdempotencyKey(),
        };
      }
      const requestId = singleRequestRef.current.idempotencyKey;
      prepareAudio();
      busyRef.current = true;
      setBusy(true);
      setSingle((current) => ({
        ...current,
        opening: {
          phase: "verifying",
          crate,
          drops,
          run: Date.now(),
        },
        reward: null,
        rewardMessage: null,
        error: null,
      }));
      try {
        const result = await postEconomyAction(
          "/api/economy/crates/open",
          csrf,
          { crateItemId: crate.id },
          requestId,
        );
        const resultItem = result.item ? toEconomyItem(result.item) : null;
        if (
          !resultItem ||
          (!resultItem.id && resultItem.displayName === "Unnamed item")
        ) {
          throw new Error(
            "The crate opened, but its reward could not be displayed. Reload Inventory to verify it.",
          );
        }
        const rawLootEntryId = finiteNumber(result.rewardLootEntryId);
        const rewardLootEntryId =
          rawLootEntryId !== null && Number.isSafeInteger(rawLootEntryId)
            ? rawLootEntryId
            : null;
        const reward = rewardWithDropArtwork(
          resultItem,
          drops,
          rewardLootEntryId,
        );
        setConsumedItemIds((current) => new Set([...current, crate.id]));
        setSingle((current) => ({
          ...current,
          opening: {
            phase: "revealing",
            crate,
            reward,
            rewardLootEntryId,
            drops,
            run: Date.now(),
          },
          reward,
          rewardMessage:
            result.globalAnnouncementQueued === true
              ? `${reward.displayName} was unboxed and announced in global chat.`
              : result.message ?? "Crate opened. The item is now in your Inventory.",
        }));
        await new Promise<void>((resolve) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            if (singleRevealTimer.current !== null) {
              window.clearTimeout(singleRevealTimer.current);
              singleRevealTimer.current = null;
            }
            completeSingleRef.current = null;
            resolve();
          };
          completeSingleRef.current = finish;
          singleRevealTimer.current = window.setTimeout(
            finish,
            revealDuration() + 400,
          );
        });
        setSingle((current) => ({ ...current, opening: null }));
        singleRequestRef.current = null;
        router.refresh();
      } catch (error) {
        setSingle((current) => ({
          ...current,
          opening: null,
          error:
            error instanceof Error
              ? error.message
              : "The crate could not be opened.",
        }));
        router.refresh();
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [csrf, prepareAudio, router, single],
  );

  const dismissSingle = useCallback(() => {
    if (busyRef.current) return;
    singleRequestRef.current = null;
    setSingle(initialSingleState());
  }, []);

  const runBulk = useCallback(
    async (session: BulkCrateOpeningSession, startIndex: number) => {
      if (busyRef.current) return;
      busyRef.current = true;
      prepareAudio();
      setBusy(true);
      updateBulk((current) => ({
        ...current,
        currentGroupIndex: startIndex,
        status: "running",
        error: null,
      }));
      const cratesById = new Map(session.crates.map((crate) => [crate.id, crate]));
      let activeGroupIndex = startIndex;
      const result = await runSequentialCrateOpeningGroups({
        groups: session.groups,
        startIndex,
        openGroup: async (group, index) => {
          activeGroupIndex = index;
          const groupIds = new Set(group.crateItemIds);
          updateBulk((current) => ({
            ...current,
            currentGroupIndex: index,
            rows: current.rows.map((row) =>
              groupIds.has(row.crate.id)
                ? {
                    ...row,
                    status: "verifying",
                    opening: {
                      phase: "verifying",
                      crate: row.crate,
                      drops: [],
                      run: Date.now(),
                    },
                    error: null,
                  }
                : row,
            ),
          }));
          return postEconomyAction(
            "/api/economy/crates/open",
            csrf,
            { crateItemIds: group.crateItemIds },
            group.idempotencyKey,
          );
        },
        onGroupCompleted: async (group, response, index) => {
          const groupCrates = group.crateItemIds.map((crateId) => {
            const crate = cratesById.get(crateId);
            if (!crate)
              throw new Error("A selected crate is missing from this opening session.");
            return crate;
          });
          const resolved = resolveBulkRows(groupCrates, response, Date.now());
          const resolvedById = new Map(
            resolved.map((row) => [row.crate.id, row]),
          );
          const groupIds = new Set(group.crateItemIds);
          setConsumedItemIds(
            (current) => new Set([...current, ...group.crateItemIds]),
          );
          updateBulk((current) => ({
            ...current,
            rows: current.rows.map(
              (row) => resolvedById.get(row.crate.id) ?? row,
            ),
          }));
          await new Promise<void>((resolve) => {
            let finished = false;
            const finish = () => {
              if (finished) return;
              finished = true;
              if (bulkDelayTimer.current !== null) {
                window.clearTimeout(bulkDelayTimer.current);
                bulkDelayTimer.current = null;
              }
              completeBulkDelayRef.current = null;
              resolve();
            };
            completeBulkDelayRef.current = finish;
            bulkDelayTimer.current = window.setTimeout(
              finish,
              revealDuration() + 400,
            );
          });
          const completedCount = session.groups
            .slice(0, index + 1)
            .reduce((total, completedGroup) => total + completedGroup.crateItemIds.length, 0);
          updateBulk((current) => ({
            ...current,
            completedCount,
            currentGroupIndex: index + 1,
            rows: current.rows.map((row) =>
              groupIds.has(row.crate.id)
                ? { ...row, status: "complete", opening: null }
                : row,
            ),
          }));
        },
      });

      if (result.error) {
        const message =
          result.error instanceof Error
            ? result.error.message
            : "The remaining crates could not be opened.";
        const failedGroup = session.groups[activeGroupIndex];
        const failedIds = new Set(failedGroup?.crateItemIds ?? []);
        updateBulk((current) => ({
          ...current,
          currentGroupIndex: result.completedGroupCount,
          status: "failed",
          error: message,
          rows: current.rows.map((row) =>
            failedIds.has(row.crate.id)
              ? {
                  ...row,
                  status: "failed",
                  opening: null,
                  error: message,
                }
              : row,
          ),
        }));
      } else {
        updateBulk((current) => ({
          ...current,
          currentGroupIndex: current.groups.length,
          completedCount: current.crates.length,
          status: "complete",
          error: null,
        }));
      }
      router.refresh();
      busyRef.current = false;
      setBusy(false);
    },
    [csrf, prepareAudio, router, updateBulk],
  );

  const openBulk = useCallback(
    async (crates: readonly EconomyItemView[]) => {
      if (
        busyRef.current ||
        crates.some((crate) => !isOpenableInventoryCrate(crate))
      )
        return;
      const groups = partitionCrateOpeningIds(
        crates.map((crate) => crate.id),
      ).map((crateItemIds) => ({
        crateItemIds,
        signature: JSON.stringify([...crateItemIds].sort()),
        idempotencyKey: createEconomyIdempotencyKey(),
      }));
      const session: BulkCrateOpeningSession = {
        crates: [...crates],
        groups,
        currentGroupIndex: 0,
        completedCount: 0,
        rows: crates.map((crate) => ({
          crate,
          status: "queued",
          opening: null,
          reward: null,
          message: null,
          error: null,
        })),
        status: "running",
        error: null,
      };
      bulkRef.current = session;
      setBulk(session);
      await runBulk(session, 0);
    },
    [runBulk],
  );

  const retryRemaining = useCallback(async () => {
    const session = bulkRef.current;
    if (!session || busyRef.current || session.status !== "failed") return;
    await runBulk(session, session.currentGroupIndex);
  }, [runBulk]);

  const completeBulkReveal = useCallback(
    (crateId: string) => {
      updateBulk((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          row.crate.id === crateId && row.status === "revealing"
            ? { ...row, status: "complete", opening: null }
            : row,
        ),
      }));
    },
    [updateBulk],
  );

  const dismissBulk = useCallback(() => {
    if (busyRef.current) return;
    bulkRef.current = null;
    setBulk(null);
  }, []);

  useEffect(
    () => () => {
      if (singleRevealTimer.current !== null)
        window.clearTimeout(singleRevealTimer.current);
      completeSingleRef.current?.();
      completeBulkDelayRef.current?.();
      if (reelAudio.current && reelAudio.current.state !== "closed")
        void reelAudio.current.close();
    },
    [],
  );

  return {
    busy,
    consumedItemIds,
    retainedSingleCrate:
      single.opening || single.reward || single.error ? single.crate : null,
    single,
    bulk,
    prepareSingle,
    setSingleDropState,
    openSingle,
    completeSingleReveal,
    dismissSingle,
    openBulk,
    retryRemaining,
    completeBulkReveal,
    dismissBulk,
    playTick,
  };
}

export function InventorySingleCrateOpening({
  crate,
  controller,
}: {
  crate: EconomyItemView;
  controller: InventoryCrateOpeningController;
}) {
  const [showDrops, setShowDrops] = useState(false);
  const [dropLoadAttempt, setDropLoadAttempt] = useState(0);
  const { single } = controller;
  const state = single.crate?.id === crate.id ? single : initialSingleState(crate);
  const dropsId = `inventory-crate-drops-${crate.id}`;
  const dropCount =
    state.dropState.status === "ready" ? state.dropState.drops.length : null;
  const handleDropStateChange = useCallback(
    (dropState: CrateDropState) =>
      controller.setSingleDropState(crate.id, dropState),
    [controller.setSingleDropState, crate.id],
  );

  useEffect(() => {
    controller.prepareSingle(crate);
  }, [controller.prepareSingle, crate]);

  if (state.opening) {
    return (
      <section className="inventory-crate-opening-panel is-opening">
        <CrateOpeningAnimation
          opening={state.opening}
          onRevealComplete={controller.completeSingleReveal}
          onTick={controller.playTick}
        />
      </section>
    );
  }

  if (state.reward)
    return (
      <section className="inventory-crate-opening-panel is-reward">
        {rewardMessage(state.reward, state.rewardMessage)}
      </section>
    );

  const dropReady = state.dropState.status === "ready";
  return (
    <fieldset className="form-panel inventory-crate-opening-panel">
      <legend>Opening station</legend>
      <p className="empty-copy">
        Open this {humanize(crate.itemType)} without a key. Possible drops are
        optional to inspect and verified by the server.
      </p>
      <div className="inventory-crate-opening-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={controller.busy || !dropReady}
          onClick={() => void controller.openSingle(crate)}
        >
          {controller.busy ? (
            <LoaderCircle aria-hidden="true" className="economy-bulk-spinner" />
          ) : (
            <Gift aria-hidden="true" />
          )}
          {dropReady
            ? state.error
              ? "Retry open"
              : "Open crate"
            : "Preparing opening…"}
        </button>
        <button
          type="button"
          className="button button-secondary crate-inline-drops-toggle"
          aria-expanded={showDrops}
          aria-controls={dropsId}
          onClick={() => setShowDrops((visible) => !visible)}
        >
          <ChevronDown aria-hidden="true" />
          {showDrops
            ? "Hide possible drops"
            : dropCount === null
              ? "Show possible drops"
              : `Show ${dropCount.toLocaleString()} possible drops`}
        </button>
      </div>
      {state.error ? (
        <p className="crate-bulk-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.dropState.status === "error" ? (
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            controller.setSingleDropState(crate.id, { status: "idle" });
            setDropLoadAttempt((attempt) => attempt + 1);
          }}
        >
          <RotateCcw aria-hidden="true" /> Retry opening data
        </button>
      ) : null}
      <div id={dropsId} hidden={!showDrops}>
        <CrateDropPreview
          key={`${crate.id}-${dropLoadAttempt}`}
          catalogueId={crate.catalogueId}
          onStateChange={handleDropStateChange}
        />
      </div>
    </fieldset>
  );
}

export function InventoryBulkCrateOpeningResults({
  controller,
  onDismiss,
}: {
  controller: InventoryCrateOpeningController;
  onDismiss: () => void;
}) {
  const session = controller.bulk;
  if (!session) return null;
  const total = session.crates.length;
  const groupNumber = Math.min(
    session.currentGroupIndex + 1,
    session.groups.length,
  );

  return (
    <section
      className="crate-bulk-openings inventory-crate-bulk-session"
      aria-labelledby="inventory-crate-bulk-heading"
      aria-busy={session.status === "running"}
    >
      <header className="crate-bulk-openings-heading">
        <div aria-live="polite" aria-atomic="true">
          <p className="eyebrow">
            <Gift aria-hidden="true" /> Multi-open station
          </p>
          <h3 id="inventory-crate-bulk-heading">
            {session.status === "complete"
              ? `${total} opening results`
              : `${session.completedCount} of ${total} opened`}
          </h3>
          <p>
            {session.status === "running"
              ? `Opening group ${groupNumber} of ${session.groups.length}. Each group is committed once.`
              : session.status === "failed"
                ? "Completed rewards are safe. Retry only the unopened remainder."
                : "Every reward has been added to your Inventory."}
          </p>
          <progress
            value={session.completedCount}
            max={total}
            aria-label={`${session.completedCount} of ${total} crates opened`}
          />
        </div>
        <div className="inventory-crate-session-actions">
          {session.status === "failed" ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => void controller.retryRemaining()}
            >
              <RotateCcw aria-hidden="true" /> Retry remaining
            </button>
          ) : null}
          {session.status !== "running" ? (
            <button type="button" className="button button-quiet" onClick={onDismiss}>
              <X aria-hidden="true" /> Dismiss results
            </button>
          ) : null}
        </div>
      </header>
      {session.error ? (
        <p className="crate-bulk-error" role="alert">
          {session.error}
        </p>
      ) : null}
      <div className="crate-bulk-opening-list">
        {session.rows.map((row, index) => (
          <article
            key={row.crate.id}
            className={`panel crate-inline-modal crate-bulk-opening-row ${
              row.opening ? "is-opening" : ""
            } ${row.reward ? `is-reward ${rarityRankClass(row.reward.rarityRank)}` : ""}`}
            aria-label={`${row.crate.displayName}, opening ${index + 1} of ${total}`}
          >
            <header className="crate-inline-modal-header">
              <div>
                <p className="eyebrow">
                  Opening {index + 1} of {total}
                </p>
                <h3>{row.crate.displayName}</h3>
              </div>
              <span className="tag">
                {row.status === "queued"
                  ? "Queued"
                  : row.status === "verifying"
                    ? "Verifying roll"
                    : row.status === "revealing"
                      ? "Revealing"
                      : row.status === "failed"
                        ? "Needs retry"
                        : "Complete"}
              </span>
            </header>
            {row.opening ? (
              <CrateOpeningAnimation
                opening={row.opening}
                onRevealComplete={() =>
                  controller.completeBulkReveal(row.crate.id)
                }
                onTick={controller.playTick}
              />
            ) : row.reward ? (
              rewardMessage(row.reward, row.message)
            ) : row.error ? (
              <p className="crate-bulk-error" role="alert">
                {row.error}
              </p>
            ) : (
              <div className="crate-bulk-queued">
                <MarketplaceItemPreview
                  item={row.crate}
                  enableMarketPreview={false}
                />
                <p>Waiting for its server-verified opening group.</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
