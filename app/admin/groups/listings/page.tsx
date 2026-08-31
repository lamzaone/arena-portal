import { randomUUID } from "node:crypto";

import {
  AlertTriangle,
  Coins,
  Crown,
  LockKeyhole,
  PackageCheck,
  Server,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { GroupAdminNav } from "@/components/group-admin-nav";
import { IdentityGroupBadge } from "@/components/identity-group-badge";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { AdminPageHeader } from "@/components/ui/admin-page-header";
import { PortalShell } from "@/components/ui/portal-shell";
import { SectionNav } from "@/components/ui/section-nav";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  getIdentityGroupListingAdminSnapshot,
  identityGroupListingStorageConfigured,
  isMissingIdentityGroupListingSchemaError,
  type IdentityGroupListing,
  type IdentityGroupListingAdminSnapshot,
  type IdentityGroupListingVipScope,
} from "@/lib/data/identity-group-listings";
import {
  getVipPerkAdminSnapshot,
  vipPerkStorageConfigured,
  type VipPerkAdminSnapshot,
  type VipPerkDefinition,
} from "@/lib/data/vip-perks";
import { isMissingVipPerkStorageSchemaError } from "@/lib/data/vip-perk-storage-errors";

import styles from "./group-listings.module.css";

const views = [
  { id: "memberships", label: "Group memberships", icon: Crown },
  { id: "perks", label: "Individual perk offers", icon: Sparkles },
] as const;
type View = (typeof views)[number]["id"];

function selectedView(value: string | undefined): View {
  return value === "perks" ? "perks" : "memberships";
}

function positiveInteger(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function Fields({ csrf, action }: { csrf: string; action: string }) {
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <input type="hidden" name="action" value={action} />
    </>
  );
}

function sourceName(source: IdentityGroupListing["group"]["sourceType"]) {
  if (source === "admins_core") return "Admins.Core";
  if (source === "vipcore") return "VIPCore";
  return "Portal group";
}

