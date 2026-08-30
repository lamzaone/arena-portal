import Link from "next/link";
import { Check, Clock3, Crown, LockKeyhole, PackageCheck, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { CSSProperties } from "react";

import { formatDate } from "@/components/formatters";
import {
  IdentityGroupBadge,
  IdentityGroupBadgeList,
} from "@/components/identity-group-badge";
import { PlayerIdentity } from "@/components/player-identity";
import { DataTable } from "@/components/ui/data-table";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { ThemedPlayerTableRow } from "@/components/ui/themed-player-table-row";
import { VipSectionNav } from "@/components/vip-section-nav";
import { getSession } from "@/lib/auth/session";
import { getVipTiers } from "@/lib/content/game-catalogue";
import { identityExternalBadgeLookupKey } from "@/lib/content/identity-group-badges";
import {
  getEffectiveIdentity,
  getIdentityGroupBadgeCatalogue,
  type IdentityGroupBadgeData,
} from "@/lib/data/identity-groups";
import {
  getVipPageIdentityGroupListings,
  identityGroupListingStorageConfigured,
  isMissingIdentityGroupListingSchemaError,
  type IdentityGroupListing,
} from "@/lib/data/identity-group-listings";
import { getPlayerDashboard, getVipRoster } from "@/lib/data/portal-repository";
import {
  formatIdentityGroupListingDuration as duration,
  formatIdentityGroupListingPrice as price,
} from "@/lib/identity-group-listing-presentation";
import { getSteamProfiles } from "@/lib/steam/profiles";

import styles from "./vip.module.css";

function requestUrl(listing: IdentityGroupListing) {
  return `/tickets?listing=${encodeURIComponent(String(listing.id))}`;
}

function sourceName(listing: IdentityGroupListing) {
  if (listing.group.sourceType === "admins_core") return "Admins.Core";
  if (listing.group.sourceType === "vipcore") return "VIPCore";
  return "Portal group";
}

async function loadMembershipListings() {
  if (!identityGroupListingStorageConfigured()) {
    return { listings: [] as IdentityGroupListing[], storageError: true, migrationNeeded: false };
  }
  try {
    return {
      listings: await getVipPageIdentityGroupListings(),
      storageError: false,
      migrationNeeded: false,
    };
  } catch (error) {
    const migrationNeeded = isMissingIdentityGroupListingSchemaError(error);
    if (!migrationNeeded) console.error("VIP membership storefront failed", error);
    return { listings: [] as IdentityGroupListing[], storageError: true, migrationNeeded };
  }
}

function getPageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

type VipPageProps = { searchParams: Promise<{ page?: string }> };

export default async function VipPage({ searchParams }: VipPageProps) {
  const session = await getSession();
  const { page: pageValue } = await searchParams;
  const requestedPage = getPageNumber(pageValue);
  const [tiers, player, vipRoster, badgeCatalogue, listingState] = await Promise.all([
    getVipTiers(),
    session ? getPlayerDashboard(session.steamId) : Promise.resolve(null),
    getVipRoster(requestedPage),
    getIdentityGroupBadgeCatalogue(),
    loadMembershipListings(),
  ]);
  const { listings, storageError: listingStorageError, migrationNeeded: listingMigrationNeeded } = listingState;
  const [effectiveIdentity, steamProfiles] = await Promise.all([
    session && player
      ? getEffectiveIdentity({
          steamId: session.steamId,
          vipGroupNames: player.vipGroups.map((group) => group.externalKey ?? group.name),
          adminGroupNames: player.adminGroups.map((group) => group.externalKey ?? group.name),
        })
      : Promise.resolve(null),
    getSteamProfiles(vipRoster.vips.map((vip) => vip.steamId)),
  ]);
  const ownedNames = new Set([
    ...(player?.vipGroups ?? []).map((group) => group.name.toUpperCase()),
    ...(effectiveIdentity?.groups ?? [])
      .filter((group) => group.sourceType === "vipcore")
      .map((group) => (group.externalKey ?? group.displayName).toUpperCase()),
  ]);
  const currentTier = tiers.find((tier) => ownedNames.has(tier.name.toUpperCase())) ?? null;
  const effectiveGroups = new Map((effectiveIdentity?.groups ?? []).map((group) => [group.id, group]));
  const vipBadges = new Map(
    badgeCatalogue
      .filter(
        (group): group is IdentityGroupBadgeData & { externalKey: string } =>
          group.sourceType === "vipcore" && Boolean(group.externalKey),
      )
      .map((group) => [
        identityExternalBadgeLookupKey("vipcore", group.externalKey),
        group,
      ]),
  );
  const currentVipBadge = currentTier
    ? vipBadges.get(
        identityExternalBadgeLookupKey("vipcore", currentTier.name),
      ) ?? null
    : null;
  const totalPages = Math.max(1, Math.ceil(vipRoster.total / vipRoster.pageSize));
  const currentPage = Math.min(vipRoster.page, totalPages);

  return (
    <PortalShell authenticated={Boolean(session)} className="catalog-page vip-page">

        <section className="catalog-hero" aria-labelledby="vip-title">
          <div>
            <p className="tapped-kicker"><Crown aria-hidden="true" /> TAPPED.RO membership</p>
            <h1 id="vip-title">Choose your<br /><span>advantage.</span></h1>
            <p>Published VIPCore tiers and connected community memberships, delivered as auditable inventory items. Your active access is checked again after Steam login.</p>
          </div>
          <aside className="catalog-signal">
            <span className="signal-label">CURRENT VIP</span>
            <strong style={currentVipBadge ? { color: currentVipBadge.badgeSoftColor, textShadow: `0 0 18px ${currentVipBadge.badgeColor}66` } : undefined}>{currentTier?.name ?? (session ? "No active tier" : "Steam login required")}</strong>
            <small>{currentTier ? "Active membership items can extend or upgrade your access." : `${listings.length} published membership option${listings.length === 1 ? "" : "s"}.`}</small>
          </aside>
        </section>

        <VipSectionNav active="memberships" />

        {listingStorageError ? <aside className={styles.storageNotice} role="status"><PackageCheck aria-hidden="true" /><div><strong>{listingMigrationNeeded ? "Membership listing tables are missing." : "Membership listings are being connected."}</strong><span>{listingMigrationNeeded ? "Staff must apply db/020_identity_group_listings.sql to the portal database." : "Configure the portal database to publish EUR donation options."}</span></div></aside> : null}

        {listings.length ? (
          <section className={`vip-catalogue ${styles.catalogue}`} aria-label="Published group memberships">
            <div className="catalog-section-heading">
              <div><p className="tapped-kicker"><Sparkles aria-hidden="true" /> Published membership items</p><h2>Choose your access.</h2></div>
              <p>Each donation creates a private purchase request. Staff delivers the exact inventory item shown here; activate it from your inventory when it arrives.</p>
            </div>
            <div className={styles.listingGrid}>
              {listings.map((listing) => {
                const tier = listing.group.sourceType === "vipcore"
                  ? tiers.find((entry) => entry.name.toUpperCase() === (listing.group.externalKey ?? "").toUpperCase()) ?? null
                  : null;
                const membership = effectiveGroups.get(listing.groupId);
                const targetNames = new Set(
                  [listing.group.externalKey, listing.group.displayName]
                    .filter((value): value is string => Boolean(value))
                    .map((value) => value.trim().toLocaleLowerCase("en-US")),
                );
                const nativeVipMembership = listing.group.sourceType === "vipcore"
                  ? player?.vipGroups.find((group) =>
                      [group.externalKey, group.name]
                        .filter((value): value is string => Boolean(value))
                        .some((value) => targetNames.has(value.trim().toLocaleLowerCase("en-US")))) ?? null
                  : null;
                const nativeAdminMembership = listing.group.sourceType === "admins_core"
                  ? player?.adminGroups.find((group) =>
                      [group.externalKey, group.name]
                        .filter((value): value is string => Boolean(value))
                        .some((value) => targetNames.has(value.trim().toLocaleLowerCase("en-US")))) ?? null
                  : null;
                const permanentOwned = Boolean(membership && (
                  nativeVipMembership?.expiresAt === 0 ||
                  Boolean(nativeAdminMembership) ||
                  (membership.hasPortalMembership && membership.membershipExpiresAt === null)
                ));
                const isOwned = Boolean(membership);
                const action = permanentOwned
                  ? "Permanent access owned"
                  : isOwned
                    ? `Extend · ${price(listing.euroPriceCents)}`
                    : listing.durationMinutes === 0
                      ? `Buy permanent · ${price(listing.euroPriceCents)}`
                      : `Buy ${duration(listing.durationMinutes)} · ${price(listing.euroPriceCents)}`;

                return <article data-ui="membership-listing" className={`vip-card ${styles.listingCard}`} key={listing.id} style={{ "--vip-tier-color": listing.group.badgeColor, "--vip-tier-soft": listing.group.badgeSoftColor } as CSSProperties}>
                  <div className="vip-card-topline"><span>{sourceName(listing)}</span>{isOwned ? <span className="owned-badge"><Check aria-hidden="true" /> Active</span> : <span>{duration(listing.durationMinutes)}</span>}</div>
                  <div className={styles.cardTitle}><IdentityGroupBadge group={listing.group} compact /><h2>{listing.listingName}</h2></div>
                  <p className="vip-price">{price(listing.euroPriceCents)}<small>{duration(listing.durationMinutes)} access item</small></p>
                  <p className={styles.description}>{listing.description ?? listing.group.description ?? `Activates ${listing.group.displayName} membership when used from your inventory.`}</p>
                  {tier ? <details className={styles.benefits}><summary>{tier.benefits.length} included VIPCore benefits</summary><ul className="vip-benefit-list">{tier.benefits.map((benefit) => <li key={benefit.name}><Check aria-hidden="true" /><span><strong>{benefit.name}</strong><small>{benefit.detail}</small></span></li>)}</ul></details> : <div className={styles.delivery}><Clock3 aria-hidden="true" /><span><strong>{duration(listing.durationMinutes)}</strong><small>Connected {sourceName(listing)} access</small></span></div>}
                  <div className="vip-actions">
                    {!session ? <Link className="purchase-button" href="/api/auth/steam"><LockKeyhole aria-hidden="true" /> Login to request</Link> : permanentOwned ? <button className="purchase-button is-disabled" disabled>{action}</button> : <Link className="purchase-button" href={requestUrl(listing)}><PackageCheck aria-hidden="true" /> {action}</Link>}
                  </div>
                </article>;
              })}
            </div>
            <p className="catalog-disclaimer"><ShieldCheck aria-hidden="true" /> Purchase buttons open a private donation request with staff until a payment checkout is connected. The listing ID, duration, and current EUR price are resolved again by the server.</p>
          </section>
        ) : !listingStorageError ? <section className="catalog-empty"><Crown aria-hidden="true" /><h2>No membership listings are published.</h2><p>Staff can publish monthly, permanent, custom, VIPCore, or Admins.Core group items from the group listing editor.</p></section> : null}

        <section className="vip-roster" aria-labelledby="vip-roster-title">
          <div className="catalog-section-heading">
            <div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> VIPCore roster</p><h2 id="vip-roster-title">Current VIPs.</h2></div>
            <p>{vipRoster.total.toLocaleString()} active VIP{vipRoster.total === 1 ? "" : "s"} on ARENA.TAPPED.RO. Profiles open publicly from the roster.</p>
          </div>
          {vipRoster.vips.length ? (
            <DataTable
              className="vip-roster-scroll"
              tableClassName="vip-roster-table"
              caption="Current ARENA VIP roster"
            >
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">VIP tier</th>
                  <th scope="col">Admin rank</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {vipRoster.vips.map((vip) => {
                  const profile = steamProfiles.get(vip.steamId);
                  const name = profile?.name || vip.name;
                  const vipGroup = vip.identityGroups.find(
                    (group) =>
                      group.sourceType === "vipcore" &&
                      identityExternalBadgeLookupKey(
                        "vipcore",
                        group.externalKey ?? group.displayName,
                      ) ===
                        identityExternalBadgeLookupKey("vipcore", vip.group),
                  );
                  const adminGroups = vip.identityGroups.filter(
                    (group) => group.sourceType === "admins_core",
                  );
                  const customGroups = vip.identityGroups.filter(
                    (group) => group.sourceType === "custom",
                  );

                  return (
                    <ThemedPlayerTableRow
                      profileThemeKey={vip.profileThemeKey}
                      key={`${vip.steamId}-${vip.group}`}
                    >
                      <td>
                        <PlayerIdentity
                          player={{
                            steamId: vip.steamId,
                            displayName: name,
                            avatarUrl: profile?.avatarFull ?? null,
                            presence: profile?.presence ?? "unknown",
                            profileThemeKey: vip.profileThemeKey,
                            identityGroups: customGroups,
                          }}
                          variant="table"
                          showSteamId={false}
                        />
                      </td>
                      <td>
                        {vipGroup ? (
                          <IdentityGroupBadge group={vipGroup} compact />
                        ) : (
                          <span className="role-empty">{vip.group}</span>
                        )}
                      </td>
                      <td>
                        <IdentityGroupBadgeList
                          groups={adminGroups}
                          compact
                          className="vip-roster-role-badges"
                        />
                        {adminGroups.length ? null : (
                          <span className="role-empty">—</span>
                        )}
                      </td>
                      <td>
                        <strong>
                          {vip.expiresAt === 0
                            ? "Permanent"
                            : `Until ${formatDate(vip.expiresAt)}`}
                        </strong>
                      </td>
                    </ThemedPlayerTableRow>
                  );
                })}
              </tbody>
            </DataTable>
          ) : (
            <section className="vip-roster-empty">
              <UsersRound aria-hidden="true" />
              <h3>No active VIPs yet.</h3>
              <p>VIPs with active or permanent access will appear here.</p>
            </section>
          )}
          <LinkPagination
            className="vip-roster-pagination"
            page={currentPage}
            totalPages={totalPages}
            label="VIP roster pages"
            hrefForPage={(targetPage) => `/vip?page=${targetPage}`}
          />
        </section>
    </PortalShell>
  );
}
