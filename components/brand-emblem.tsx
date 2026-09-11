import Image from "next/image";
import Link from "next/link";

import styles from "./brand-emblem.module.css";

type BrandEmblemProps = {
  className?: string;
  width?: number;
  priority?: boolean;
};

export function BrandEmblem({ className = "", width = 36, priority = false }: BrandEmblemProps) {
  return (
    <Image
      src="/images/branding/tapped-emblem.svg"
      alt=""
      aria-hidden="true"
      width={width}
      height={Math.round(width * 0.9)}
      priority={priority}
      className={`${styles.emblem} ${className}`}
    />
  );
}

export function SiteBrand() {
  return (
    <Link className={`brand ${styles.wordmark}`} href="/" aria-label="TAPPED.RO home">
      <BrandEmblem width={40} priority />
      <span>TAPPED<span className="brand-accent">.</span>RO</span>
    </Link>
  );
}
