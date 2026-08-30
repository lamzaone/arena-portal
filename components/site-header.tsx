import Link from "next/link";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";

import { getSession } from "@/lib/auth/session";
import { getAdminAccess } from "@/lib/admin/access";
import { AccountNav } from "@/components/account-nav";
import { PlayerIdentity } from "@/components/player-identity";
import { PrimaryNavigation } from "@/components/primary-navigation";
import { getSteamProfiles } from "@/lib/steam/profiles";
import { resolvePortalThemeSurface } from "@/lib/themes/registry";

type SiteHeaderProps = {
  authenticated?: boolean;
  themeKey?: string | null;
};

export async function SiteHeader({
  authenticated = false,
  themeKey,
}: SiteHeaderProps) {
  const session = authenticated ? await getSession() : null;
  const steamProfile = session ? (await getSteamProfiles([session.steamId])).get(session.steamId) : null;
  const staffAccess = session ? await getAdminAccess(session.steamId) : null;
  const displayName = steamProfile?.name ?? "Steam account";
  const effectiveThemeKey =
    themeKey === undefined ? session?.profileThemeKey : themeKey;
  const { theme: globalTheme } = resolvePortalThemeSurface(
    effectiveThemeKey,
    "global",
  );

  return (
    <>
      {/* The route may override the viewer theme when another surface owns the
          full page, such as a viewed player's profile. */}
      <header
        className="site-header"
        data-theme={globalTheme.key}
        data-theme-surface="global"
      >
        <Link className="brand" href="/" aria-label="TAPPED.RO home">
          <span className="brand-mark"><ShieldCheck aria-hidden="true" /></span>
          <span>TAPPED<span className="brand-accent">.</span>RO</span>
        </Link>
        <PrimaryNavigation />
        {session ? (
          <>
            <PlayerIdentity
              player={{
                steamId: session.steamId,
                displayName,
                avatarUrl: steamProfile?.avatarFull ?? null,
                presence: steamProfile?.presence ?? "unknown",
                profileThemeKey: session.profileThemeKey,
                identityGroups: [],
              }}
              variant="compact"
              className="header-account"
              secondary={session.steamId}
            />
            {staffAccess?.isAdmin ? <Link className="button button-quiet header-staff-link" href="/admin/bans" aria-label="Open staff panel"><ShieldCheck aria-hidden="true" /><span>Staff panel</span></Link> : null}
            <form action="/api/auth/logout" method="post">
              <button className="button button-quiet" type="submit"><LogOut aria-hidden="true" /> Sign out</button>
            </form>
          </>
        ) : (
          <a className="button button-primary" href="/api/auth/steam"><LogIn aria-hidden="true" /> Steam login</a>
        )}
      </header>
      {session ? (
        <AccountNav profileHref={`/players/${session.steamId}`} themeKey={globalTheme.key} />
      ) : null}
    </>
  );
}
