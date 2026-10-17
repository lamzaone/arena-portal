import Link from "next/link";
import { redirect } from "next/navigation";
import { Ban, History, Search, ShieldCheck } from "lucide-react";

import { formatDate, isActiveSanction } from "@/components/formatters";
import { PlayerIdentity } from "@/components/player-identity";
import { DataTable } from "@/components/ui/data-table";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { ThemedPlayerTableRow } from "@/components/ui/themed-player-table-row";
import { SearchNavigationForm, SearchSubmitButton } from "@/components/ui/search-field";
import { ServerSearchField } from "@/components/ui/server-search-field";
import { getSession } from "@/lib/auth/session";
import { getBansPage } from "@/lib/data/bans";
import { resolvePlayerIdentities, type PlayerIdentityData } from "@/lib/player-identities";
import { buildPageMetadata } from "@/lib/seo/site";
import { isIndividualSteamId64 } from "@/lib/steam/steam-id";

import styles from "./page.module.css";

export const metadata = buildPageMetadata("/bans");
type SearchParams = { q?: string | string[]; page?: string | string[] };

function bansLink(page: number, query: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (query) params.set("q", query);
  return `/bans?${params}`;
}

function fallbackIdentity(steamId: string, displayName: string): PlayerIdentityData {
  return { steamId, displayName, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] };
}

function BanDate({ value }: { value: number }) {
  return value ? <time dateTime={new Date(value * 1000).toISOString()}>{formatDate(value)}</time> : <>Permanent</>;
}

export default async function BansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const query = (typeof params.q === "string" ? params.q : "").trim().slice(0, 64);
  const page = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const listing = await getBansPage(page, query);
  const totalPages = Math.max(1, Math.ceil(listing.total / listing.pageSize));
  if (listing.available && listing.page > totalPages) redirect(bansLink(totalPages, query));
  const identities = await resolvePlayerIdentities(listing.bans.flatMap(ban => [
    { steamId: ban.steamId, displayName: ban.playerName },
    { steamId: ban.adminSteamId, displayName: ban.adminName },
  ]));

  return <PortalShell authenticated={Boolean(session)} className={styles.page}>
    <header className={styles.hero}>
      <div>
        <p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Community moderation</p>
        <h1>Bans<span aria-hidden="true">.</span></h1>
        <p>Search the server's ban history. See the reason, who issued it, and when it expires.</p>
      </div>
      <div className={styles.heroNote}><Ban aria-hidden="true" /><span>Open to everyone<strong>Server ban records</strong><small>Active and expired bans, newest first.</small></span></div>
    </header>

    <section className={styles.records} aria-labelledby="ban-history-title">
      <div className={styles.heading}>
        <div><p className="tapped-kicker"><History aria-hidden="true" /> Server history</p><h2 id="ban-history-title">Ban list</h2></div>
        {listing.available ? <span>{listing.total.toLocaleString()} {listing.total === 1 ? "record" : "records"}</span> : null}
      </div>
      <SearchNavigationForm className={styles.search} action="/bans" aria-label="Search ban records" resetFields={["page"]}>
        <ServerSearchField id="bans-search" name="q" label="Player name or SteamID" maxLength={64} defaultValue={query} placeholder="Find a player..." />
        <SearchSubmitButton />
      </SearchNavigationForm>

      {!listing.available ? <div className={styles.empty} role="status"><Ban aria-hidden="true" /><h3>Ban history is temporarily unavailable.</h3><p>Please try again in a moment.</p></div>
        : listing.bans.length ? <>
          <DataTable className={styles.tableFrame} tableClassName={styles.table} caption="Public server ban records">
            <thead><tr><th scope="col">Player</th><th scope="col">Reason</th><th scope="col">Issued by</th><th scope="col">Status</th></tr></thead>
            <tbody>{listing.bans.map(ban => {
              const player = identities[ban.steamId] ?? fallbackIdentity(ban.steamId, ban.playerName);
              const issuer = identities[ban.adminSteamId] ?? fallbackIdentity(ban.adminSteamId, ban.adminName);
              const active = isActiveSanction(ban.expiresAt);
              return <ThemedPlayerTableRow profileThemeKey={player.profileThemeKey} key={ban.id}>
                <td><PlayerIdentity player={player} variant="table" hoverCard={false} /></td>
                <td className={styles.reason}><strong>{ban.reason || "No reason provided"}</strong><small><BanDate value={ban.createdAt} /> UTC{ban.global ? " · Global" : ""}</small></td>
                <td>{isIndividualSteamId64(ban.adminSteamId) ? <PlayerIdentity player={issuer} variant="inline" showSteamId={false} hoverCard={false} /> : <span className={styles.console}>{ban.adminName}</span>}</td>
                <td><span className={`${styles.status} ${active ? styles.active : styles.expired}`}>{active ? "Active" : "Expired"}</span><small className={styles.expiry}><BanDate value={ban.expiresAt} />{ban.expiresAt ? " UTC" : ""}</small></td>
              </ThemedPlayerTableRow>;
            })}</tbody>
          </DataTable>
          <LinkPagination page={listing.page} totalPages={totalPages} label="Ban list pages" hrefForPage={target => bansLink(target, query)} />
        </> : <div className={styles.empty} role="status"><Search aria-hidden="true" /><h3>{query ? "No bans match this search." : "No bans recorded."}</h3><p>{query ? "Try another player name or SteamID." : "Server bans will appear here when they are issued."}</p></div>}
    </section>
  </PortalShell>;
}
