import Link from "next/link";
import { ChevronLeft, ChevronRight, Crown, Crosshair, Medal, Trophy, UsersRound } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { GroupBadge } from "@/components/group-badge";
import { PlayerSearchField } from "@/components/player-search-field";
import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import { SearchNavigationForm, SearchSubmitButton } from "@/components/ui/search-field";
import { getSession } from "@/lib/auth/session";
import { getLevelRank } from "@/lib/content/levelranks";
import { getLeaderboard } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";

import styles from "./ranking-search.module.css";

type RankingPageProps = { searchParams: Promise<{ page?: string; q?: string }> };

function getPageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function rankingLink(page: number, query: string) {
  const parameters = new URLSearchParams({ page: String(page) });
  if (query) parameters.set("q", query);
  return `/ranking?${parameters.toString()}`;
}

export default async function RankingPage({ searchParams }: RankingPageProps) {
  const params = await searchParams;
  const requestedPage = getPageNumber(params.page);
  const query = (params.q ?? "").trim().slice(0, 64);
  const [session, leaderboard] = await Promise.all([getSession(), getLeaderboard(requestedPage, 25, query)]);
  const profiles = await getSteamProfiles(leaderboard.players.map((player) => player.steamId));
  const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
  const page = Math.min(leaderboard.page, totalPages);

  return (
    <main className="tapped-page ranking-page">
      <div className="shell">
        <SiteHeader authenticated={Boolean(session)} />
        <section className="ranking-hero" aria-labelledby="ranking-title">
          <div><p className="tapped-kicker"><Trophy aria-hidden="true" /> TAPPED.RO leaderboard</p><h1 id="ranking-title">Every point<br /><span>has a place.</span></h1><p>The top ARENA.TAPPED.RO players, ordered by K4 LevelRanks points. Each displayed rank is derived from the current K4 rank ladder.</p></div>
          <aside className="ranking-summary"><Crown aria-hidden="true" /><span>COMPETITORS</span><strong>{leaderboard.total.toLocaleString()}</strong><small>25 players per page</small></aside>
        </section>

        <section className="leaderboard-section" aria-labelledby="leaderboard-title">
          <div className="leaderboard-heading">
            <div>
              <p className="tapped-kicker"><Crosshair aria-hidden="true" /> Monthly race</p>
              <h2 id="leaderboard-title">{query ? "Search results" : "Top players"}</h2>
            </div>
            <div className="leaderboard-controls">
              <SearchNavigationForm className={styles.form} action="/ranking">
                <PlayerSearchField
                  className={styles.field}
                  id="leaderboard-search"
                  name="q"
                  label="Find a player"
                  mode="query"
                  defaultQuery={query}
                  placeholder="Name or SteamID64"
                  includeSelf
                  autoSubmitOnSelect
                />
                <SearchSubmitButton className={styles.submit} alignWithLabel iconOnly aria-label="Search leaderboard">
                  Search leaderboard
                </SearchSubmitButton>
              </SearchNavigationForm>
              <span>Page {page} / {totalPages}</span>
            </div>
          </div>
          {leaderboard.players.length ? <div className="leaderboard-scroll"><table className="leaderboard-table"><thead><tr><th scope="col">Position</th><th scope="col">K4 rank</th><th scope="col">Player</th><th scope="col">Points</th><th scope="col">K</th><th scope="col">D</th><th scope="col">MVPs</th></tr></thead><tbody>{leaderboard.players.map((player, index) => {
            const profile = profiles.get(player.steamId);
            const displayName = profile?.name || player.name;
            const position = (page - 1) * leaderboard.pageSize + index + 1;
            const levelRank = getLevelRank(player.points);
            return <tr key={player.steamId}><td><span className={`leaderboard-position position-${Math.min(position, 3)}`}>{position <= 3 ? <Medal aria-hidden="true" /> : `#${position}`}</span></td><td><span className="leaderboard-level-rank" style={{ color: levelRank.hex }}><strong>{levelRank.tag}</strong><small>{levelRank.name}</small></span></td><td><Link className="leaderboard-player" href={`/players/${player.steamId}`}><ResilientRemoteImage src={profile?.avatarFull} alt="" referrerPolicy="no-referrer" fallback={<span className="player-avatar-fallback" aria-hidden="true">{avatarInitial(displayName)}</span>} /><div><strong>{displayName}</strong><small>{player.steamId}</small><span className="leaderboard-role-badges">{player.vipGroups.map((group) => <GroupBadge key={`vip-${group.name}`} kind="vip" group={group.name} />)}{player.adminGroups.map((group) => <GroupBadge key={`admin-${group.name}`} kind="admin" group={group.name} />)}</span></div></Link></td><td className="points-cell">{player.points.toLocaleString()}</td><td>{player.kills.toLocaleString()}</td><td>{player.deaths.toLocaleString()}</td><td>{player.mvps.toLocaleString()}</td></tr>;
          })}</tbody></table></div> : <div className="ranking-empty"><UsersRound aria-hidden="true" /><h2>No ranking data yet.</h2><p>Players appear here after K4 LevelRanks has created their server record.</p></div>}
          <nav className="pagination" aria-label="Leaderboard pages"><Link className={page <= 1 ? "is-disabled" : ""} aria-disabled={page <= 1} href={rankingLink(Math.max(1, page - 1), query)}><ChevronLeft aria-hidden="true" /> Previous</Link><span>Page {page} of {totalPages}</span><Link className={page >= totalPages ? "is-disabled" : ""} aria-disabled={page >= totalPages} href={rankingLink(Math.min(totalPages, page + 1), query)}>Next <ChevronRight aria-hidden="true" /></Link></nav>
        </section>
      </div>
    </main>
  );
}
