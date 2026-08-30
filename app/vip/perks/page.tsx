import { Clock3, Coins, Sparkles, UsersRound } from "lucide-react";

import { formatDate } from "@/components/formatters";
import { PlayerIdentity } from "@/components/player-identity";
import { DataTable } from "@/components/ui/data-table";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { ThemedPlayerTableRow } from "@/components/ui/themed-player-table-row";
import { VipPerkShop } from "@/components/vip-perk-shop";
import { VipSectionNav } from "@/components/vip-section-nav";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getPlayerIdentityGroupBadges } from "@/lib/data/portal-repository";
import { getEffectiveVipPerkPage, getVipPerkStorefront, vipPerkStorageConfigured } from "@/lib/data/vip-perks";
import { isMissingVipPerkStorageSchemaError } from "@/lib/data/vip-perk-storage-errors";
import { resolvePlayerIdentities } from "@/lib/player-identities";

import styles from "./vip-perks.module.css";

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function VipPerksPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession();
  const requestedPage = pageNumber((await searchParams).page);
  let storefront: Awaited<ReturnType<typeof getVipPerkStorefront>> = { offers: [], owned: [], balance: 0 };
  let roster: Awaited<ReturnType<typeof getEffectiveVipPerkPage>> = { entries: [], total: 0, page: requestedPage, pageSize: 25 };
  let storageError = !vipPerkStorageConfigured();
  let migrationNeeded = false;
  if (!storageError) {
    try {
      [storefront, roster] = await Promise.all([
        getVipPerkStorefront(session?.steamId),
        getEffectiveVipPerkPage(requestedPage, 25),
      ]);
    } catch (error) {
      storageError = true;
      migrationNeeded = isMissingVipPerkStorageSchemaError(error);
      if (!migrationNeeded) console.error("VIP perk storefront failed", error);
    }
  }
  const rosterSteamIds = [...new Set(roster.entries.map((entry) => entry.steamId))];
  const identityGroups = await getPlayerIdentityGroupBadges(rosterSteamIds);
  const identities = await resolvePlayerIdentities(
    rosterSteamIds.map((steamId) => ({
      steamId,
      identityGroups: identityGroups.get(steamId) ?? [],
    })),
  );
  const totalPages = Math.max(1, Math.ceil(roster.total / roster.pageSize));
  const currentPage = Math.min(roster.page, totalPages);

  return (
    <PortalShell authenticated={Boolean(session)} className={`catalog-page vip-page ${styles.page}`}>
      <section className={`catalog-hero ${styles.hero}`} aria-labelledby="vip-perks-title">
        <div>
          <p className="tapped-kicker"><Sparkles aria-hidden="true" /> Individual VIP perks</p>
          <h1 id="vip-perks-title">Build your<br /><span>own advantage.</span></h1>
          <p>Buy individual, timed VIPCore features with Tokens or receive them through a custom community group. Every entitlement has a visible source and expiry.</p>
        </div>
        <aside className="catalog-signal">
          <span className="signal-label">PERK WALLET</span>
          <strong>{session ? `${storefront.balance.toLocaleString()} Tokens` : "Steam login required"}</strong>
          <small>{storefront.owned.length ? `${storefront.owned.length} perk${storefront.owned.length === 1 ? "" : "s"} active on your account.` : "Purchase offers stack their remaining time."}</small>
        </aside>
      </section>

      <VipSectionNav active="perks" />

      {storageError ? <aside className={styles.storageNotice} role="status"><Sparkles aria-hidden="true" /><div><strong>{migrationNeeded ? "VIP perk tables are missing or incomplete." : "VIP perks are being connected."}</strong><span>{migrationNeeded ? "Apply db/019_vip_perks.sql to the database configured by PORTAL_DATABASE_URL, then refresh this page." : "Configure VIP perk storage and apply portal migration 019 to publish offers and active entitlements."}</span></div></aside> : null}

      <section className={styles.shop} aria-labelledby="perk-shop-title">
        <div className="catalog-section-heading">
          <div><p className="tapped-kicker"><Coins aria-hidden="true" /> Token shop</p><h2 id="perk-shop-title">Choose one perk at a time.</h2></div>
          <p>Prices and durations are locked again by the server when you buy. Purchasing the same perk extends its existing direct entitlement.</p>
        </div>
        <VipPerkShop offers={storefront.offers} owned={storefront.owned} csrf={session ? createEconomyActionToken(session) : ""} initialBalance={storefront.balance} authenticated={Boolean(session)} />
      </section>

      <section className={styles.roster} aria-labelledby="perk-roster-title">
        <div className="catalog-section-heading">
          <div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> Active entitlement roster</p><h2 id="perk-roster-title">Who has which perks.</h2></div>
          <p>{roster.total.toLocaleString()} active player-perk entitlement{roster.total === 1 ? "" : "s"}. Group and direct sources are combined without hiding the effective expiration.</p>
        </div>
        {roster.entries.length ? (
          <DataTable className={styles.tableScroll} tableClassName={styles.table} caption="Active individual VIP perks">
            <thead><tr><th scope="col">Player</th><th scope="col">Perk</th><th scope="col">Source</th><th scope="col">Expiration</th></tr></thead>
            <tbody>
              {roster.entries.map((entry) => (
                <ThemedPlayerTableRow profileThemeKey={identities[entry.steamId]?.profileThemeKey ?? null} key={`${entry.steamId}:${entry.perk.id}`}>
                  <td><PlayerIdentity player={identities[entry.steamId] ?? { steamId: entry.steamId, displayName: entry.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="table" showSteamId={false} /></td>
                  <td><span className={styles.perkName}><Sparkles aria-hidden="true" /><span><strong>{entry.perk.displayName}</strong><small>{entry.perk.category}</small></span></span></td>
                  <td><div className={styles.sources}>{entry.sources.map((source) => <span key={source}>{source}</span>)}</div></td>
                  <td><span className={styles.expiry}><Clock3 aria-hidden="true" /><strong>{entry.expiresAt ? formatDate(new Date(entry.expiresAt).valueOf() / 1000) : "Permanent"}</strong></span></td>
                </ThemedPlayerTableRow>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <div className={styles.empty}><UsersRound aria-hidden="true" /><h3>No active standalone perks.</h3><p>Purchased and staff-granted perks will appear here.</p></div>
        )}
        {totalPages > 1 ? <LinkPagination className={styles.pagination} page={currentPage} totalPages={totalPages} label="VIP perk roster pages" hrefForPage={(page) => `/vip/perks?page=${page}`} /> : null}
      </section>
    </PortalShell>
  );
}