function durationLabel(minutes: number) {
  if (minutes === 0) return "Permanent";
  if (minutes % 43_200 === 0) {
    const months = minutes / 43_200;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes.toLocaleString()} minutes`;
}

function euroInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function PerkOptions({ perks }: { perks: VipPerkDefinition[] }) {
  return perks
    .filter((perk) => perk.enabled)
    .map((perk) => (
      <option key={perk.id} value={perk.id}>
        {perk.displayName} · {perk.key}
      </option>
    ));
}

const notices: Record<string, string> = {
  "listing-created": "Membership listing created and connected to its inventory item.",
  "listing-updated": "Membership listing, storefront visibility, and inventory item were updated.",
  "offer-saved": "Individual perk offer saved and enabled.",
  "offer-retired": "Individual perk offer disabled.",
};

const errors: Record<string, string> = {
  verification: "The form expired. Refresh and try again.",
  "founder-required": "Only the externally assigned Founder can manage listings.",
  founder_required: "Only the externally assigned Founder can manage listings.",
  invalid_input: "Review the submitted listing fields and try again.",
  group_not_found: "Choose an existing connected group.",
  group_disabled: "Enable the connected group before publishing this listing.",
  external_group_unavailable: "Refresh connected groups first; that Admins.Core or VIPCore definition is no longer current.",
  founder_listing_forbidden: "Founder is an external trust anchor and cannot be sold or granted through a portal listing.",
  listing_not_found: "That membership listing no longer exists.",
  staff_confirmation_required: "Confirm that this listing grants live game staff permissions.",
  vip_scope_unavailable: "That VIP tier is not enabled on the selected Arena server.",
  vip_scope_has_inventory: "This package has unconsumed copies. Retire it and create a new server-specific listing so owned items keep their original destination.",
  arena_storage_unavailable: "The Arena group database is unavailable. Check GAME_DATABASE_URL before changing a VIP package.",
  arena_target_conflict: "The selected group has conflicting Arena targets. Resolve its scopes before publishing it.",
  perk_not_found: "Choose an enabled individual perk.",
  perk_not_runtime_verified: "VIPCore has not recently reported that feature on the configured server.",
  offer_not_found: "That active individual perk offer no longer exists.",
  idempotency_conflict: "This request key was already used with different values. Refresh before trying again.",
  operation_in_progress: "That listing update is already being processed.",
  storage: "Listing storage is unavailable. Check the portal database and apply the required migrations.",
};

function ListingForm({
  csrf,
  listing,
  vipScopes,
}: {
  csrf: string;
  listing: IdentityGroupListing;
  vipScopes: IdentityGroupListingVipScope[];
}) {
  const staff = listing.group.sourceType === "admins_core";
  const vip = listing.group.sourceType === "vipcore";
  return (
    <form className={`staff-management-form ${styles.editForm}`} action="/api/admin/group-listings" method="post">
      <Fields csrf={csrf} action="listing-update" />
      <input type="hidden" name="listingId" value={listing.id} />
      <label>
        Listing name
        <input name="listingName" maxLength={180} defaultValue={listing.listingName} required />
      </label>
      <label>
        Duration (minutes)
        <input name="durationMinutes" type="number" min="0" max="525600" defaultValue={listing.durationMinutes} required />
        <small>0 is permanent; 43200 is approximately one month.</small>
      </label>
      <label>
        Donation price (EUR)
        <input name="euroPrice" type="number" min="0.01" max="10000000" step="0.01" defaultValue={euroInput(listing.euroPriceCents)} required />
      </label>
      <label>
        Market price (Tokens)
        <input name="tokenPrice" type="number" min="1" max="1000000000" defaultValue={listing.tokenPrice} required />
      </label>
      <label>
        Sort order
        <input name="sortOrder" type="number" min="-1000000" max="1000000" defaultValue={listing.sortOrder} required />
      </label>
      {vip ? (
        <label>
          VIP destination server
          <select name="vipServerId" defaultValue={listing.vipScope?.serverId ?? 0} required>
            {!vipScopes.length ? <option value="0">Shared / all Arena servers</option> : null}
            {vipScopes.map((scope) => (
              <option key={scope.scopeUuid} value={scope.serverId} disabled={!scope.hasDefinitions}>
                {scope.label} · {scope.description}
              </option>
            ))}
          </select>
          <small>The item activates in this exact Arena scope, matching /vip_manage.</small>
        </label>
      ) : <input type="hidden" name="vipServerId" value="0" />}
      <label className={styles.wide}>
        Description
        <input name="description" maxLength={255} defaultValue={listing.description ?? ""} placeholder={`Activates ${listing.group.displayName} membership.`} />
      </label>
      <fieldset className={styles.visibility}>
        <legend>Publication</legend>
        <label><input type="checkbox" name="enabled" defaultChecked={listing.enabled} /> Listing enabled</label>
        <label><input type="checkbox" name="vipPageEnabled" defaultChecked={listing.vipPageEnabled} /> VIP page · EUR donation</label>
        <label><input type="checkbox" name="marketEnabled" defaultChecked={listing.marketEnabled} /> Marketplace · Tokens</label>
      </fieldset>
      {staff ? (
        <label className={styles.staffConfirmation}>
          <input type="checkbox" name="confirmStaffAccess" required />
          <span><strong>I understand this grants live staff access.</strong><small>Activation adds this Admins.Core group and its permissions for the configured duration.</small></span>
        </label>
      ) : null}
      <button className="button button-primary" type="submit">Save listing</button>
    </form>
  );
}

export default async function GroupListingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    listing?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) {
    return <SignInRequired title="Founder sign-in required" description="Sign in with the externally assigned Founder account to manage membership and perk listings." />;
  }
  const access = await getAdminAccess(session.steamId);
  if (!access.isFounder || !access.canManageGroups) {
    return <PortalShell authenticated><section className="catalog-empty"><LockKeyhole aria-hidden="true" /><h1>Founder access required.</h1><p>Membership and individual perk listings are protected group-management actions.</p></section></PortalShell>;
  }

  const params = await searchParams;
  const activeView = selectedView(params.view);
  const selectedListingId = positiveInteger(params.listing);
  const csrf = createAdminActionToken(session);
  let listingSnapshot: IdentityGroupListingAdminSnapshot = { groups: [], listings: [], vipScopes: [] };
  let perkSnapshot: VipPerkAdminSnapshot = { perks: [], offers: [], customGroups: [], playerGrants: [], groupGrants: [], grantTotal: 0, grantPage: 1, grantPageSize: 50 };
  let storageError = false;
  let migrationNeeded: 19 | 20 | null = null;

  if (activeView === "memberships") {
    storageError = !identityGroupListingStorageConfigured();
    if (!storageError) {
      try {
        listingSnapshot = await getIdentityGroupListingAdminSnapshot();
      } catch (error) {
        storageError = true;
        migrationNeeded = isMissingIdentityGroupListingSchemaError(error) ? 20 : null;
        if (!migrationNeeded) console.error("Group listing admin snapshot failed", error);
      }
    }
  } else {
    storageError = !vipPerkStorageConfigured();
    if (!storageError) {
      try {
        perkSnapshot = await getVipPerkAdminSnapshot({ includeOffers: true, includeGrants: false });
      } catch (error) {
        storageError = true;
        migrationNeeded = isMissingVipPerkStorageSchemaError(error) ? 19 : null;
        if (!migrationNeeded) console.error("VIP perk offer admin snapshot failed", error);
      }
    }
  }


  return (
    <PortalShell authenticated className={`staff-page ${styles.page}`}>
      <AdminPageHeader
        id="group-listings-title"
        title="Group listings"
        description="Publish any connected group as an inventory-backed EUR donation or Token-market item, and manage standalone VIP perk offers from one compact workspace."
        access={access}
      />
      <StaffSubmenu access={access} active="groups" />
      <GroupAdminNav activeKey="listings" />
      <SectionNav activeKey={activeView} ariaLabel="Shop listing catalogues" dense items={views.map((entry) => ({ key: entry.id, href: `/admin/groups/listings?view=${entry.id}`, label: entry.label, icon: entry.icon }))} />

      {params.notice && notices[params.notice] ? <PortalToast message={notices[params.notice]} /> : null}
      {params.error ? <PortalToast variant="danger" message={errors[params.error] ?? "The listing action could not be completed."} /> : null}
      {storageError ? <PortalToast variant="danger" message={migrationNeeded
        ? `Listing tables are missing or incomplete. Apply db/0${migrationNeeded}_${migrationNeeded === 20 ? "identity_group_listings" : "vip_perks"}.sql to PORTAL_DATABASE_URL, then refresh.`
        : "Listing storage is unavailable. Configure PORTAL_DATABASE_URL and apply migrations 019 and 020."} /> : null}

      {activeView === "memberships" ? (
        <>
          <section className="staff-record-section" data-ui="group-listing-create">
            <div className="staff-section-heading"><div><p className="tapped-kicker"><PackageCheck aria-hidden="true" /> Inventory-backed access</p><h2>Create listing</h2></div><span>{listingSnapshot.groups.length} connected groups</span></div>
            <p className={styles.intro}>One definition controls both storefronts. EUR opens a private donation request from the VIP page; Tokens publish the same inventory item in the marketplace. Players activate the item from their inventory.</p>
            <form className={`staff-management-form ${styles.createForm}`} action="/api/admin/group-listings" method="post">
              <Fields csrf={csrf} action="listing-create" />
              <label>
                Connected group
                <select name="groupId" defaultValue="" required>
                  <option value="" disabled>Choose a group</option>
                  {listingSnapshot.groups.map((group) => <option key={group.id} value={group.id} disabled={!group.enabled}>{group.displayName} · {sourceName(group.sourceType)}{group.enabled ? "" : " · disabled"}</option>)}
                </select>
              </label>
              <label>
                VIP destination server
                <select name="vipServerId" defaultValue="0" required aria-describedby="vip-server-help">
                  {!listingSnapshot.vipScopes.length ? <option value="0">Shared / all Arena servers</option> : null}
                  {listingSnapshot.vipScopes.map((scope) => (
                    <option key={scope.scopeUuid} value={scope.serverId} disabled={!scope.hasDefinitions}>
                      {scope.label} · {scope.description}
                    </option>
                  ))}
                </select>
                <small id="vip-server-help">Used for VIPCore packages. Shared applies network-wide; a named server matches /vip_manage.</small>
              </label>
              <label>Listing name<input name="listingName" maxLength={180} placeholder="Gold VIP · 30 days" required /></label>
              <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="43200" required /><small>0 permanent · 1440 one day · 43200 one month</small></label>
              <label>Donation price (EUR)<input name="euroPrice" type="number" min="0.01" max="10000000" step="0.01" defaultValue="5.00" required /></label>
              <label>Market price (Tokens)<input name="tokenPrice" type="number" min="1" max="1000000000" defaultValue="500" required /></label>
              <label>Sort order<input name="sortOrder" type="number" min="-1000000" max="1000000" defaultValue="0" required /></label>
              <label className={styles.wide}>Description<input name="description" maxLength={255} placeholder="Short storefront description" /></label>
              <fieldset className={styles.visibility}><legend>Publish to</legend><label><input type="checkbox" name="enabled" defaultChecked /> Listing enabled</label><label><input type="checkbox" name="vipPageEnabled" defaultChecked /> VIP page · EUR</label><label><input type="checkbox" name="marketEnabled" defaultChecked /> Marketplace · Tokens</label></fieldset>
              <label className={styles.staffConfirmation}><input type="checkbox" name="confirmStaffAccess" /><span><strong>Confirm if the selected group is staff.</strong><small>Required for Admins.Core. A purchased staff listing grants real game permissions.</small></span></label>
              <button className="button button-primary" type="submit"><PackageCheck aria-hidden="true" /> Create inventory listing</button>
            </form>
          </section>

          <section className="staff-record-section" data-ui="group-listing-catalogue">
            <div className="staff-section-heading"><div><p className="tapped-kicker"><Crown aria-hidden="true" /> Publication matrix</p><h2>Membership listings</h2></div><span>{listingSnapshot.listings.length} variants</span></div>
            <div className={styles.listingList}>
              {listingSnapshot.listings.map((listing) => {
                const channels = [listing.vipPageEnabled ? "VIP page" : null, listing.marketEnabled ? "Market" : null].filter(Boolean).join(" + ") || "Hidden";
                return (
                  <details className={styles.listing} id={`listing-${listing.id}`} key={listing.id} open={listing.id === selectedListingId} data-enabled={listing.enabled ? "true" : "false"}>
                    <summary>
                      <span className={styles.listingIdentity}><IdentityGroupBadge group={listing.group} compact /><span><strong>{listing.listingName}</strong><small>{listing.group.displayName} · {sourceName(listing.group.sourceType)}</small></span></span>
                      <span className={styles.listingFacts}>{listing.group.sourceType === "vipcore" ? <span className={styles.scopeFact}><Server aria-hidden="true" /> {listing.vipScope?.label ?? "Arena scope unavailable"}</span> : null}<span>{durationLabel(listing.durationMinutes)}</span><span>EUR {euroInput(listing.euroPriceCents)}</span><span>{listing.tokenPrice.toLocaleString()} Tokens</span><span className={styles.status} data-enabled={listing.enabled ? "true" : "false"}>{listing.enabled ? channels : "Disabled"}</span></span>
                    </summary>
                    {listing.group.sourceType === "admins_core" ? <aside className={styles.dangerNote}><ShieldAlert aria-hidden="true" /><div><strong>Staff permission listing</strong><span>Anyone who activates this item receives the connected Admins.Core group for the configured duration.</span></div></aside> : null}
                    <ListingForm csrf={csrf} listing={listing} vipScopes={listingSnapshot.vipScopes} />
                  </details>
                );
              })}
              {!listingSnapshot.listings.length && !storageError ? <p className="empty-copy">No membership listings yet. Create the first variant above.</p> : null}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="staff-record-section" data-ui="perk-offer-create">
            <div className="staff-section-heading"><div><p className="tapped-kicker"><Coins aria-hidden="true" /> Individual features</p><h2>Create perk offer</h2></div><span>Token shop only</span></div>
            <p className={styles.intro}>Standalone perks remain separate from group membership items. VIPCore must report the selected feature as live before an offer can be enabled.</p>
            <form className={`staff-management-form ${styles.perkCreateForm}`} action="/api/admin/vip-perks" method="post">
              <Fields csrf={csrf} action="offer-save" />
              <label>VIP perk<select name="perkId" defaultValue="" required><option value="" disabled>Choose an enabled perk</option><PerkOptions perks={perkSnapshot.perks} /></select></label>
              <label>Duration (minutes)<input name="durationMinutes" type="number" min="1" max="525600" defaultValue="43200" required /></label>
              <label>Price (Tokens)<input name="tokenPrice" type="number" min="1" max="1000000000" defaultValue="1000" required /></label>
              <button className="button button-primary" type="submit"><Sparkles aria-hidden="true" /> Publish offer</button>
            </form>
          </section>

          <section className="staff-record-section" data-ui="perk-offer-catalogue">
            <div className="staff-section-heading"><div><p className="tapped-kicker"><Sparkles aria-hidden="true" /> Token variants</p><h2>Individual perk offers</h2></div><span>{perkSnapshot.offers.length} offers</span></div>
            <div className={styles.perkOfferList}>
              {perkSnapshot.offers.map((offer) => (
                <article className={styles.perkOffer} key={offer.id} data-enabled={offer.enabled ? "true" : "false"}>
                  <div className={styles.perkOfferIdentity}><Sparkles aria-hidden="true" /><span><strong>{offer.perkName}</strong><small>{offer.perkKey} · {durationLabel(offer.durationMinutes)}</small></span></div>
                  <span className={styles.runtime} data-verified={offer.runtimeVerified ? "true" : "false"}>{offer.runtimeVerified ? "Runtime verified" : "Runtime unavailable"}</span>
                  <form className={styles.perkEditForm} action="/api/admin/vip-perks" method="post">
                    <Fields csrf={csrf} action="offer-save" />
                    <input type="hidden" name="perkId" value={offer.perkId} />
                    <input type="hidden" name="durationMinutes" value={offer.durationMinutes} />
                    <label><span>Token price</span><input name="tokenPrice" type="number" min="1" max="1000000000" defaultValue={offer.tokenPrice} required /></label>
                    <button className="button button-secondary" type="submit">Save & enable</button>
                  </form>
                  {offer.enabled ? <form action="/api/admin/vip-perks" method="post"><Fields csrf={csrf} action="offer-retire" /><input type="hidden" name="offerId" value={offer.id} /><button className={styles.disableButton} type="submit">Disable</button></form> : <span className={styles.disabledLabel}>Disabled</span>}
                </article>
              ))}
              {!perkSnapshot.offers.length && !storageError ? <p className="empty-copy">No individual perk offers yet.</p> : null}
            </div>
          </section>
        </>
      )}

      <aside className={styles.auditNote}><AlertTriangle aria-hidden="true" /><span>All changes are server-validated and audited. Membership listing edits update the connected catalogue projection; items already owned keep the membership details captured when they were granted or purchased.</span></aside>
    </PortalShell>
  );
}
