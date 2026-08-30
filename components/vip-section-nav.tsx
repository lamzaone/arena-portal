import Link from "next/link";
import { Crown, Sparkles } from "lucide-react";

import styles from "./vip-section-nav.module.css";

export function VipSectionNav({ active }: { active: "memberships" | "perks" }) {
  return (
    <nav className={styles.nav} aria-label="VIP sections">
      <Link className={active === "memberships" ? styles.active : undefined} href="/vip" aria-current={active === "memberships" ? "page" : undefined}>
        <Crown aria-hidden="true" />
        <span><strong>Memberships</strong><small>VIP tiers and roster</small></span>
      </Link>
      <Link className={active === "perks" ? styles.active : undefined} href="/vip/perks" aria-current={active === "perks" ? "page" : undefined}>
        <Sparkles aria-hidden="true" />
        <span><strong>Individual perks</strong><small>Token shop and active perks</small></span>
      </Link>
    </nav>
  );
}
