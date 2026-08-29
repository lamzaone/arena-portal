import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  Archive,
  ArrowLeftRight,
  Coins,
  SlidersHorizontal,
  Tag,
  WalletCards,
} from "lucide-react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import { PlayerSearchField } from "@/components/player-search-field";
import {
  StaffGrantItemForm,
  type GrantCatalogueItem,
} from "@/components/economy/staff-grant-item-form";
import { rarityClass, rarityName } from "@/components/economy/economy-view-model";
import {
  type EconomyInventoryItem,
  type EconomyLoadoutSlot,
  type StaffEconomyAccount,
} from "@/lib/data/portal-repository";

type Pagination = {
  previousHref: string | null;
  nextHref: string | null;
};

function formatTokens(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function ActionFields({
  csrf,
  action,
  steamId,
}: {
  csrf: string;
  action: string;
  steamId?: string;
}) {
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value={action} />
      <input
        type="hidden"
        name="idempotencyKey"
        value={randomUUID().replaceAll("-", "")}
      />
      {steamId && action !== "grant" ? (
        <input type="hidden" name="steamId" value={steamId} />
      ) : null}
    </>
  );
}

function SlotFields({ slot }: { slot?: EconomyLoadoutSlot }) {
  return (
    <div className="economy-slot-fields">
      <label>
        Slot type
        <select name="slotType" defaultValue={slot?.slotType ?? "weapon"}>
          <option value="weapon">Weapon skin</option>
          <option value="knife">Knife</option>
          <option value="glove">Glove</option>
          <option value="agent">Agent</option>
          <option value="music_kit">Music kit</option>
        </select>
      </label>
      <label>
        Team
        <select name="slotTeam" defaultValue={slot?.team ?? "T"}>
          <option value="T">T</option>
          <option value="CT">CT</option>
        </select>
      </label>
      <label>
        Weapon definition
        <input
          name="slotDefinitionIndex"
          inputMode="numeric"
          defaultValue={slot?.definitionIndex ?? ""}
          placeholder="Required for weapon"
        />
      </label>
    </div>
  );
}

function inventoryImageUrl(item: EconomyInventoryItem) {
  const itemArtwork = item.attributes.imageUrl;
  if (typeof itemArtwork === "string" && itemArtwork.trim())
    return itemArtwork.trim();
  const catalogueArtwork = item.catalogue?.metadata.imageUrl;
  return typeof catalogueArtwork === "string" && catalogueArtwork.trim()
    ? catalogueArtwork.trim()
    : null;
}

