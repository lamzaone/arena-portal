"use client";

import {
  Check,
  Crosshair,
  Hand,
  LoaderCircle,
  LockKeyhole,
  Sword,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  rarityClass,
  toEconomyItem,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { EconomyActionRequestError, postEconomyAction } from "@/components/economy/economy-request";
import { PortalToast, type PortalToastVariant } from "@/components/success-toast";
import type { EconomyInventoryPage, EconomyLoadoutSlot } from "@/lib/data/portal-repository";
import {
  loadoutItemSupportsTarget,
  loadoutSlotsForTarget,
  ownedItemsForLoadout,
  representativeLoadoutItem,
  type LoadoutCategoryId,
  type LoadoutTeamTarget,
} from "@/lib/economy/loadout-selection";
import {
  ownedWeaponSkins,
  WEAPON_CATEGORIES,
  type WeaponCategoryId,
} from "@/lib/economy/weapon-categories";

type EconomyLoadoutManagerProps = {
  inventory: EconomyInventoryPage;
  loadout: EconomyLoadoutSlot[];
  csrf: string;
};

type Notice = { message: string; variant: PortalToastVariant } | null;

const LOADOUT_CATEGORIES = [
  { id: "weapon", label: "Weapons", icon: Crosshair },
  { id: "knife", label: "Knives", icon: Sword },
  { id: "glove", label: "Gloves", icon: Hand },
  { id: "agent", label: "Agents", icon: UserRound },
] as const;

const TEAM_TARGETS = ["T", "CT", "both"] as const;
const TEAMS = ["T", "CT"] as const;

const EMPTY_MESSAGES: Record<LoadoutCategoryId, string> = {
  weapon: "You do not own a weapon finish in this class yet.",
  knife: "You do not own a knife yet.",
  glove: "You do not own gloves yet.",
  agent: "You do not own an Agent for this team yet.",
};

function slotItem(
  loadout: EconomyLoadoutSlot[],
  category: LoadoutCategoryId,
  team: "T" | "CT",
  definitionIndex?: number,
) {
  return loadout.find(
    (slot) =>
      slot.slotType === category &&
      slot.team === team &&
      (category !== "weapon" || slot.definitionIndex === definitionIndex),
  ) ?? null;
}

function weaponLabel(item: EconomyItemView) {
  return item.displayName.split("|")[0]?.trim() || item.displayName;
}

function targetLabel(team: LoadoutTeamTarget) {
  return team === "both" ? "both teams" : team;
}

function equippedTeamLabels(itemId: string, loadout: EconomyLoadoutSlot[]) {
  const equippedTeams = TEAMS.filter((team) =>
    loadout.some((slot) => slot.itemId === itemId && slot.team === team),
  );
  if (equippedTeams.length === 0) return null;
  return equippedTeams.length === 2 ? "Equipped for T & CT" : `Equipped for ${equippedTeams[0]}`;
}

function fallbackSlotPreview(
  category: Exclude<LoadoutCategoryId, "weapon">,
  slot: EconomyLoadoutSlot | null,
) {
  return {
    catalogueId: null,
    displayName: slot?.item?.displayName ?? "Default",
    floatValue: slot?.item?.floatValue ?? null,
    imageUrl: null,
    itemType: category,
    rarityRank: slot?.item?.rarityRank ?? 0,
  } satisfies Pick<
    EconomyItemView,
    "catalogueId" | "displayName" | "floatValue" | "imageUrl" | "itemType" | "rarityRank"
  >;
}

export function EconomyLoadoutManager({
  inventory,
  loadout,
  csrf,
}: EconomyLoadoutManagerProps) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<LoadoutCategoryId>("weapon");
  const [activeWeaponCategory, setActiveWeaponCategory] = useState<WeaponCategoryId>("rifles");
  const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState<number | null>(null);
  const [teamTarget, setTeamTarget] = useState<LoadoutTeamTarget>("T");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();

  const availableItems = useMemo(
    () => inventory.items
      .filter((item) => item.state === "available")
      .map((item) => toEconomyItem(item)),
    [inventory.items],
  );
  const categoryItems = useMemo(
    () => ownedItemsForLoadout(availableItems, activeCategory),
    [activeCategory, availableItems],
  );
  const compatibleItems = useMemo(
    () => ownedItemsForLoadout(availableItems, activeCategory, teamTarget),
    [activeCategory, availableItems, teamTarget],
  );
  const weaponGroups = useMemo(
    () => ownedWeaponSkins(ownedItemsForLoadout(availableItems, "weapon")),
    [availableItems],
  );
  const categoryCounts = useMemo(
    () => new Map(
      LOADOUT_CATEGORIES.map((category) => [
        category.id,
        ownedItemsForLoadout(availableItems, category.id).length,
      ]),
    ),
    [availableItems],
  );
  const displayedWeaponGroups = weaponGroups.filter(
    (group) => group.category === activeWeaponCategory,
  );
  const selectedWeaponGroup = selectedDefinitionIndex === null
    ? null
    : weaponGroups.find((group) => group.definitionIndex === selectedDefinitionIndex) ?? null;
  const choiceItems = activeCategory === "weapon"
    ? compatibleItems.filter((item) => item.definitionIndex === selectedDefinitionIndex)
    : compatibleItems;
  const selectedItem = choiceItems.find((item) => item.id === selectedItemId) ?? null;

  function chooseCategory(category: LoadoutCategoryId) {
    if (category === activeCategory) return;
    setActiveCategory(category);
    setSelectedDefinitionIndex(null);
    setSelectedItemId(null);
    if (category === "agent" && teamTarget === "both") setTeamTarget("T");
  }

  function chooseWeaponCategory(category: WeaponCategoryId) {
    if (category === activeWeaponCategory) return;
    setActiveWeaponCategory(category);
    if (selectedWeaponGroup?.category !== category) {
      setSelectedDefinitionIndex(null);
      setSelectedItemId(null);
    }
  }

  function chooseWeaponDefinition(definitionIndex: number) {
    if (definitionIndex === selectedDefinitionIndex) return;
    setSelectedDefinitionIndex(definitionIndex);
    setSelectedItemId((currentItemId) => {
      const currentItem = availableItems.find((item) => item.id === currentItemId);
      return currentItem?.definitionIndex === definitionIndex &&
        loadoutItemSupportsTarget(currentItem, teamTarget)
        ? currentItemId
        : null;
    });
  }

  function chooseTeamTarget(target: LoadoutTeamTarget) {
    if (target === teamTarget || (activeCategory === "agent" && target === "both")) return;
    setTeamTarget(target);
    setSelectedItemId((currentItemId) => {
      const currentItem = availableItems.find((item) => item.id === currentItemId);
      return currentItem &&
        ownedItemsForLoadout([currentItem], activeCategory, target).length > 0 &&
        (activeCategory !== "weapon" || currentItem.definitionIndex === selectedDefinitionIndex)
        ? currentItemId
        : null;
    });
  }

  function runAction(
    action: "equip" | "clear",
    category: LoadoutCategoryId,
    team: LoadoutTeamTarget,
    definitionIndex?: number,
    itemId?: string,
  ) {
    const slots = loadoutSlotsForTarget(category, team, definitionIndex);
    const actionKey = [action, category, definitionIndex ?? "global", team, itemId ?? "clear"].join("-");
    setPendingAction(actionKey);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          action === "equip" ? "/api/economy/loadout/equip" : "/api/economy/loadout/clear",
          csrf,
          action === "equip" ? { itemId, slots } : { slots },
        );
        setNotice({
          variant: "success",
          message: result.message || (action === "equip" ? "Loadout saved." : "Loadout slot cleared."),
        });
        router.refresh();
      } catch (error) {
        setNotice({
          variant: "danger",
          message: error instanceof EconomyActionRequestError || error instanceof Error
            ? error.message
            : "The loadout change could not be saved.",
        });
      } finally {
        setPendingAction(null);
      }
    });
  }

  const actionDefinitionIndex = activeCategory === "weapon"
    ? selectedDefinitionIndex ?? undefined
    : undefined;
  const equipActionKey = [
    "equip",
    activeCategory,
    actionDefinitionIndex ?? "global",
    teamTarget,
    selectedItemId ?? "clear",
  ].join("-");
  const clearActionKey = [
    "clear",
    activeCategory,
    actionDefinitionIndex ?? "global",
    teamTarget,
    "clear",
  ].join("-");

  return (
    <section className="loadout-manager" aria-labelledby="loadout-manager-heading">
      <header className="loadout-manager-header">
        <div>
          <p className="eyebrow"><Crosshair aria-hidden="true" /> Owned loadout</p>
          <h2 id="loadout-manager-heading">Build your T and CT loadout.</h2>
          <p>Choose a category, narrow the slot, then equip one of your available cosmetics.</p>
        </div>
        <span className="loadout-manager-count">{categoryItems.length} owned in category</span>
      </header>

      <div className="loadout-steps">
        <section className="loadout-step" aria-labelledby="loadout-step-category-heading">
          <header className="loadout-step-header">
            <span className="loadout-step-number" aria-hidden="true">1</span>
            <div>
              <p className="eyebrow">Step 1</p>
              <h3 id="loadout-step-category-heading">Choose a category</h3>
            </div>
          </header>
          <nav className="loadout-primary-categories" aria-label="Loadout categories">
            {LOADOUT_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const count = categoryCounts.get(category.id) ?? 0;
              const selected = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`loadout-category-card ${selected ? "is-selected" : ""}`}
                  aria-pressed={selected}
                  disabled={isPending}
                  onClick={() => chooseCategory(category.id)}
                >
                  <Icon aria-hidden="true" />
                  <strong>{category.label}</strong>
                  <span>{count} owned</span>
                </button>
              );
            })}
          </nav>
        </section>

        <section className="loadout-step" aria-labelledby="loadout-step-context-heading">
          <header className="loadout-step-header">
            <span className="loadout-step-number" aria-hidden="true">2</span>
            <div>
              <p className="eyebrow">Step 2</p>
              <h3 id="loadout-step-context-heading">
                {activeCategory === "weapon" ? "Choose a weapon" : "Review current equipment"}
              </h3>
            </div>
          </header>

          {activeCategory === "weapon" ? (
            <>
              <div className="loadout-weapon-categories" role="group" aria-label="Weapon classes">
                {WEAPON_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={activeWeaponCategory === category.id ? "is-selected" : ""}
                    aria-pressed={activeWeaponCategory === category.id}
                    disabled={isPending}
                    onClick={() => chooseWeaponCategory(category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>

              {displayedWeaponGroups.length > 0 ? (
                <div className="loadout-weapon-grid">
                  {displayedWeaponGroups.map((group) => {
                    const currentT = slotItem(loadout, "weapon", "T", group.definitionIndex);
                    const currentCT = slotItem(loadout, "weapon", "CT", group.definitionIndex);
                    const representative = representativeLoadoutItem(
                      group.items,
                      currentT?.itemId ?? null,
                      currentCT?.itemId ?? null,
                    );
                    if (!representative) return null;
                    const name = weaponLabel(representative);
                    const selected = selectedDefinitionIndex === group.definitionIndex;
                    return (
                      <button
                        key={group.definitionIndex}
                        type="button"
                        className={`loadout-weapon-card ${selected ? "is-selected" : ""}`}
                        aria-label={`Choose ${name}, ${group.items.length} owned ${group.items.length === 1 ? "finish" : "finishes"}`}
                        aria-pressed={selected}
                        disabled={isPending}
                        onClick={() => chooseWeaponDefinition(group.definitionIndex)}
                      >
                        <MarketplaceItemPreview item={representative} enableMarketPreview={false} />
                        <span className="loadout-weapon-copy">
                          <strong>{name}</strong>
                          <span>{group.items.length} owned {group.items.length === 1 ? "finish" : "finishes"}</span>
                        </span>
                        <span className="loadout-team-summary" aria-label={`${name} current loadout`}>
                          <span className="loadout-team-badge">
                            <span>T</span>
                            <strong>{currentT?.item?.displayName ?? "Default"}</strong>
                          </span>
                          <span className="loadout-team-badge">
                            <span>CT</span>
                            <strong>{currentCT?.item?.displayName ?? "Default"}</strong>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <LoadoutEmptyState message={EMPTY_MESSAGES.weapon} />
              )}
            </>
          ) : (
            <div className="loadout-team-summary loadout-current-slots">
              {TEAMS.map((team) => {
                const current = slotItem(loadout, activeCategory, team);
                const availableItem = current?.itemId
                  ? availableItems.find((item) => item.id === current.itemId) ?? null
                  : null;
                const previewItem = availableItem ?? fallbackSlotPreview(activeCategory, current);
                return (
                  <article key={team} className="loadout-current-slot">
                    <MarketplaceItemPreview item={previewItem} enableMarketPreview={false} />
                    <div>
                      <span className="loadout-team-badge">{team}</span>
                      <strong>{current?.item?.displayName ?? "Default"}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="loadout-step" aria-labelledby="loadout-step-item-heading">
          <header className="loadout-step-header">
            <span className="loadout-step-number" aria-hidden="true">3</span>
            <div>
              <p className="eyebrow">Step 3</p>
              <h3 id="loadout-step-item-heading">Choose a team and owned item</h3>
            </div>
          </header>

          <div className="loadout-team-target" role="group" aria-label="Equip for team">
            {TEAM_TARGETS.filter((target) => activeCategory !== "agent" || target !== "both").map((target) => (
              <button
                key={target}
                type="button"
                className={teamTarget === target ? "is-selected" : ""}
                aria-pressed={teamTarget === target}
                disabled={isPending}
                onClick={() => chooseTeamTarget(target)}
              >
                {target === "both" ? "Both" : target}
              </button>
            ))}
          </div>

          {activeCategory === "weapon" && selectedDefinitionIndex === null ? (
            displayedWeaponGroups.length > 0
              ? <p className="loadout-selection-prompt">Choose a weapon above to see its owned finishes.</p>
              : <LoadoutEmptyState message={EMPTY_MESSAGES.weapon} />
          ) : choiceItems.length > 0 ? (
            <div className="loadout-choice-grid">
              {choiceItems.map((item) => {
                const selected = selectedItemId === item.id;
                const equippedLabel = equippedTeamLabels(item.id, loadout);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`loadout-choice-card ${selected ? "is-selected" : ""} ${equippedLabel ? "is-equipped" : ""}`}
                    aria-pressed={selected}
                    disabled={isPending}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <MarketplaceItemPreview item={item} enableMarketPreview={false} />
                    <span className="loadout-choice-copy">
                      <span className={rarityClass(item.rarityRank)}>{item.rarity}</span>
                      <strong>{item.displayName}</strong>
                      <span className="tag-list" aria-label={`${item.displayName} details`}>
                        {item.floatValue !== null ? <span className="tag">Float {item.floatValue.toFixed(6)}</span> : null}
                        {item.stattrak ? <span className="tag tag-vip">StatTrak™</span> : null}
                        {item.nametag ? <span className="tag">“{item.nametag}”</span> : null}
                        {item.saleLocked ? <span className="tag loadout-lock"><LockKeyhole aria-hidden="true" /> Sale locked</span> : null}
                        {equippedLabel ? <span className="tag loadout-equipped-badge"><Check aria-hidden="true" /> {equippedLabel}</span> : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <LoadoutEmptyState message={EMPTY_MESSAGES[activeCategory]} />
          )}

          <div className="loadout-action-bar">
            <button
              type="button"
              className="button"
              disabled={isPending || !selectedItem || (activeCategory === "weapon" && selectedDefinitionIndex === null)}
              onClick={() => {
                if (!selectedItem) return;
                runAction(
                  "equip",
                  activeCategory,
                  teamTarget,
                  actionDefinitionIndex,
                  selectedItem.id,
                );
              }}
            >
              {pendingAction === equipActionKey
                ? <LoaderCircle className="loadout-spinner" aria-hidden="true" />
                : <Check aria-hidden="true" />}
              Equip for {targetLabel(teamTarget)}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={isPending || (activeCategory === "weapon" && selectedDefinitionIndex === null)}
              onClick={() => runAction(
                "clear",
                activeCategory,
                teamTarget,
                actionDefinitionIndex,
              )}
            >
              {pendingAction === clearActionKey
                ? <LoaderCircle className="loadout-spinner" aria-hidden="true" />
                : <X aria-hidden="true" />}
              Use default for {targetLabel(teamTarget)}
            </button>
          </div>
        </section>
      </div>

      {notice ? <PortalToast message={notice.message} variant={notice.variant} onDismiss={() => setNotice(null)} /> : null}
    </section>
  );
}

function LoadoutEmptyState({ message }: { message: string }) {
  return (
    <div className="loadout-empty">
      <p>{message}</p>
      <p>
        Find owned cosmetics in <Link href="/market">Market</Link> or <Link href="/crates">open an owned crate</Link>.
      </p>
    </div>
  );
}
