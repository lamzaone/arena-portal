import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  Archive,
  ArrowLeftRight,
  Coins,
  Gift,
  LockKeyhole,
  PackagePlus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  WalletCards,
} from "lucide-react";

import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  getEconomyCatalogue,
  getStaffEconomyAccount,
  getTokenLedger,
  findStaffEconomyAccounts,
  type EconomyInventoryItem,
  type EconomyLoadoutSlot,
  type StaffEconomyAccount,
} from "@/lib/data/portal-repository";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";

type AdminItemsPageProps = {
  searchParams: Promise<{
    steamId?: string;
    q?: string;
    catalogue?: string;
    notice?: string;
    error?: string;
  }>;
};

const itemTypes = [
  "skin",
  "knife",
  "glove",
  "crate",
  "capsule",
  "nametag",
  "sticker",
  "agent",
  "music_kit",
  "keychain",
  "patch",
  "graffiti",
];

const customItemTypes = itemTypes.filter(
  (type) => type !== "crate" && type !== "capsule",
);

function validSteamId(value: string | undefined) {
  return value && /^7656119\d{10}$/.test(value) ? value : null;
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(tokens: number | null) {
  return tokens === null
    ? "No last-known price"
    : `${formatTokens(tokens)} Tokens`;
}

function noticeText(value: string | undefined) {
  const messages: Record<string, string> = {
    "tokens-updated": "Token balance updated and logged.",
    "item-granted": "Item granted to the selected player's inventory.",
    "item-updated": "Item customization saved and queued for server refresh.",
    "item-state-updated": "Item state updated.",
    "item-transferred": "Item transferred and both loadouts refreshed.",
    "sticker-attached": "Sticker attachment saved.",
    "sticker-detached": "Sticker detached and returned to the inventory.",
    "loadout-updated": "Player loadout slot saved.",
    "loadout-cleared": "Player loadout slot cleared.",
    "price-refreshed":
      "Public market price recorded as the new current snapshot.",
    "market-name-saved":
      "Exact public market name saved; its prior price snapshot was invalidated.",
    "price-saved": "Last-known market price recorded.",
  };
  return value ? messages[value] : undefined;
}

function errorText(value: string | undefined) {
  const messages: Record<string, string> = {
    verification: "Session verification failed. Reload the page and try again.",
    permission: "Your staff group does not have Token economy access.",
    "token-permission": "Your staff group cannot adjust Token balances.",
    "grant-permission": "Your staff group cannot grant inventory items.",
    "manage-permission":
      "This action requires full inventory administration access.",
    "loadout-permission": "This action requires loadout management access.",
    target:
      "The selected player is invalid or protected by higher staff immunity.",
    catalogue: "Choose a valid catalogue item.",
    "market-name":
      "Set an exact public market-hash name before refreshing its price.",
    "price-unavailable":
      "The public price database has no matching EUR quote. Its last-known price remains unchanged.",
    price: "Provide a valid catalogue ID and whole EUR-cent price.",
    "token-details": "Provide a valid token action, amount, and reason.",
    "item-details": "Review the item fields, JSON, and reason before saving.",
    "container-catalogue":
      "Crates and capsules must be granted from a catalogue entry so their loot table is available.",
    "sticker-details": "Provide a valid weapon, sticker, slot, and reason.",
    "loadout-details": "Choose a valid loadout slot, item, and reason.",
    "transfer-details": "Provide a valid destination SteamID64 and reason.",
    database:
      "The economy action could not be saved. Check the database and try again.",
  };
  return value
    ? (messages[value] ??
        "The requested economy action could not be completed.")
    : undefined;
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

function ItemEditor({
  item,
  steamId,
  csrf,
  canManage,
}: {
  item: EconomyInventoryItem;
  steamId: string;
  csrf: string;
  canManage: boolean;
}) {
  const attributes = JSON.stringify(item.attributes, null, 2);
  return (
    <article className="economy-admin-item">
      <header>
        <div>
          <span
            className={`badge ${item.rarityRank >= 5 ? "badge-danger" : item.rarityRank >= 4 ? "badge-warning" : ""}`}
          >
            Rarity {item.rarityRank}
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
                Slot {sticker.slot + 1}:{" "}
                {sticker.displayName ?? sticker.stickerItemId}
              </span>
              {canManage ? (
                <form action="/api/admin/economy" method="post">
                  <ActionFields
                    csrf={csrf}
                    action="detach-sticker"
                    steamId={steamId}
                  />
                  <input type="hidden" name="weaponItemId" value={item.id} />
                  <input
                    type="hidden"
                    name="stickerSlot"
                    value={sticker.slot}
                  />
                  <input
                    type="hidden"
                    name="reason"
                    value="Staff sticker detachment"
                  />
                  <button className="staff-unban-button" type="submit">
                    Detach
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {canManage ? (
        <details className="economy-admin-edit">
          <summary>Edit item</summary>
          <form
            className="form-panel economy-admin-form"
            action="/api/admin/economy"
            method="post"
          >
            <ActionFields csrf={csrf} action="update" steamId={steamId} />
            <input type="hidden" name="itemId" value={item.id} />
            <div className="form-grid">
              <label>
                Float
                <input
                  name="floatValue"
                  inputMode="decimal"
                  defaultValue={item.floatValue ?? ""}
                />
              </label>
              <label>
                Seed
                <input
                  name="seed"
                  inputMode="numeric"
                  defaultValue={item.seed ?? ""}
                />
              </label>
              <label>
                StatTrak
                <select
                  name="stattrak"
                  defaultValue={item.stattrak ? "true" : "false"}
                >
                  <option value="false">Off</option>
                  <option value="true">On</option>
                </select>
              </label>
              <label>
                StatTrak count
                <input
                  name="stattrakCount"
                  inputMode="numeric"
                  defaultValue={item.stattrakCount}
                />
              </label>
              <label>
                Name tag
                <input
                  name="nametag"
                  maxLength={128}
                  defaultValue={item.nametag ?? ""}
                />
              </label>
              <label className="economy-check">
                <input type="checkbox" name="clearNametag" value="true" /> Clear
                name tag
              </label>
            </div>
            <label>
              Attributes JSON
              <textarea name="attributes" defaultValue={attributes} />
            </label>
            <label>
              Reason
              <input
                name="reason"
                required
                maxLength={180}
                defaultValue="Staff item correction"
              />
            </label>
            <button className="button button-primary" type="submit">
              Save customization
            </button>
          </form>
          <div className="economy-admin-actions">
            <form action="/api/admin/economy" method="post">
              <ActionFields csrf={csrf} action="state" steamId={steamId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input
                type="hidden"
                name="state"
                value={item.state === "revoked" ? "available" : "revoked"}
              />
              <input
                type="hidden"
                name="reason"
                value="Staff item state update"
              />
              <button
                className={
                  item.state === "revoked"
                    ? "staff-unban-button"
                    : "staff-danger-button"
                }
                type="submit"
              >
                {item.state === "revoked" ? "Restore available" : "Revoke item"}
              </button>
            </form>
            <form action="/api/admin/economy" method="post">
              <ActionFields csrf={csrf} action="transfer" steamId={steamId} />
              <input type="hidden" name="itemId" value={item.id} />
              <label>
                Transfer to SteamID64
                <input
                  name="toSteamId"
                  inputMode="numeric"
                  pattern="7656119[0-9]{10}"
                  required
                />
              </label>
              <input type="hidden" name="reason" value="Staff item transfer" />
              <button className="staff-unban-button" type="submit">
                Transfer
              </button>
            </form>
          </div>
        </details>
      ) : null}
    </article>
  );
}

function AccountPanel({
  account,
  csrf,
  canAdjustTokens,
  canManage,
  canManageLoadouts,
}: {
  account: StaffEconomyAccount;
  csrf: string;
  canAdjustTokens: boolean;
  canManage: boolean;
  canManageLoadouts: boolean;
}) {
  const availableItems = account.inventory.items.filter(
    (item) => item.state === "available",
  );
  return (
    <>
      <section className="content-grid economy-admin-summary">
        <article className="panel">
          <p className="eyebrow">
            <WalletCards aria-hidden="true" /> Token wallet
          </p>
          <h2>{formatTokens(account.wallet.balance)} Tokens</h2>
          <div className="tag-list">
            <span className="tag">
              {formatTokens(account.wallet.lifetimeEarned)} earned
            </span>
            <span className="tag">
              {formatTokens(account.wallet.lifetimeSpent)} spent
            </span>
            <span className="tag">
              {account.inventory.total} inventory instances
            </span>
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">
            <ArrowLeftRight aria-hidden="true" /> Pending trades
          </p>
          <h2>
            {account.pendingIncomingTrades + account.pendingOutgoingTrades}
          </h2>
          <p className="empty-copy">
            {account.pendingIncomingTrades} incoming ·{" "}
            {account.pendingOutgoingTrades} outgoing
          </p>
        </article>
      </section>
      {canAdjustTokens ? (
        <section className="panel economy-admin-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                <Coins aria-hidden="true" /> Wallet control
              </p>
              <h2>Award, take, or set Tokens</h2>
            </div>
          </div>
          <form
            className="form-panel economy-admin-form"
            action="/api/admin/economy"
            method="post"
          >
            <ActionFields
              csrf={csrf}
              action="tokens"
              steamId={account.steamId}
            />
            <div className="form-grid">
              <label>
                Action
                <select name="tokenAction" defaultValue="award">
                  <option value="award">Award</option>
                  <option value="take">Take</option>
                  <option value="set">Set balance</option>
                </select>
              </label>
              <label>
                Tokens
                <input name="amount" required inputMode="numeric" min="0" />
              </label>
            </div>
            <label>
              Reason
              <input
                name="reason"
                required
                maxLength={180}
                defaultValue="Staff Token adjustment"
              />
            </label>
            <button className="button button-primary" type="submit">
              Save Token change
            </button>
          </form>
        </section>
      ) : null}
      {canManageLoadouts ? (
        <section className="panel economy-admin-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                <SlidersHorizontal aria-hidden="true" /> Loadout control
              </p>
              <h2>Player loadout</h2>
              <p>Server refresh is queued after every change.</p>
            </div>
          </div>
          <div className="economy-loadout-list">
            {account.loadout.length ? (
              account.loadout.map((slot) => (
                <article key={slot.slotKey}>
                  <div>
                    <strong>{slot.slotKey}</strong>
                    <span>{slot.item?.displayName ?? "Empty"}</span>
                  </div>
                  <form action="/api/admin/economy" method="post">
                    <ActionFields
                      csrf={csrf}
                      action="clear-slot"
                      steamId={account.steamId}
                    />
                    <input
                      type="hidden"
                      name="slotType"
                      value={slot.slotType}
                    />
                    <input
                      type="hidden"
                      name="slotTeam"
                      value={slot.team ?? ""}
                    />
                    <input
                      type="hidden"
                      name="slotDefinitionIndex"
                      value={slot.definitionIndex ?? ""}
                    />
                    <input
                      type="hidden"
                      name="reason"
                      value="Staff loadout clear"
                    />
                    <button className="staff-unban-button" type="submit">
                      Clear
                    </button>
                  </form>
                </article>
              ))
            ) : (
              <p className="empty-copy">
                No loadout slots have been saved yet.
              </p>
            )}
          </div>
          <form
            className="form-panel economy-admin-form"
            action="/api/admin/economy"
            method="post"
          >
            <ActionFields
              csrf={csrf}
              action="equip"
              steamId={account.steamId}
            />
            <label>
              Owned available item
              <select name="itemId" required>
                <option value="">Choose item</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName} · {item.itemType} · {item.id}
                  </option>
                ))}
              </select>
            </label>
            <SlotFields />
            <label>
              Reason
              <input
                name="reason"
                required
                maxLength={180}
                defaultValue="Staff loadout assignment"
              />
            </label>
            <button className="button button-primary" type="submit">
              Set loadout slot
            </button>
          </form>
        </section>
      ) : null}
      {canManage ? (
        <section className="panel economy-admin-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                <Tag aria-hidden="true" /> Sticker control
              </p>
              <h2>Attach an existing or catalogue sticker</h2>
            </div>
          </div>
          <form
            className="form-panel economy-admin-form"
            action="/api/admin/economy"
            method="post"
          >
            <ActionFields
              csrf={csrf}
              action="attach-sticker"
              steamId={account.steamId}
            />
            <div className="form-grid">
              <label>
                Weapon item ID
                <input name="weaponItemId" required />
              </label>
              <label>
                Existing owned sticker ID
                <input name="stickerItemId" />
              </label>
              <label>
                Or sticker catalogue ID
                <input name="stickerCatalogueId" inputMode="numeric" />
              </label>
              <label>
                Sticker slot
                <input
                  name="stickerSlot"
                  required
                  inputMode="numeric"
                  min="0"
                  max="5"
                  defaultValue="0"
                />
              </label>
            </div>
            <label>
              Reason
              <input
                name="reason"
                required
                maxLength={180}
                defaultValue="Staff sticker attachment"
              />
            </label>
            <button className="button button-secondary" type="submit">
              Attach sticker
            </button>
          </form>
        </section>
      ) : null}
      <section className="economy-admin-inventory">
        <div className="section-heading compact">
          <p className="eyebrow">
            <Archive aria-hidden="true" /> Full inventory
          </p>
          <h2>{account.inventory.total} instances</h2>
        </div>
        {account.inventory.items.length ? (
          <div className="economy-admin-item-grid">
            {account.inventory.items.map((item) => (
              <ItemEditor
                key={item.id}
                item={item}
                steamId={account.steamId}
                csrf={csrf}
                canManage={canManage}
              />
            ))}
          </div>
        ) : (
          <p className="empty-copy">This player has no inventory items yet.</p>
        )}
      </section>
    </>
  );
}

export default async function AdminItemsPage({
  searchParams,
}: AdminItemsPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session)
    return (
      <SignInRequired
        title="Token item management"
        description="Sign in with an authorized Steam staff account to manage Tokens, inventory, and loadouts."
      />
    );

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.canViewEconomy)
    return (
      <main className="tapped-page">
        <div className="shell">
          <SiteHeader authenticated />
          <section className="staff-denied">
            <LockKeyhole aria-hidden="true" />
            <p className="tapped-kicker">Restricted area</p>
            <h1>Economy staff access required.</h1>
            <p>
              Your staff group does not have a TAPPED Token economy permission.
            </p>
            <Link className="button button-secondary" href="/admin">
              Back to staff panel
            </Link>
          </section>
        </div>
      </main>
    );

  const steamId = validSteamId(params.steamId);
  const accountQuery = (params.q ?? "").trim().slice(0, 17);
  const catalogueQuery = (params.catalogue ?? "").trim().slice(0, 120);
  const [accounts, catalogue, account, ledger] = await Promise.all([
    findStaffEconomyAccounts({
      query: accountQuery || undefined,
      pageSize: 25,
    }),
    getEconomyCatalogue({
      includeDisabled: true,
      query: catalogueQuery || undefined,
      pageSize: 100,
    }),
    steamId ? getStaffEconomyAccount(steamId) : Promise.resolve(null),
    steamId ? getTokenLedger(steamId, { pageSize: 25 }) : Promise.resolve(null),
  ]);
  const csrf = createAdminActionToken(session);
  const notice = noticeText(params.notice);
  const error = errorText(params.error);

  return (
    <main className="tapped-page staff-page economy-admin-page">
      <div className="shell">
        <SiteHeader authenticated />
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              <ShieldCheck aria-hidden="true" /> Staff economy
            </p>
            <h1>Item management</h1>
            <p>
              Manage player wallets, every inventory instance, loadout slots,
              stickers, and last-known market prices.
            </p>
          </div>
          <Link className="button button-secondary" href="/admin">
            Back to staff panel
          </Link>
        </section>
        {notice ? (
          <div className="notice notice-success" role="status">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        ) : null}
        <section className="economy-admin-search panel">
          <form action="/admin/items" method="get">
            <label>
              Player SteamID64
              <input
                name="steamId"
                inputMode="numeric"
                pattern="7656119[0-9]{10}"
                defaultValue={steamId ?? ""}
                placeholder="7656119..."
              />
            </label>
            <label>
              Account search
              <input
                name="q"
                defaultValue={accountQuery}
                placeholder="Known wallet SteamID64"
              />
            </label>
            <label>
              Catalogue search
              <input
                name="catalogue"
                defaultValue={catalogueQuery}
                placeholder="Skin, sticker, capsule..."
              />
            </label>
            <button className="button button-primary" type="submit">
              <Search aria-hidden="true" /> Search
            </button>
          </form>
          {accounts.accounts.length ? (
            <div className="economy-account-results">
              {accounts.accounts.map((entry) => (
                <Link
                  key={entry.steamId}
                  href={`/admin/items?steamId=${entry.steamId}&catalogue=${encodeURIComponent(catalogueQuery)}`}
                >
                  <strong>{entry.steamId}</strong>
                  <span>
                    {formatTokens(entry.wallet.balance)} Tokens ·{" "}
                    {entry.inventoryCount} items · {entry.pendingTradeCount}{" "}
                    trades
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              No wallet accounts match this search. A grant or Token adjustment
              creates the player wallet automatically.
            </p>
          )}
        </section>
        {account ? (
          <AccountPanel
            account={account}
            csrf={csrf}
            canAdjustTokens={access.canAdjustEconomyTokens}
            canManage={access.canManageEconomy}
            canManageLoadouts={access.canManageEconomyLoadouts}
          />
        ) : (
          <section className="panel economy-admin-empty">
            <PackagePlus aria-hidden="true" />
            <h2>Select a player to manage their items.</h2>
            <p className="empty-copy">
              Search by SteamID64 above. Item and Token changes are audited and
              use idempotent server actions.
            </p>
          </section>
        )}
        {access.canGrantEconomyItems ? (
          <section className="panel economy-admin-section">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  <Gift aria-hidden="true" /> Grant an item
                </p>
                <h2>Give a catalogue item or fully custom instance</h2>
                <p>
                  For a catalogue item, provide its ID. Leave it blank to create
                  a custom item with the fields below. Crates and capsules must
                  use a catalogue entry so they open against a configured loot
                  table.
                </p>
              </div>
            </div>
            <datalist id="economy-catalogue-options">
              {catalogue.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName} · {item.itemType}
                </option>
              ))}
            </datalist>
            <form
              className="form-panel economy-admin-form economy-admin-grant"
              action="/api/admin/economy"
              method="post"
            >
              <ActionFields
                csrf={csrf}
                action="grant"
                steamId={steamId ?? undefined}
              />
              <div className="form-grid">
                <label>
                  Target SteamID64
                  <input
                    name="steamId"
                    required
                    inputMode="numeric"
                    pattern="7656119[0-9]{10}"
                    defaultValue={steamId ?? ""}
                  />
                </label>
                <label>
                  Catalogue ID
                  <input
                    name="catalogueId"
                    list="economy-catalogue-options"
                    inputMode="numeric"
                    placeholder="Optional catalogue ID"
                  />
                </label>
                <label>
                  Custom type
                  <select name="itemType" defaultValue="skin">
                    {customItemTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Custom display name
                  <input
                    name="displayName"
                    maxLength={180}
                    placeholder="Required when no catalogue ID"
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
                  <input
                    name="rarityRank"
                    inputMode="numeric"
                    min="0"
                    max="255"
                  />
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
                Custom item metadata JSON
                <textarea
                  name="metadata"
                  placeholder='{"supportsNametag": true, "stickerSlots": 5}'
                />
              </label>
              <label>
                Instance attributes JSON
                <textarea
                  name="attributes"
                  placeholder='{"modelPath": "..."}'
                />
              </label>
              <label>
                Initial sticker array JSON{" "}
                <small>
                  Optional; each entry uses slot plus either catalogueId or
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
          </section>
        ) : null}
        {access.canManageEconomy ? (
          <section className="economy-price-section">
            <div className="section-heading compact">
              <p className="eyebrow">
                <Coins aria-hidden="true" /> Price snapshots
              </p>
              <h2>Marketplace catalogue results</h2>
              <p>{catalogue.total} matching entries</p>
            </div>
            {catalogue.items.length ? (
              <div className="economy-price-grid">
                {catalogue.items.map((item) => (
                  <article className="panel" key={item.id}>
                    <div>
                      <span className="badge">{item.itemType}</span>
                      <h3>{item.displayName}</h3>
                      <p className="empty-copy">
                        ID {item.id} · Direct price:{" "}
                        {formatPrice(item.directPurchasePriceTokens)}
                      </p>
                      <small>
                        {item.price
                          ? `Last recorded ${formatDate(item.price.observedAt)} from ${item.price.source}`
                          : "No price snapshot"}
                      </small>
                    </div>
                    <div className="economy-admin-actions">
                      <form action="/api/admin/economy" method="post">
                        <ActionFields csrf={csrf} action="market-name-set" />
                        <input
                          type="hidden"
                          name="catalogueId"
                          value={item.id}
                        />
                        <label>
                          Exact public market name
                          <input
                            name="marketHashName"
                            required
                            maxLength={255}
                            defaultValue={item.marketHashName ?? ""}
                            placeholder="AK-47 | Example (Field-Tested)"
                          />
                        </label>
                        <button className="staff-unban-button" type="submit">
                          Save market name
                        </button>
                      </form>
                      <form action="/api/admin/economy" method="post">
                        <ActionFields csrf={csrf} action="price-refresh" />
                        <input
                          type="hidden"
                          name="catalogueId"
                          value={item.id}
                        />
                        <button
                          className="staff-unban-button"
                          type="submit"
                          disabled={!item.marketHashName}
                        >
                          Refresh public price
                        </button>
                      </form>
                      <form action="/api/admin/economy" method="post">
                        <ActionFields csrf={csrf} action="price-set" />
                        <input
                          type="hidden"
                          name="catalogueId"
                          value={item.id}
                        />
                        <label>
                          EUR cents
                          <input
                            name="eurCents"
                            required
                            inputMode="numeric"
                            min="0"
                            defaultValue={item.price?.euroCents ?? ""}
                          />
                        </label>
                        <button className="staff-unban-button" type="submit">
                          Set last-known
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-copy">
                No catalogue entries match this filter. Run the server catalogue
                import before pricing or granting retained skins.
              </p>
            )}
          </section>
        ) : null}
        {ledger ? (
          <section className="economy-ledger-section">
            <div className="section-heading compact">
              <p className="eyebrow">
                <Coins aria-hidden="true" /> Immutable ledger
              </p>
              <h2>Recent Token activity</h2>
            </div>
            {ledger.entries.length ? (
              <div className="staff-table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Reason</th>
                      <th>Change</th>
                      <th>Balance</th>
                      <th>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.createdAt)}</td>
                        <td>
                          {entry.reason}
                          <small>{entry.referenceType}</small>
                        </td>
                        <td
                          className={
                            entry.delta >= 0
                              ? "economy-positive"
                              : "economy-negative"
                          }
                        >
                          {entry.delta >= 0 ? "+" : ""}
                          {formatTokens(entry.delta)}
                        </td>
                        <td>{formatTokens(entry.balanceAfter)}</td>
                        <td>{entry.actorSteamId ?? "System"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-copy">
                No Token activity has been recorded for this player.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
