import { randomUUID } from "node:crypto";
import { Gift } from "lucide-react";

import { PlayerIdentity } from "@/components/player-identity";
import { Panel, PanelHeader } from "@/components/ui/panel";
import type {
  EconomyCatalogueItem,
  EconomyItemType,
} from "@/lib/data/portal-repository";
import {
  ECONOMY_ITEM_TYPES,
  ECONOMY_RARITIES,
  ECONOMY_SPECIAL_RARITY_RANK,
  economyItemTypeLabel,
  isCustomProductItemType,
} from "@/lib/economy/item-taxonomy";
import type { PlayerIdentityData } from "@/lib/player-identities";

const customItemTypes: EconomyItemType[] = ECONOMY_ITEM_TYPES.filter(
  (itemType) =>
    itemType !== "crate" &&
    itemType !== "capsule" &&
    !isCustomProductItemType(itemType),
);

export type GrantCatalogueItem = Pick<
  EconomyCatalogueItem,
  "id" | "displayName" | "itemType"
>;

export function StaffGrantItemForm({
  action,
  catalogue,
  csrf,
  playerIdentity,
  steamId,
}: {
  action: string;
  catalogue: GrantCatalogueItem[];
  csrf: string;
  playerIdentity: PlayerIdentityData;
  steamId: string;
}) {
  return (
    <Panel className="economy-admin-section" id="staff-grant-item">
      <PanelHeader>
        <div>
          <p className="eyebrow">
            <Gift aria-hidden="true" /> Grant an item
          </p>
          <h2>Give a catalogue item or fully custom instance</h2>
          <p>
            Choose a catalogue ID, or leave it blank and expand the custom item
            fields. Crates and capsules must use a catalogue entry with a
            configured loot table.
          </p>
        </div>
      </PanelHeader>
      <datalist id={`economy-catalogue-options-${steamId}`}>
        {catalogue.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName} · {economyItemTypeLabel(item.itemType)}
          </option>
        ))}
      </datalist>
      <form
        className="form-panel economy-admin-form economy-admin-grant"
        action={action}
        method="post"
      >
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="action" value="grant" />
        <input
          type="hidden"
          name="idempotencyKey"
          value={randomUUID().replaceAll("-", "")}
        />
        <input type="hidden" name="steamId" value={steamId} />
        <div className="form-grid">
          <div className="economy-admin-target">
            <span>Target player</span>
            <PlayerIdentity player={playerIdentity} variant="compact" />
          </div>
          <label>
            Catalogue ID
            <input
              name="catalogueId"
              list={`economy-catalogue-options-${steamId}`}
              inputMode="numeric"
              placeholder="Leave blank for a custom item"
            />
          </label>
        </div>
        <details className="economy-admin-edit">
          <summary>Fully custom instance fields</summary>
          <div className="economy-admin-form">
            <div className="form-grid">
              <label>
                Custom type
                <select name="itemType" defaultValue="skin">
                  {customItemTypes.map((type) => (
                    <option key={type} value={type}>
                      {economyItemTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Custom display name
                <input
                  name="displayName"
                  maxLength={180}
                  placeholder="Required without a catalogue ID"
                />
              </label>
              <label>
                Definition index
                <input name="definitionIndex" inputMode="numeric" />
              </label>
              <label>
                Paintkit
                <input name="paintkit" inputMode="numeric" />
              </label>
              <label>
                Rarity rank
                <select name="rarityRank" defaultValue="0">
                  {ECONOMY_RARITIES.map((rarity) => (
                    <option key={rarity.rank} value={rarity.rank}>
                      {rarity.rank} · {rarity.name}
                      {rarity.rank === ECONOMY_SPECIAL_RARITY_RANK
                        ? " (custom only)"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Custom item metadata JSON
              <textarea
                name="metadata"
                placeholder='{"supportsNametag": true, "stickerSlots": 5}'
              />
            </label>
          </div>
        </details>
        <div className="form-grid">
          <label>
            Transferability
            <select name="tradable" defaultValue="true">
              <option value="true">Tradable</option>
              <option value="false">Untradable reward</option>
            </select>
          </label>
          <label>
            Float
            <input
              name="floatValue"
              inputMode="decimal"
              min="0"
              max="1"
              step="0.000001"
            />
          </label>
          <label>
            Seed
            <input name="seed" inputMode="numeric" min="0" max="1000" />
          </label>
          <label>
            StatTrak
            <select name="stattrak" defaultValue="false">
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          </label>
          <label>
            StatTrak count
            <input
              name="stattrakCount"
              inputMode="numeric"
              min="0"
              defaultValue="0"
            />
          </label>
          <label>
            Name tag
            <input name="nametag" maxLength={128} />
          </label>
        </div>
        <label>
          Instance attributes JSON
          <textarea name="attributes" placeholder='{"modelPath": "..."}' />
        </label>
        <label>
          Initial sticker array JSON{" "}
          <small>
            Optional; each entry uses a slot plus either catalogueId or
            customItem.
          </small>
          <textarea
            name="initialStickers"
            placeholder='[{"slot":0,"catalogueId":123}]'
          />
        </label>
        <label>
          Reason
          <input
            name="reason"
            required
            maxLength={180}
            defaultValue="Staff inventory grant"
          />
        </label>
        <button className="button button-primary" type="submit">
          Grant item
        </button>
      </form>
    </Panel>
  );
}
