import Link from "next/link";
import {
  Archive,
  ArrowRight,
  Boxes,
  LockKeyhole,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react";

import { StaffInventoryPanel } from "@/components/economy/staff-inventory-panel";
import { PlayerIdentity } from "@/components/player-identity";
import { PlayerSearchField } from "@/components/player-search-field";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import {
  SearchNavigationForm,
  SearchSubmitButton,
} from "@/components/ui/search-field";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  findStaffEconomyAccounts,
  getEconomyCatalogue,
  getStaffEconomyAccount,
} from "@/lib/data/portal-repository";
import { resolvePlayerIdentities } from "@/lib/player-identities";

type AdminInventoriesPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    steamId?: string;
    inventoryPage?: string;
    notice?: string;
    error?: string;
  }>;
};

function validSteamId(value: string | undefined) {
  return value && /^7656119\d{10}$/.test(value) ? value : null;
}

function positivePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function inventoriesHref({
  query,
  page,
  steamId,
  inventoryPage,
}: {
  query: string;
  page?: number;
  steamId?: string | null;
  inventoryPage?: number;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page && page > 1) params.set("page", String(page));
  if (steamId) params.set("steamId", steamId);
  if (inventoryPage && inventoryPage > 1)
    params.set("inventoryPage", String(inventoryPage));
  const search = params.toString();
  return search ? `/admin/inventories?${search}` : "/admin/inventories";
}

function inventoryMutationAction({
  query,
  page,
  inventoryPage,
}: {
  query: string;
  page: number;
  inventoryPage: number;
}) {
  const params = new URLSearchParams({ returnTo: "inventories" });
  if (query) params.set("returnQ", query);
  if (page > 1) params.set("returnPage", String(page));
  if (inventoryPage > 1)
    params.set("returnInventoryPage", String(inventoryPage));
  return `/api/admin/economy?${params.toString()}`;
}

function feedback(value: string | undefined, kind: "notice" | "error") {
  if (!value) return undefined;
  const notices: Record<string, string> = {
    "tokens-updated": "Token balance updated.",
    "item-granted": "Item granted to the selected player's inventory.",
    "item-updated": "Item customization saved and queued for server refresh.",
    "item-state-updated": "Item state updated.",
    "item-transferred": "Item transferred and both loadouts refreshed.",
    "sticker-attached": "Sticker attachment saved.",
    "sticker-detached": "Sticker detached and returned to inventory.",
    "loadout-updated": "Player loadout slot saved.",
    "loadout-cleared": "Player loadout slot cleared.",
  };
  const errors: Record<string, string> = {
    verification: "Session verification failed. Reload and try again.",
    permission: "Your staff group does not have Token economy access.",
    "token-permission": "Your staff group cannot adjust Token balances.",
    "grant-permission": "Your staff group cannot grant inventory items.",
    "manage-permission": "This action requires full inventory administration access.",
    "loadout-permission": "Your staff group cannot manage loadouts.",
    target: "The selected player is invalid or protected by higher staff immunity.",
    "item-details": "Review the item fields and try again.",
    "container-catalogue": "Crates and capsules must use a catalogue entry with a configured loot table.",
    "custom-product-catalogue": "VIP memberships and profile themes must use a trusted catalogue product.",
    "loadout-details": "Choose a valid loadout slot and owned item.",
    "transfer-details": "Provide a valid destination SteamID64.",
    "sticker-details": "Provide a valid weapon, sticker, and sticker slot.",
    catalogue: "Choose a valid catalogue item.",
    database: "The inventory action could not be saved. Check database configuration and try again.",
    action: "The requested inventory action is not supported.",
  };
  return kind === "notice"
    ? notices[value] ?? "The inventory action was completed."
    : errors[value] ?? "The requested inventory action could not be completed.";
}

