import Link from "next/link";
import { LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";

import { getSession } from "@/lib/auth/session";
import { getAdminAccess } from "@/lib/admin/access";
import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import { getSteamProfiles } from "@/lib/steam/profiles";

type SiteHeaderProps = {
  authenticated?: boolean;
};

export async function SiteHeader({ authenticated = false }: SiteHeaderProps) {
  const session = authenticated ? await getSession() : null;
  const steamProfile = session ? (await getSteamProfiles([session.steamId])).get(session.steamId) : null;
  const staffAccess = session ? await getAdminAccess(session.steamId) : null;
  const displayName = steamProfile?.name ?? "Steam account";

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="TAPPED.RO home">
        <span className="brand-mark"><ShieldCheck aria-hidden="true" /></span>
        <span>TAPPED<span className="brand-accent">.</span>RO</span>
      </Link>
      <nav className="main-nav" aria-label="Primary navigation">
        <Link href="/">Home</Link>
        <Link href="/modes">Modes</Link>
        <Link href="/vip">VIP</Link>
        <Link href="/ranking">Ranking</Link>
      </nav>
      {session ? (
        <>
          <Link className="header-account" href="/dashboard" aria-label={`Open ${displayName}'s profile`}>
            <ResilientRemoteImage src={steamProfile?.avatarFull} alt="" referrerPolicy="no-referrer" fallback={<span className="header-account-avatar-fallback" aria-hidden="true"><UserRound /></span>} />
            <span className="header-account-copy"><strong>{displayName}</strong><small>{session.steamId}</small></span>
          </Link>
          {staffAccess?.isAdmin ? <Link className="button button-quiet header-staff-link" href="/admin">Staff panel</Link> : null}
          <form action="/api/auth/logout" method="post">
            <button className="button button-quiet" type="submit"><LogOut aria-hidden="true" /> Sign out</button>
          </form>
        </>
      ) : (
        <Link className="button button-primary" href="/api/auth/steam"><LogIn aria-hidden="true" /> Steam login</Link>
      )}
    </header>
  );
}
