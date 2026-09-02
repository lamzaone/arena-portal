"use client";

import { Check, ChevronDown, Crosshair, LoaderCircle, LockKeyhole, X } from "lucide-react";
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
  loadoutSlots,
  ownedWeaponSkins,
  WEAPON_CATEGORIES,
  type LoadoutTeamSelection,
  type WeaponCategoryId,
} from "@/lib/economy/weapon-categories";

type EconomyLoadoutManagerProps = {
  inventory: EconomyInventoryPage;
  loadout: EconomyLoadoutSlot[];
  csrf: string;
};

type Notice = { message: string; variant: PortalToastVariant } | null;

function itemPreview(item: EconomyItemView) {
  return <MarketplaceItemPreview item={item} enableMarketPreview={false} />;
}

function slotItem(
  loadout: EconomyLoadoutSlot[],
  definitionIndex: number,
  team: "T" | "CT",
) {
  return loadout.find(
    (slot) =>
      slot.slotType === "weapon" &&
      slot.definitionIndex === definitionIndex &&
      slot.team === team,
  )?.item ?? null;
}

function weaponLabel(item: EconomyItemView) {
  return item.displayName.split("|")[0]?.trim() || item.displayName;
}

export function EconomyLoadoutManager({
  inventory,
  loadout,
  csrf,
}: EconomyLoadoutManagerProps) {
  const router = useRouter();
  const [expandedDefinitionIndex, setExpandedDefinitionIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<WeaponCategoryId | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();

  const weaponItems = useMemo(
    () => inventory.items
      .filter((item) => item.state === "available")
      .map((item) => toEconomyItem(item)),
    [inventory.items],
  );
  const weaponGroups = useMemo(() => ownedWeaponSkins(weaponItems), [weaponItems]);
  const categories = useMemo(
    () => WEAPON_CATEGORIES.filter((category) => weaponGroups.some((group) => group.category === category.id)),
    [weaponGroups],
  );
  const selectedCategory = activeCategory && categories.some((category) => category.id === activeCategory)
    ? activeCategory
    : categories[0]?.id ?? null;
  const displayedGroups = weaponGroups.filter((group) => group.category === selectedCategory);
  const equippedItemIds = useMemo(
    () => new Set(loadout.flatMap((slot) => slot.itemId ? [slot.itemId] : [])),
    [loadout],
  );

  function runAction(
    action: "equip" | "clear",
    definitionIndex: number,
    team: LoadoutTeamSelection,
    itemId?: string,
  ) {
    const slots = loadoutSlots(definitionIndex, team);
    const actionKey = `${action}-${itemId ?? definitionIndex}-${team}`;
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

  if (!weaponGroups.length) {
    return (
      <section className="loadout-manager loadout-empty" aria-labelledby="loadout-empty-heading">
        <Crosshair aria-hidden="true" />
        <h2 id="loadout-empty-heading">No owned weapon skins yet</h2>
        <p>Open crates or visit Market to add weapon finishes to your Token Inventory, then return here to equip them.</p>
      </section>
    );
  }

  return (
    <section className="loadout-manager" aria-labelledby="loadout-manager-heading">
      <header className="loadout-manager-header">
        <div>
          <p className="eyebrow"><Crosshair aria-hidden="true" /> Owned weapon finishes</p>
          <h2 id="loadout-manager-heading">Select a weapon, then assign an owned finish.</h2>
          <p>Each team can use a different finish. Your server remains the final authority for ownership and compatibility.</p>
        </div>
        <span className="loadout-manager-count">{weaponGroups.length} weapons</span>
      </header>

      <div className="loadout-category-tabs" role="group" aria-label="Weapon categories">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={selectedCategory === category.id}
            className={selectedCategory === category.id ? "active" : ""}
            onClick={() => {
              setActiveCategory(category.id);
              setExpandedDefinitionIndex(null);
            }}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="loadout-weapon-grid">
        {displayedGroups.map((group) => {
          const representative = group.items[0];
          const currentT = slotItem(loadout, group.definitionIndex, "T");
          const currentCT = slotItem(loadout, group.definitionIndex, "CT");
          const panelId = `loadout-picker-${group.definitionIndex}`;
          const triggerId = `loadout-weapon-trigger-${group.definitionIndex}`;
          const expanded = expandedDefinitionIndex === group.definitionIndex;

          return (
            <article key={group.definitionIndex} className={`loadout-weapon-card ${expanded ? "is-expanded" : ""}`}>
              <button
                type="button"
                id={triggerId}
                className="loadout-weapon-summary"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setExpandedDefinitionIndex(expanded ? null : group.definitionIndex)}
              >
                <span className="loadout-weapon-summary-copy">
                  <span className={rarityClass(representative.rarityRank)}>{representative.rarity}</span>
                  <strong>{weaponLabel(representative)}</strong>
                  <small>{group.items.length} owned {group.items.length === 1 ? "finish" : "finishes"}</small>
                </span>
                <ChevronDown aria-hidden="true" />
              </button>

              <div className="loadout-equipped-summary" aria-label={`${weaponLabel(representative)} equipped items`}>
                {(["T", "CT"] as const).map((team) => {
                  const equipped = team === "T" ? currentT : currentCT;
                  return (
                    <div key={team} className="loadout-equipped-team">
                      <span>{team}</span>
                      <strong>{equipped?.displayName ?? "Default finish"}</strong>
                    </div>
                  );
                })}
              </div>

              <div
                id={panelId}
                className="loadout-picker"
                role="region"
                aria-labelledby={triggerId}
                hidden={!expanded}
              >
                  <div className="loadout-picker-heading">
                    <div>
                      <h3>Owned finishes</h3>
                      <p>Choose where each instance is equipped.</p>
                    </div>
                    <div className="loadout-clear-actions">
                      {(["T", "CT", "both"] as const).map((team) => {
                        const key = `clear-${group.definitionIndex}-${team}`;
                        return (
                          <button key={team} type="button" className="button button-secondary" disabled={isPending} onClick={() => runAction("clear", group.definitionIndex, team)}>
                            {pendingAction === key ? <LoaderCircle className="loadout-spinner" aria-hidden="true" /> : <X aria-hidden="true" />}
                            Clear {team === "both" ? "both" : team}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="loadout-owned-list">
                    {group.items.map((item) => {
                      const isEquipped = equippedItemIds.has(item.id);
                      return (
                        <article key={item.id} className={`loadout-owned-item ${isEquipped ? "is-equipped" : ""}`}>
                          {itemPreview(item)}
                          <div className="loadout-owned-copy">
                            <span className={rarityClass(item.rarityRank)}>{item.rarity}</span>
                            <h4>{item.displayName}</h4>
                            <div className="tag-list" aria-label={`${item.displayName} details`}>
                              {item.floatValue !== null ? <span className="tag">Float {item.floatValue.toFixed(6)}</span> : null}
                              {item.stattrak ? <span className="tag tag-vip">StatTrak™</span> : null}
                              {item.nametag ? <span className="tag">“{item.nametag}”</span> : null}
                              {item.saleLocked ? <span className="tag loadout-lock"><LockKeyhole aria-hidden="true" /> Sale locked</span> : null}
                              {isEquipped ? <span className="tag loadout-equipped-badge"><Check aria-hidden="true" /> Equipped</span> : null}
                            </div>
                          </div>
                          <div className="loadout-item-actions" aria-label={`Equip ${item.displayName}`}>
                            {(["T", "CT", "both"] as const).map((team) => {
                              const key = `equip-${item.id}-${team}`;
                              return (
                                <button key={team} type="button" className="button" disabled={isPending} onClick={() => runAction("equip", group.definitionIndex, team, item.id)}>
                                  {pendingAction === key ? <LoaderCircle className="loadout-spinner" aria-hidden="true" /> : <Check aria-hidden="true" />}
                                  {team === "both" ? "Both" : team}
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
              </div>
            </article>
          );
        })}
      </div>
      {notice ? <PortalToast message={notice.message} variant={notice.variant} onDismiss={() => setNotice(null)} /> : null}
    </section>
  );
}
