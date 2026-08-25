import Link from "next/link";
import { Check, Crown, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getVipTiers, type VipTier } from "@/lib/content/game-catalogue";
import { getPlayerDashboard } from "@/lib/data/portal-repository";

function basePrice(tiers: VipTier[], tier: VipTier) {
  const tierIndex = tiers.findIndex((item) => item.name === tier.name);
  return Math.max(5, (tiers.length - tierIndex) * 5);
}

function requestUrl(tier: VipTier, plan: "access" | "permanent", price: number) {
  return `/tickets?vip=${encodeURIComponent(tier.name)}&plan=${plan}&price=${price}`;
}

export default async function VipPage() {
  const session = await getSession();
  const [tiers, player] = await Promise.all([
    getVipTiers(),
    session ? getPlayerDashboard(session.steamId) : Promise.resolve(null)
  ]);
  const ownedNames = new Set((player?.vipGroups ?? []).map((group) => group.toUpperCase()));
  const currentTier = tiers.find((tier) => ownedNames.has(tier.name.toUpperCase())) ?? null;

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
            <strong>{currentTier?.name ?? (session ? "No active tier" : "Steam login required")}</strong>
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

                return <article className={`vip-card ${tier.name === "ULTIMATE" ? "vip-card-ultimate" : ""}`} key={tier.name}>
                  <div className="vip-card-topline"><span>VIP {String(tier.weight).padStart(2, "0")}</span>{isOwned && <span className="owned-badge"><Check aria-hidden="true" /> Owned</span>}</div>
                  <h2>{tier.name}</h2>
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
      </div>
    </main>
  );
}
