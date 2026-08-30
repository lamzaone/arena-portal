import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "@/components/ui/section-nav.module.css";

export type SectionNavItem = {
  key: string;
  href: string;
  label: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  scroll?: boolean;
};

export function SectionNav({
  activeKey,
  ariaLabel,
  className,
  dense = false,
  items,
}: {
  activeKey: string;
  ariaLabel: string;
  className?: string;
  dense?: boolean;
  items: readonly SectionNavItem[];
}) {
  return (
    <nav
      data-ui="section-nav"
      className={[styles.nav, dense ? styles.dense : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
    >
      <div className={styles.track} data-part="track">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;
          return (
            <Link
              className={styles.item}
              data-part="item"
              data-active={active ? "true" : "false"}
              key={item.key}
              href={item.href}
              scroll={item.scroll ?? false}
              aria-current={active ? "page" : undefined}
            >
              {Icon ? <Icon aria-hidden="true" /> : null}
              <span className={styles.label}>{item.label}</span>
              {item.badge !== undefined ? (
                <span className={styles.badge}>{item.badge}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
