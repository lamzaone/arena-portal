import Link from "next/link";
import { Menu } from "lucide-react";

/** The primary links are static and stay fully usable in route fallbacks. */
export function PrimaryNavigation() {
  return (
    <>
      <nav className="main-nav" aria-label="Primary navigation">
        <Link href="/">Home</Link>
        <Link href="/modes">Modes</Link>
        <Link href="/vip">VIP</Link>
        <Link href="/ranking">Ranking</Link>
      </nav>
      <details className="mobile-nav">
        <summary aria-label="Primary navigation menu">
          <Menu aria-hidden="true" />
        </summary>
        <nav aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/modes">Modes</Link>
          <Link href="/vip">VIP</Link>
          <Link href="/ranking">Ranking</Link>
        </nav>
      </details>
    </>
  );
}
