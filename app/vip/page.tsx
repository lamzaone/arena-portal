import Link from "next/link";
import { Check, Crown, LockKeyhole, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { CSSProperties } from "react";

import { formatDate } from "@/components/formatters";
import { GroupBadge } from "@/components/group-badge";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getVipTiers, type VipTier } from "@/lib/content/game-catalogue";
import { getGroupPresentation } from "@/lib/content/group-presentation";
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

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

type VipPageProps = { searchParams: Promise<{ page?: string }> };

export default async function VipPage({ searchParams }: VipPageProps) {
  const session = await getSession();
  const { page: pageValue } = await searchParams;
  const requestedPage = getPageNumber(pageValue);
  const [tiers, player, vipRoster] = await Promise.all([
    getVipTiers(),
    session ? getPlayerDashboard(session.steamId) : Promise.resolve(null),
    getVipRoster(requestedPage)
  ]);
  const steamProfiles = await getSteamProfiles(vipRoster.vips.map((vip) => vip.steamId));
  const ownedNames = new Set((player?.vipGroups ?? []).map((group) => group.name.toUpperCase()));
  const currentTier = tiers.find((tier) => ownedNames.has(tier.name.toUpperCase())) ?? null;
  const currentVipPresentation = currentTier ? getGroupPresentation("vip", currentTier.name) : null;
  const totalPages = Math.max(1, Math.ceil(vipRoster.total / vipRoster.pageSize));
  const currentPage = Math.min(vipRoster.page, totalPages);

  return (
    <main className="tapped-page catalog-page">
      <div className="shell">
        <SiteHeader authenticated={Boolean(session)} />

        <section className="catalog-hero" aria-labelledby="vip-title">
          <div>
            <p className="tapped-kicker"><Crown aria-hidden="true" /> TAPPED.RO membership</p>
            <h1 id="vip-title">Choose your<br /><span>advantage.</span></h1>
            <p>Every current VIPCore benefit configured for ARENA.TAPPED.RO. Your current VIP status is checked against the game database after Steam login.</p>
          </div>
          <aside className="catalog-signal">
            <span className="signal-label">CURRENT VIP</span>
            <strong style={currentVipPresentation ? { color: currentVipPresentation.softColor, textShadow: `0 0 18px ${currentVipPresentation.color}66` } : undefined}>{currentTier?.name ?? (session ? "No active tier" : "Steam login required")}</strong>
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
                const presentation = getGroupPresentation("vip", tier.name);

                return <article className={`vip-card ${tier.name === "ULTIMATE" ? "vip-card-ultimate" : ""}`} key={tier.name} style={{ "--vip-tier-color": presentation.color, "--vip-tier-soft": presentation.softColor } as CSSProperties}>
                  <div className="vip-card-topline"><span>VIP {String(tier.weight).padStart(2, "0")}</span>{isOwned && <span className="owned-badge"><Check aria-hidden="true" /> Owned</span>}</div>
                  <h2><GroupBadge kind="vip" group={tier.name} /></h2>
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
          {vipRoster.vips.length ? <div className="leaderboard-scroll vip-roster-scroll"><table className="leaderboard-table vip-roster-table"><thead><tr><th>Player</th><th>VIP tier</th><th>Admin rank</th><th>Access</th></tr></thead><tbody>{vipRoster.vips.map((vip) => {
            const profile = steamProfiles.get(vip.steamId);
            const name = profile?.name || vip.name;
            return <tr key={`${vip.steamId}-${vip.group}`}><td><Link className="leaderboard-player" href={`/players/${vip.steamId}`}>{profile?.avatarFull ? <img src={profile.avatarFull} alt={`${name}'s Steam avatar`} referrerPolicy="no-referrer" /> : <span className="player-avatar-fallback" aria-hidden="true">{avatarInitial(name)}</span>}<div><strong>{name}</strong><small>SteamID64 {vip.steamId}</small></div></Link></td><td><GroupBadge kind="vip" group={vip.group} /></td><td>{vip.adminGroups.length ? <span className="vip-roster-role-badges">{vip.adminGroups.map((group) => <GroupBadge key={group.name} kind="admin" group={group.name} />)}</span> : <span className="role-empty">—</span>}</td><td><strong>{vip.expiresAt === 0 ? "Permanent" : `Until ${formatDate(vip.expiresAt)}`}</strong></td></tr>;
          })}</tbody></table></div> : <section className="vip-roster-empty"><UsersRound aria-hidden="true" /><h3>No active VIPs yet.</h3><p>VIPs with active or permanent access will appear here.</p></section>}
          <nav className="pagination vip-roster-pagination" aria-label="VIP roster pages"><Link className={currentPage <= 1 ? "is-disabled" : ""} aria-disabled={currentPage <= 1} href={`/vip?page=${Math.max(1, currentPage - 1)}`}>Previous</Link><span>Page {currentPage} of {totalPages}</span><Link className={currentPage >= totalPages ? "is-disabled" : ""} aria-disabled={currentPage >= totalPages} href={`/vip?page=${Math.min(totalPages, currentPage + 1)}`}>Next</Link></nav>
        </section>
      </div>
    </main>
  );
}
