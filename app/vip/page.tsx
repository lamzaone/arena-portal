import Link from "next/link";
import { Check, Crown, LockKeyhole, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
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
import { getSession } from "@/lib/auth/session";
import { getVipTiers, type VipTier } from "@/lib/content/game-catalogue";
import { identityExternalBadgeLookupKey } from "@/lib/content/identity-group-badges";
import {
  getIdentityGroupBadgeCatalogue,
  type IdentityGroupBadgeData,
} from "@/lib/data/identity-groups";
import { getPlayerDashboard, getVipRoster } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";

function basePrice(tiers: VipTier[], tier: VipTier) {
  const tierIndex = tiers.findIndex((item) => item.name === tier.name);
  return Math.max(5, (tiers.length - tierIndex) * 5);
}

function requestUrl(tier: VipTier, plan: "access" | "permanent", price: number) {
  return `/tickets?vip=${encodeURIComponent(tier.name)}&plan=${plan}&price=${price}`;
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
  const [tiers, player, vipRoster, badgeCatalogue] = await Promise.all([
    getVipTiers(),
    session ? getPlayerDashboard(session.steamId) : Promise.resolve(null),
    getVipRoster(requestedPage),
    getIdentityGroupBadgeCatalogue(),
  ]);
  const steamProfiles = await getSteamProfiles(vipRoster.vips.map((vip) => vip.steamId));
  const ownedNames = new Set((player?.vipGroups ?? []).map((group) => group.name.toUpperCase()));
  const currentTier = tiers.find((tier) => ownedNames.has(tier.name.toUpperCase())) ?? null;
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
            <p>Every current VIPCore benefit configured for ARENA.TAPPED.RO. Your current VIP status is checked against the game database after Steam login.</p>
          </div>
          <aside className="catalog-signal">
            <span className="signal-label">CURRENT VIP</span>
            <strong style={currentVipBadge ? { color: currentVipBadge.badgeSoftColor, textShadow: `0 0 18px ${currentVipBadge.badgeColor}66` } : undefined}>{currentTier?.name ?? (session ? "No active tier" : "Steam login required")}</strong>
            <small>{currentTier ? "Higher tiers stay available as upgrades." : "Five tiers. EUR 5 steps. Permanent access is 3x."}</small>
          </aside>
        </section>

        {tiers.length ? (
          <section className="vip-catalogue" aria-label="VIP tiers">
            <div className="catalog-section-heading">
              <div><p className="tapped-kicker"><Sparkles aria-hidden="true" /> Current VIPCore configuration</p><h2>Benefits without the guesswork.</h2></div>
              <p>VIP access is priced in EUR 5 tier steps. A permanent option costs three times the relevant access or upgrade price.</p>
            </div>
            <div className="vip-card-grid">
              {tiers.map((tier) => {
                const price = basePrice(tiers, tier);
                const isOwned = currentTier?.name === tier.name;
                const includedByHigherTier = Boolean(currentTier && currentTier.weight > tier.weight);
                const canUpgrade = Boolean(currentTier && currentTier.weight < tier.weight);
                const upgradePrice = canUpgrade ? price - basePrice(tiers, currentTier!) : price;
                const badge = vipBadges.get(
                  identityExternalBadgeLookupKey("vipcore", tier.name),
                );

                return <article className={`vip-card ${tier.name === "ULTIMATE" ? "vip-card-ultimate" : ""}`} key={tier.name} style={badge ? { "--vip-tier-color": badge.badgeColor, "--vip-tier-soft": badge.badgeSoftColor } as CSSProperties : undefined}>
                  <div className="vip-card-topline"><span>VIP {String(tier.weight).padStart(2, "0")}</span>{isOwned && <span className="owned-badge"><Check aria-hidden="true" /> Owned</span>}</div>
                  <h2>{badge ? <IdentityGroupBadge group={badge} /> : tier.name}</h2>
                  <p className="vip-price">EUR {price}<small>access price</small></p>
                  <ul className="vip-benefit-list">
                    {tier.benefits.map((benefit) => <li key={benefit.name}><Check aria-hidden="true" /><span><strong>{benefit.name}</strong><small>{benefit.detail}</small></span></li>)}
                  </ul>
                  <div className="vip-actions">
                    {!session ? <Link className="purchase-button" href="/api/auth/steam"><LockKeyhole aria-hidden="true" /> Login to buy</Link> : isOwned ? <button className="purchase-button is-disabled" disabled>Already owned</button> : includedByHigherTier ? <button className="purchase-button is-disabled" disabled>Included with {currentTier?.name}</button> : <>
                      <Link className="purchase-button" href={requestUrl(tier, "access", upgradePrice)}>{canUpgrade ? `Upgrade - EUR ${upgradePrice}` : `Buy - EUR ${price}`}</Link>
                      <Link className="purchase-button purchase-button-secondary" href={requestUrl(tier, "permanent", upgradePrice * 3)}>Permanent - EUR {upgradePrice * 3}</Link>
                    </>}
                  </div>
                </article>;
              })}
            </div>
            <p className="catalog-disclaimer"><ShieldCheck aria-hidden="true" /> Buy and upgrade buttons open a private VIP purchase request with staff until a payment checkout is connected.</p>
          </section>
        ) : <section className="catalog-empty"><Crown aria-hidden="true" /><h2>VIP configuration is not available yet.</h2><p>The portal&apos;s bundled VIP catalogue needs to be refreshed from the server configuration.</p></section>}

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