function ItemEditor({
  item,
  steamId,
  csrf,
  canManage,
  action,
}: {
  item: EconomyInventoryItem;
  steamId: string;
  csrf: string;
  canManage: boolean;
  action: string;
}) {
  const attributes = JSON.stringify(item.attributes, null, 2);
  return (
    <article className="economy-admin-item staff-inventory-item">
      <MarketplaceItemPreview
        item={{
          catalogueId: item.catalogueId,
          displayName: item.displayName,
          floatValue: item.floatValue,
          imageUrl: inventoryImageUrl(item),
          itemType: item.itemType,
          rarityRank: item.rarityRank,
        }}
        floatValue={item.floatValue}
      />
      <header>
        <div>
          <span className={rarityClass(item.rarityRank)}>
            {rarityName(item.rarityRank)}
          </span>
          <h3>{item.displayName}</h3>
          <p>
            {item.itemType} · {item.id}
          </p>
        </div>
        <span className="tag">{item.state}</span>
      </header>
      <div className="tag-list">
        <span className="tag">Float {item.floatValue ?? "-"}</span>
        <span className="tag">Seed {item.seed ?? "-"}</span>
        <span className="tag">
          StatTrak {item.stattrak ? formatTokens(item.stattrakCount) : "off"}
        </span>
        {item.nametag ? (
          <span className="tag tag-vip">Name: {item.nametag}</span>
        ) : null}
        {item.equippedSlotKeys.map((key) => (
          <span className="tag" key={key}>
            Equipped: {key}
          </span>
        ))}
      </div>
      {item.stickers.length ? (
        <div className="economy-admin-attachments">
          <strong>Attached stickers</strong>
          {item.stickers.map((sticker) => (
            <div key={`${sticker.stickerItemId}:${sticker.slot}`}>
              <span>
                Slot {sticker.slot + 1}: {sticker.displayName ?? sticker.stickerItemId}
              </span>
              {canManage ? (
                <form action={action} method="post">
                  <ActionFields csrf={csrf} action="detach-sticker" steamId={steamId} />
                  <input type="hidden" name="weaponItemId" value={item.id} />
                  <input type="hidden" name="stickerSlot" value={sticker.slot} />
                  <input type="hidden" name="reason" value="Staff sticker detachment" />
                  <button className="staff-unban-button" type="submit">Detach</button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {canManage ? (
        <details className="economy-admin-edit">
          <summary>Edit item</summary>
          <form className="form-panel economy-admin-form" action={action} method="post">
            <ActionFields csrf={csrf} action="update" steamId={steamId} />
            <input type="hidden" name="itemId" value={item.id} />
            <div className="form-grid">
              <label>Float<input name="floatValue" inputMode="decimal" defaultValue={item.floatValue ?? ""} /></label>
              <label>Seed<input name="seed" inputMode="numeric" defaultValue={item.seed ?? ""} /></label>
              <label>StatTrak<select name="stattrak" defaultValue={item.stattrak ? "true" : "false"}><option value="false">Off</option><option value="true">On</option></select></label>
              <label>StatTrak count<input name="stattrakCount" inputMode="numeric" defaultValue={item.stattrakCount} /></label>
              <label>Name tag<input name="nametag" maxLength={128} defaultValue={item.nametag ?? ""} /></label>
              <label className="economy-check"><input type="checkbox" name="clearNametag" value="true" /> Clear name tag</label>
            </div>
            <label>Attributes JSON<textarea name="attributes" defaultValue={attributes} /></label>
            <label>Reason<input name="reason" required maxLength={180} defaultValue="Staff item correction" /></label>
            <button className="button button-primary" type="submit">Save customization</button>
          </form>
          <div className="economy-admin-actions">
            <form action={action} method="post">
              <ActionFields csrf={csrf} action="state" steamId={steamId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="state" value={item.state === "revoked" ? "available" : "revoked"} />
              <input type="hidden" name="reason" value="Staff item state update" />
              <button className={item.state === "revoked" ? "staff-unban-button" : "staff-danger-button"} type="submit">
                {item.state === "revoked" ? "Restore available" : "Revoke item"}
              </button>
            </form>
            <form action={action} method="post">
              <ActionFields csrf={csrf} action="transfer" steamId={steamId} />
              <input type="hidden" name="itemId" value={item.id} />
              <PlayerSearchField
                name="toSteamId"
                label="Transfer to player"
                mode="target"
                required
                includeSelf
              />
              <input type="hidden" name="reason" value="Staff item transfer" />
              <button className="staff-unban-button" type="submit">Transfer</button>
            </form>
          </div>
        </details>
      ) : null}
    </article>
  );
}

export function StaffInventoryPanel({
  account,
  csrf,
  canAdjustTokens,
  canGrant,
  canManage,
  canManageLoadouts,
  grantCatalogue,
  mutationAction,
  pagination,
}: {
  account: StaffEconomyAccount;
  csrf: string;
  canAdjustTokens: boolean;
  canGrant: boolean;
  canManage: boolean;
  canManageLoadouts: boolean;
  grantCatalogue: GrantCatalogueItem[];
  mutationAction: string;
  pagination: Pagination;
}) {
  const availableItems = account.inventory.items.filter((item) => item.state === "available");
  const hasMultiplePages = account.inventory.total > account.inventory.pageSize;
  return (
    <section className="staff-inventory-detail" aria-label={`${account.displayName} inventory`}>
      <header className="staff-inventory-detail-heading">
        <div>
          <p className="eyebrow"><Archive aria-hidden="true" /> Player inventory</p>
          <h2>{account.displayName}</h2>
          <p>{account.steamId} · Showing {account.inventory.items.length} of {account.inventory.total} items</p>
        </div>
        {canGrant ? <Link className="button button-secondary" href="#staff-grant-item">Grant item</Link> : null}
      </header>
      <section className="content-grid economy-admin-summary">
        <article className="panel">
          <p className="eyebrow"><WalletCards aria-hidden="true" /> Token wallet</p>
          <h2>{formatTokens(account.wallet.balance)} Tokens</h2>
          <div className="tag-list"><span className="tag">{formatTokens(account.wallet.lifetimeEarned)} earned</span><span className="tag">{formatTokens(account.wallet.lifetimeSpent)} spent</span><span className="tag">{account.inventory.total} inventory instances</span></div>
        </article>
        <article className="panel">
          <p className="eyebrow"><ArrowLeftRight aria-hidden="true" /> Pending trades</p>
          <h2>{account.pendingIncomingTrades + account.pendingOutgoingTrades}</h2>
          <p className="empty-copy">{account.pendingIncomingTrades} incoming · {account.pendingOutgoingTrades} outgoing</p>
        </article>
      </section>
      {canGrant ? (
        <StaffGrantItemForm
          action={mutationAction}
          catalogue={grantCatalogue}
          csrf={csrf}
          displayName={account.displayName}
          steamId={account.steamId}
        />
      ) : null}
      {canAdjustTokens ? (
        <section className="panel economy-admin-section">
          <div className="panel-heading"><div><p className="eyebrow"><Coins aria-hidden="true" /> Wallet control</p><h2>Award, take, or set Tokens</h2></div></div>
          <form className="form-panel economy-admin-form" action={mutationAction} method="post">
            <ActionFields csrf={csrf} action="tokens" steamId={account.steamId} />
            <div className="form-grid"><label>Action<select name="tokenAction" defaultValue="award"><option value="award">Award</option><option value="take">Take</option><option value="set">Set balance</option></select></label><label>Tokens<input name="amount" required inputMode="numeric" min="0" /></label></div>
            <label>Reason<input name="reason" required maxLength={180} defaultValue="Staff Token adjustment" /></label>
            <button className="button button-primary" type="submit">Save Token change</button>
          </form>
        </section>
      ) : null}
      {canManageLoadouts ? (
        <section className="panel economy-admin-section">
          <div className="panel-heading"><div><p className="eyebrow"><SlidersHorizontal aria-hidden="true" /> Loadout control</p><h2>Player loadout</h2><p>Server refresh is queued after every change.</p></div></div>
          <div className="economy-loadout-list">{account.loadout.length ? account.loadout.map((slot) => <article key={slot.slotKey}><div><strong>{slot.slotKey}</strong><span>{slot.item?.displayName ?? "Empty"}</span></div><form action={mutationAction} method="post"><ActionFields csrf={csrf} action="clear-slot" steamId={account.steamId} /><input type="hidden" name="slotType" value={slot.slotType} /><input type="hidden" name="slotTeam" value={slot.team ?? ""} /><input type="hidden" name="slotDefinitionIndex" value={slot.definitionIndex ?? ""} /><input type="hidden" name="reason" value="Staff loadout clear" /><button className="staff-unban-button" type="submit">Clear</button></form></article>) : <p className="empty-copy">No loadout slots have been saved yet.</p>}</div>
          <form className="form-panel economy-admin-form" action={mutationAction} method="post"><ActionFields csrf={csrf} action="equip" steamId={account.steamId} /><label>Owned available item<select name="itemId" required><option value="">Choose item</option>{availableItems.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.itemType} · {item.id}</option>)}</select></label><SlotFields /><label>Reason<input name="reason" required maxLength={180} defaultValue="Staff loadout assignment" /></label><button className="button button-primary" type="submit">Set loadout slot</button></form>
        </section>
      ) : null}
      {canManage ? (
        <section className="panel economy-admin-section">
          <div className="panel-heading"><div><p className="eyebrow"><Tag aria-hidden="true" /> Sticker control</p><h2>Attach an existing or catalogue sticker</h2></div></div>
          <form className="form-panel economy-admin-form" action={mutationAction} method="post"><ActionFields csrf={csrf} action="attach-sticker" steamId={account.steamId} /><div className="form-grid"><label>Weapon item ID<input name="weaponItemId" required /></label><label>Existing owned sticker ID<input name="stickerItemId" /></label><label>Or sticker catalogue ID<input name="stickerCatalogueId" inputMode="numeric" /></label><label>Sticker slot<input name="stickerSlot" required inputMode="numeric" min="0" max="5" defaultValue="0" /></label></div><label>Reason<input name="reason" required maxLength={180} defaultValue="Staff sticker attachment" /></label><button className="button button-secondary" type="submit">Attach sticker</button></form>
        </section>
      ) : null}
      <section className="economy-admin-inventory">
        <div className="section-heading compact"><p className="eyebrow"><Archive aria-hidden="true" /> Full inventory</p><h2>{account.inventory.total} instances</h2></div>
        {account.inventory.items.length ? <div className="economy-admin-item-grid">{account.inventory.items.map((item) => <ItemEditor key={item.id} item={item} steamId={account.steamId} csrf={csrf} canManage={canManage} action={mutationAction} />)}</div> : <p className="empty-copy">This player has no inventory items yet.</p>}
        {hasMultiplePages ? <nav className="pagination staff-inventory-pagination" aria-label="Inventory pages"><Link className={pagination.previousHref ? "" : "is-disabled"} href={pagination.previousHref ?? "#"} scroll={false}>Previous</Link><span>Page {account.inventory.page} of {Math.ceil(account.inventory.total / account.inventory.pageSize)}</span><Link className={pagination.nextHref ? "" : "is-disabled"} href={pagination.nextHref ?? "#"} scroll={false}>Next</Link></nav> : null}
      </section>
    </section>
  );
}
