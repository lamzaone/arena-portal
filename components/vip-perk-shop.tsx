"use client";

import { Coins, LockKeyhole, ShoppingBag, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { createEconomyIdempotencyKey, postEconomyAction } from "@/components/economy/economy-request";
import { PortalToast } from "@/components/success-toast";
import { AsyncButton } from "@/components/ui/async-button";
import type { EffectiveVipPerk, VipPerkShopOffer } from "@/lib/data/vip-perks";
import { formatPerkDuration } from "@/lib/vip-perks/format";

import styles from "@/app/vip/perks/vip-perks.module.css";

type VipPerkShopProps = {
  offers: VipPerkShopOffer[];
  owned: EffectiveVipPerk[];
  csrf: string;
  initialBalance: number;
  authenticated: boolean;
};

export function VipPerkShop({ offers, owned, csrf, initialBalance, authenticated }: VipPerkShopProps) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [pendingOfferId, setPendingOfferId] = useState<number | null>(null);
  const [purchasedExpirations, setPurchasedExpirations] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ variant: "success" | "danger"; message: string } | null>(null);
  const attemptKeys = useRef(new Map<number, string>());
  const ownedByKey = useMemo(() => new Map(owned.map((entry) => [entry.perk.key, entry])), [owned]);
  const groups = useMemo(() => {
    const result = new Map<string, VipPerkShopOffer[]>();
    for (const offer of offers) result.set(offer.perkKey, [...(result.get(offer.perkKey) ?? []), offer]);
    return [...result.values()];
  }, [offers]);

  async function purchase(offer: VipPerkShopOffer) {
    setPendingOfferId(offer.id);
    setNotice(null);
    const requestId = attemptKeys.current.get(offer.id) ?? createEconomyIdempotencyKey();
    attemptKeys.current.set(offer.id, requestId);
    try {
      const result = await postEconomyAction("/api/economy/vip-perks/purchase", csrf, { offerId: offer.id }, requestId);
      attemptKeys.current.delete(offer.id);
      if (typeof result.balance === "number") setBalance(result.balance);
      if (result.expiresAt) setPurchasedExpirations((current) => ({ ...current, [offer.perkKey]: result.expiresAt! }));
      setNotice({ variant: "success", message: result.message ?? `${offer.perkName} was added to your account.` });
      router.refresh();
    } catch (error) {
      setNotice({ variant: "danger", message: error instanceof Error ? error.message : "The VIP perk could not be purchased." });
    } finally {
      setPendingOfferId(null);
    }
  }

  if (!groups.length) {
    return <div className={styles.empty}><ShoppingBag aria-hidden="true" /><h3>No perk offers are live.</h3><p>Staff can publish timed Token offers from the group management panel.</p></div>;
  }

  return (
    <>
      <div className={styles.balance}><Coins aria-hidden="true" /><span>Available balance</span><strong>{balance.toLocaleString()} Tokens</strong></div>
      <div className={styles.shopGrid}>
        {groups.map((perkOffers) => {
          const first = perkOffers[0];
          const current = ownedByKey.get(first.perkKey);
          const currentExpiry = purchasedExpirations[first.perkKey] ?? current?.expiresAt;
          const ownedPermanently = Boolean(current && current.expiresAt === null);
          return (
            <article className={styles.shopCard} key={first.perkKey}>
              <div className={styles.cardHeading}>
                <span className={styles.perkIcon}><Sparkles aria-hidden="true" /></span>
                <div><span>{first.perkCategory}</span><h3>{first.perkName}</h3></div>
              </div>
              <p>{first.perkDescription ?? "A standalone VIPCore perk for your account."}</p>
              {current || currentExpiry ? <div className={styles.ownedState}><strong>Currently active</strong><span>{currentExpiry ? `Until ${new Date(currentExpiry).toLocaleString()}` : "Permanent"}</span></div> : null}
              <div className={styles.offerList}>
                {perkOffers.map((offer) => (
                  <div className={styles.offerRow} key={offer.id}>
                    <div><strong>{formatPerkDuration(offer.durationMinutes)}</strong><span>{offer.tokenPrice.toLocaleString()} Tokens</span></div>
                    {authenticated ? (
                      <AsyncButton
                        className="button button-primary"
                        pending={pendingOfferId === offer.id}
                        disabled={pendingOfferId !== null || balance < offer.tokenPrice || ownedPermanently}
                        pendingLabel="Buying"
                        icon={<Coins />}
                        onClick={() => purchase(offer)}
                      >
                        {ownedPermanently
                          ? "Owned permanently"
                          : balance < offer.tokenPrice
                            ? "Not enough Tokens"
                            : "Buy perk"}
                      </AsyncButton>
                    ) : (
                      <a className="button button-primary" href="/api/auth/steam"><LockKeyhole aria-hidden="true" /> Sign in</a>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {notice ? <PortalToast variant={notice.variant} message={notice.message} onDismiss={() => setNotice(null)} /> : null}
    </>
  );
}