export default async function AdminInventoriesPage({ searchParams }: AdminInventoriesPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) return <SignInRequired title="Player inventories" description="Sign in with an authorized Steam staff account to inspect player wallets, loadouts, and item instances." />;

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.canViewEconomy) {
    return <PortalShell authenticated><section className="staff-denied"><LockKeyhole aria-hidden="true" /><p className="tapped-kicker">Restricted area</p><h1>Economy staff access required.</h1><p>Your staff group does not have a TAPPED Token economy permission.</p><Link className="button button-secondary" href="/admin">Back to staff panel</Link></section></PortalShell>;
  }

  const query = (params.q ?? "").trim().slice(0, 64);
  const playerPage = positivePage(params.page);
  const steamId = validSteamId(params.steamId);
  const inventoryPage = positivePage(params.inventoryPage);
  const [players, account, grantCatalogue] = await Promise.all([
    findStaffEconomyAccounts({ query: query || undefined, page: playerPage, pageSize: 24 }),
    steamId
      ? getStaffEconomyAccount(steamId, { inventoryPage, inventoryPageSize: 48 })
      : Promise.resolve(null),
    steamId && access.canGrantEconomyItems
      ? getEconomyCatalogue({ includeDisabled: true, pageSize: 100 })
      : Promise.resolve(null),
  ]);
  const playerIdentities = await resolvePlayerIdentities([
    ...players.accounts.map((player) => ({
      steamId: player.steamId,
      displayName: player.displayName,
    })),
    ...(account
      ? [{ steamId: account.steamId, displayName: account.displayName }]
      : []),
  ]);
  const notice = feedback(params.notice, "notice");
  const error = feedback(params.error, "error");
  const playerPageCount = Math.max(1, Math.ceil(players.total / players.pageSize));
  const previousPlayerHref = players.page > 1 ? inventoriesHref({ query, page: players.page - 1, steamId, inventoryPage }) : null;
  const nextPlayerHref = players.page < playerPageCount ? inventoriesHref({ query, page: players.page + 1, steamId, inventoryPage }) : null;
  const previousInventoryHref = account && account.inventory.page > 1 ? inventoriesHref({ query, page: players.page, steamId, inventoryPage: account.inventory.page - 1 }) : null;
  const inventoryPageCount = account ? Math.max(1, Math.ceil(account.inventory.total / account.inventory.pageSize)) : 1;
  const nextInventoryHref = account && account.inventory.page < inventoryPageCount ? inventoriesHref({ query, page: players.page, steamId, inventoryPage: account.inventory.page + 1 }) : null;
  const mutationAction = inventoryMutationAction({
    query,
    page: players.page,
    inventoryPage: account?.inventory.page ?? inventoryPage,
  });

  return (
    <PortalShell authenticated className="staff-page economy-admin-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow"><ShieldCheck aria-hidden="true" /> Staff economy</p>
            <h1>Player inventories</h1>
            <p>Find a player by display name or SteamID64, then inspect their live wallet, loadout, and paged item inventory without leaving the staff workspace.</p>
          </div>
          <Link className="button button-secondary" href="/admin">Back to staff panel</Link>
        </section>
        <StaffSubmenu access={access} active="inventories" />
        {notice ? <PortalToast message={notice} /> : null}
        {error ? <PortalToast variant="danger" message={error} /> : null}
        <section className="staff-inventories-layout">
          <aside className="panel staff-player-directory">
            <div className="staff-player-directory-heading">
              <div><p className="eyebrow"><UserRoundSearch aria-hidden="true" /> Player directory</p><h2>Inventories</h2></div>
              <span>{players.total} known</span>
            </div>
            <SearchNavigationForm className="staff-player-search" action="/admin/inventories">
              <PlayerSearchField
                name="q"
                selectionName="steamId"
                label="Search player"
                mode="query"
                defaultQuery={query}
                includeSelf
                autoSubmitOnSelect
              />
              <SearchSubmitButton alignWithLabel>Search</SearchSubmitButton>
            </SearchNavigationForm>
            <div className="staff-player-results">
              {players.accounts.length ? players.accounts.map((player) => {
                const selected = player.steamId === steamId;
                const identity = playerIdentities[player.steamId] ?? {
                  steamId: player.steamId,
                  displayName: player.displayName,
                  avatarUrl: null,
                  presence: "unknown" as const,
                  profileThemeKey: null,
                  identityGroups: [],
                };
                return <div key={player.steamId} className={`staff-player-result-row${selected ? " is-selected" : ""}`}>
                  <PlayerIdentity player={identity} variant="compact" />
                  <span className="staff-player-result-meta"><Boxes aria-hidden="true" /> {player.inventoryCount} items <b>·</b> {formatTokens(player.wallet.balance)} Tokens</span>
                  <Link className="staff-player-inspect" href={inventoriesHref({ query, page: players.page, steamId: player.steamId })} scroll={false} aria-current={selected ? "page" : undefined}>Inspect <ArrowRight aria-hidden="true" /></Link>
                </div>;
              }) : <div className="staff-player-empty"><Archive aria-hidden="true" /><strong>No wallet accounts found.</strong><p>Try a player name or SteamID64. Awarding Tokens or an item creates an account automatically.</p></div>}
            </div>
            {playerPageCount > 1 ? <LinkPagination className="staff-player-pagination" page={players.page} totalPages={playerPageCount} label="Player results pages" hrefForPage={(targetPage) => inventoriesHref({ query, page: targetPage, steamId, inventoryPage })} /> : null}
          </aside>
          <div className="staff-inventory-workspace">
            {account ? <StaffInventoryPanel account={account} playerIdentity={playerIdentities[account.steamId]} csrf={createAdminActionToken(session)} canAdjustTokens={access.canAdjustEconomyTokens} canGrant={access.canGrantEconomyItems} canManage={access.canManageEconomy} canManageLoadouts={access.canManageEconomyLoadouts} grantCatalogue={grantCatalogue?.items ?? []} mutationAction={mutationAction} pagination={{ previousHref: previousInventoryHref, nextHref: nextInventoryHref }} /> : <section className="panel staff-inventory-empty"><div className="staff-inventory-empty-icon"><Archive aria-hidden="true" /></div><p className="eyebrow">Select a player</p><h2>Choose an inventory to inspect.</h2><p>Search the directory by player name or SteamID64. Selecting a player opens their wallet, loadout controls, and preview-rich inventory right here.</p></section>}
          </div>
        </section>
    </PortalShell>
  );
}
