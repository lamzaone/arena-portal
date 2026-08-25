import Link from "next/link";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";

type SiteHeaderProps = {
  authenticated?: boolean;
};

export function SiteHeader({ authenticated = false }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="TAPPED.RO home">
        <span className="brand-mark"><ShieldCheck aria-hidden="true" /></span>
        <span>TAPPED<span className="brand-accent">.</span>RO</span>
      </Link>
      <nav className="main-nav" aria-label="Primary navigation">
        <Link href="/#modes">Modes</Link>
        <Link href="/#vip">VIP</Link>
        <Link href="/#rewards">Rewards</Link>
        <Link href="/#server">Server</Link>
        {authenticated && <Link href="/dashboard">Profile</Link>}
      </nav>
      {authenticated ? (
        <form action="/api/auth/logout" method="post">
          <button className="button button-quiet" type="submit"><LogOut aria-hidden="true" /> Sign out</button>
        </form>
      ) : (
        <Link className="button button-primary" href="/api/auth/steam"><LogIn aria-hidden="true" /> Steam login</Link>
      )}
    </header>
  );
}
