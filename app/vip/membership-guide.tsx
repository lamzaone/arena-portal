import { ArrowDown, ArrowRight, Check, Crown, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";

import type { GroupListingGroup, IdentityGroupListing } from "@/lib/data/identity-group-listings";
import type { VipTier } from "@/lib/data/vip-tier-catalogue";
import { formatIdentityGroupListingDuration as duration, formatIdentityGroupListingPrice as price } from "@/lib/identity-group-listing-presentation";
import styles from "./vip.module.css";

type MembershipOption = { group: GroupListingGroup; listings: IdentityGroupListing[]; tier: VipTier | null };

export function MembershipGuide({ options, currentTierName }: { options: MembershipOption[]; currentTierName: string | null }) {
  const tiers = options.filter((option) => option.tier);
  const benefits = [...new Set(tiers.flatMap(({ tier }) => tier?.benefits.map((benefit) => benefit.name) ?? []))];
  const highestWeight = Math.max(...tiers.map(({ tier }) => tier!.weight));

  return (
    <section className={styles.guide} aria-labelledby="vip-guide-title">
      <div className={styles.guideHeading}>
        <div><p className="tapped-kicker"><Crown aria-hidden="true" /> Find your membership</p><h2 id="vip-guide-title">Your tier. Your extras.</h2></div>
        <p>Compare the benefits first, then choose a duration. Your membership begins when you activate the delivered item.</p>
      </div>
      <div className={styles.tierOverview}>
        {options.map(({ group, listings, tier }) => {
          const lowest = listings.reduce((best, listing) => listing.euroPriceCents < best.euroPriceCents ? listing : best, listings[0]);
          const current = tier?.name === currentTierName;
          const position = tier ? tiers.findIndex((option) => option.group.id === group.id) + 1 : null;
          return (
            <a key={group.id} className={styles.tierShortcut} href={`#vip-membership-${group.id}`} data-current={current || undefined} data-panel-light style={{ "--vip-tier-color": group.badgeColor, "--vip-tier-soft": group.badgeSoftColor } as CSSProperties}>
              <div className={styles.shortcutTop}><span>{position ? `Tier ${String(position).padStart(2, "0")}` : "Community"}</span>{current ? <span className={styles.shortcutFlag}><Check aria-hidden="true" /> Current</span> : tier?.weight === highestWeight ? <Crown aria-hidden="true" /> : <Sparkles aria-hidden="true" />}</div>
              <strong>{group.displayName}</strong>
              <span className={styles.shortcutBenefits}>{tier?.benefits.length ? `${tier.benefits.length} configured benefits` : "View membership details"}</span>
              <div className={styles.shortcutPrice}><span>From <strong>{price(lowest.euroPriceCents)}</strong><small>{duration(lowest.durationMinutes)}</small></span><ArrowDown aria-hidden="true" /></div>
            </a>
          );
        })}
      </div>
      {tiers.length > 1 && benefits.length ? (
        <details className={styles.comparison}>
          <summary><span><ShieldCheck aria-hidden="true" /><span>Compare every benefit<small>See the exact extras included with each tier</small></span></span><span className={styles.comparisonToggle} aria-hidden="true">+</span></summary>
          <div className={styles.comparisonScroll} role="region" aria-label="Membership benefits comparison" tabIndex={0}>
            <table className={styles.comparisonTable}>
              <caption className="sr-only">Current configured membership benefits by tier</caption>
              <thead><tr><th scope="col">Benefit</th>{tiers.map(({ group }) => <th scope="col" key={group.id} style={{ "--vip-tier-color": group.badgeColor } as CSSProperties}>{group.displayName}</th>)}</tr></thead>
              <tbody>{benefits.map((name) => <tr key={name}><th scope="row">{name}</th>{tiers.map(({ group, tier }) => {
                const benefit = tier!.benefits.find((entry) => entry.name === name);
                return <td key={group.id}>{benefit ? <span className={styles.comparisonBenefit}><Check aria-hidden="true" />{benefit.detail || "Included"}</span> : <span className={styles.notIncluded}><span aria-hidden="true">—</span><span className="sr-only">Not included</span></span>}</td>;
              })}</tr>)}</tbody>
            </table>
          </div>
          <p className={styles.comparisonNote}>Benefits follow the current server configuration. Individual perks are available separately in the Token shop.</p>
        </details>
      ) : null}
      <ol className={styles.membershipSteps} aria-label="How to get a membership">
        <li><span className={styles.stepNumber}>01</span><div><strong>Choose &amp; request</strong><p>Pick your tier and duration. Open a private request to arrange payment with staff.</p></div><ArrowRight aria-hidden="true" /></li>
        <li><span className={styles.stepNumber}>02</span><div><strong>Receive your item</strong><p>After confirmation, staff delivers the membership item to your inventory.</p></div><PackageCheck aria-hidden="true" /></li>
        <li><span className={styles.stepNumber}>03</span><div><strong>Activate when ready</strong><p>Use the item in your inventory. Review any upgrade or time conversion before confirming.</p></div><ShieldCheck aria-hidden="true" /></li>
      </ol>
    </section>
  );
}
