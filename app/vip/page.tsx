import Link from "next/link";
import Image from "next/image";
import { Check, Clock3, Crown, LockKeyhole, PackageCheck, RefreshCw, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { CSSProperties } from "react";

import { formatDate } from "@/components/formatters";
import {
  IdentityGroupBadge,
  IdentityGroupBadgeList,
} from "@/components/identity-group-badge";
import { PlayerIdentity } from "@/components/player-identity";
import { DataTable } from "@/components/ui/data-table";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { ThemedPlayerTableRow } from "@/components/ui/themed-player-table-row";
import { VipSectionNav } from "@/components/vip-section-nav";
import { getSession } from "@/lib/auth/session";
import { identityExternalBadgeLookupKey } from "@/lib/content/identity-group-badges";
import {
  getEffectiveIdentity,
  getIdentityGroupBadgeCatalogue,
  type EffectiveIdentityGroup,
  type IdentityGroupBadgeData,
} from "@/lib/data/identity-groups";
import {
  getVipPageIdentityGroupListings,
  getVipTierConversionRateListings,
  identityGroupListingStorageConfigured,
  isMissingIdentityGroupListingSchemaError,
  type GroupListingGroup,
  type IdentityGroupListing,
} from "@/lib/data/identity-group-listings";
import {
  getPlayerDashboard,
  getVipRoster,
  type GroupMembership,
  type PlayerDashboard,
} from "@/lib/data/portal-repository";
import { getVipTiers, type VipTier } from "@/lib/data/vip-tier-catalogue";
import {
  formatIdentityGroupListingDuration as duration,
  formatIdentityGroupListingPrice as price,
} from "@/lib/identity-group-listing-presentation";
import {
  compareVipTierRates,
  convertVipDurationBetweenTierRates,
  type VipTierRate,
} from "@/lib/economy/vip-membership-conversion";
import { getSteamProfiles } from "@/lib/steam/profiles";

import styles from "./vip.module.css";

function requestUrl(listing: IdentityGroupListing) {
  return `/tickets?listing=${encodeURIComponent(String(listing.id))}`;
}

function sourceName(listing: IdentityGroupListing) {
  if (listing.group.sourceType === "admins_core") return "Admins.Core";
  if (listing.group.sourceType === "vipcore") return "VIPCore";
  return "Portal group";
}

const vipTierArtwork: Record<string, string> = {
  STANDARD: "/images/economy/vip/standard.png",
  SILVER: "/images/economy/vip/silver.png",
  GOLD: "/images/economy/vip/gold.png",
  DIAMOND: "/images/economy/vip/diamond.png",
  ULTIMATE: "/images/economy/vip/ultimate.png",
};

type MembershipAccess = {
  active: boolean;
  permanent: boolean;
  expiresAt: number | null;
};

type TierRelationship = "available" | "current" | "upgrade" | "convert" | "active";

function normalizedGroupName(value: string | null | undefined) {
  return value?.normalize("NFKC").trim().toLocaleUpperCase("en-US") ?? "";
}

function matchesGroup(
  group: Pick<GroupListingGroup, "displayName" | "externalKey">,
  membership: GroupMembership,
) {
  const targets = new Set(
    [group.externalKey, group.displayName]
      .map(normalizedGroupName)
      .filter(Boolean),
  );
  return [membership.externalKey, membership.name]
    .map(normalizedGroupName)
    .some((name) => targets.has(name));
}

function portalExpirySeconds(membership: EffectiveIdentityGroup | undefined) {
  if (!membership?.hasPortalMembership || !membership.membershipExpiresAt) return null;
  const milliseconds = new Date(membership.membershipExpiresAt).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1_000) : null;
}

function resolveMembershipAccess(input: {
  group: GroupListingGroup;
  effectiveMembership?: EffectiveIdentityGroup;
  player: PlayerDashboard | null;
}): MembershipAccess {
  const nativeVipMembership = input.group.sourceType === "vipcore" &&
      input.effectiveMembership &&
      !input.effectiveMembership.hasPortalMembership
    ? input.player?.vipGroups.find((membership) => matchesGroup(input.group, membership)) ?? null
    : null;
  const nativeAdminMembership = input.group.sourceType === "admins_core"
    ? input.player?.adminGroups.find((membership) => matchesGroup(input.group, membership)) ?? null
    : null;
  const portalMembership = input.effectiveMembership;
  const permanent = Boolean(
    nativeVipMembership?.expiresAt === 0 ||
    nativeAdminMembership ||
    (portalMembership?.hasPortalMembership && portalMembership.membershipExpiresAt === null),
  );
  const nativeExpiry = nativeVipMembership?.expiresAt && nativeVipMembership.expiresAt > 0
    ? nativeVipMembership.expiresAt
    : null;
  const portalExpiry = portalExpirySeconds(portalMembership);
  const expiresAt = permanent
    ? null
    : Math.max(nativeExpiry ?? 0, portalExpiry ?? 0) || null;

  return {
    active: Boolean(portalMembership || nativeAdminMembership),
    permanent,
    expiresAt,
  };
}

function relationshipForTier(
  tier: VipTier | null,
  currentTier: VipTier | null,
  access: MembershipAccess,
): TierRelationship {
  if (!tier || !currentTier) return access.active ? "active" : "available";
  if (normalizedGroupName(tier.name) === normalizedGroupName(currentTier.name)) return "current";
  return tier.weight > currentTier.weight ? "upgrade" : "convert";
}

function relationshipLabel(
  relationship: TierRelationship,
  currentTier: VipTier | null,
) {
  if (relationship === "current") return "Your current tier";
  if (relationship === "upgrade") return "Upgrade option";
  if (relationship === "convert") return `Converts to ${currentTier?.name ?? "current VIP"}`;
  if (relationship === "active") return "Active membership";
  return "Available membership";
}

function relationshipDescription(
  relationship: TierRelationship,
  tier: VipTier | null,
  currentTier: VipTier | null,
  access: MembershipAccess,
  currentPermanent: boolean,
  hasTierConflict: boolean,
) {
  if (tier && hasTierConflict) {
    return "Multiple active VIP tiers need staff consolidation before another VIP item can be consumed. Your item will remain untouched.";
  }
  if (tier && currentPermanent) {
    if (relationship === "upgrade") {
      return "Only a higher permanent item can replace your permanent tier; timed upgrades remain unconsumed.";
    }
    return `Your permanent ${currentTier?.name ?? "VIP"} access is preserved; timed and same or lower-tier items cannot add another VIP group.`;
  }
  if (access.permanent) return `You already own permanent ${tier?.name ?? "membership"} access.`;
  if (relationship === "current") return "Items for this tier extend your current access when activated.";
  if (relationship === "upgrade") return `Activation upgrades you to ${tier?.name ?? "this tier"}; your remaining lower-tier time is reduced by the latest marketplace rate difference.`;
  if (relationship === "convert") return `Its duration converts into ${currentTier?.name ?? "your current tier"} time using the latest marketplace rate difference.`;
  if (relationship === "active") return "New items extend this connected membership when activated.";
  return tier
    ? "Activation keeps one VIP tier active at a time."
    : "Activation grants this connected community membership.";
}

type VipConversionPreview = {
  label: string;
  title: string;
  detail: string;
  rate: string | null;
};

function exactDuration(totalSeconds: bigint) {
  const days = totalSeconds / 86_400n;
  const hours = (totalSeconds % 86_400n) / 3_600n;
  const minutes = (totalSeconds % 3_600n) / 60n;
  const seconds = totalSeconds % 60n;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    seconds ? `${seconds}s` : "",
  ].filter(Boolean).join(" ") || "0s";
}

function conversionRate(listing: IdentityGroupListing | null): VipTierRate | null {
  if (!listing || listing.durationMinutes <= 0 || listing.tokenPrice <= 0) return null;
  return {
    groupId: listing.groupId,
    listingId: listing.id,
    durationSeconds: BigInt(listing.durationMinutes) * 60n,
    priceTokens: BigInt(listing.tokenPrice),
  };
}

function liveVipRateScheduleIsValid(
  tiers: readonly VipTier[],
  listings: readonly IdentityGroupListing[],
) {
  if (!tiers.length || listings.length !== tiers.length) return false;

  const listingsByTier = new Map<string, IdentityGroupListing>();
  for (const listing of listings) {
    const tierName = normalizedGroupName(
      listing.group.externalKey ?? listing.group.displayName,
    );
    if (!tierName || listingsByTier.has(tierName)) return false;
    listingsByTier.set(tierName, listing);
  }

  const rankWeights = new Set<number>();
  const rankedRates: Array<{ weight: number; rate: VipTierRate }> = [];
  for (const tier of tiers) {
    if (
      !Number.isSafeInteger(tier.weight) ||
      tier.weight < 0 ||
      rankWeights.has(tier.weight)
    ) return false;
    const rate = conversionRate(
      listingsByTier.get(normalizedGroupName(tier.name)) ?? null,
    );
    if (!rate) return false;
    rankWeights.add(tier.weight);
    rankedRates.push({ weight: tier.weight, rate });
  }

  rankedRates.sort((left, right) => left.weight - right.weight);
  try {
    return rankedRates.every(
      (entry, index) =>
        index === 0 ||
        compareVipTierRates(rankedRates[index - 1].rate, entry.rate) < 0,
    );
  } catch {
    return false;
  }
}

function rateDescription(
  source: IdentityGroupListing,
  target: IdentityGroupListing,
  sourceSeconds: bigint,
  convertedSeconds: bigint,
) {
  const retainedTenths = sourceSeconds > 0n
    ? (convertedSeconds * 1_000n) / sourceSeconds
    : 0n;
  const retained = `${retainedTenths / 10n}.${retainedTenths % 10n}%`;
  return `${source.group.displayName} ${source.tokenPrice.toLocaleString()} Tokens / ${duration(source.durationMinutes)} → ${target.group.displayName} ${target.tokenPrice.toLocaleString()} Tokens / ${duration(target.durationMinutes)} · ${retained} time retained`;
}

function liveConversionPreview(input: {
  listing: IdentityGroupListing;
  tier: VipTier | null;
  relationship: TierRelationship;
  currentTier: VipTier | null;
  currentExpiry: number | null;
  currentPermanent: boolean;
  itemRateListing: IdentityGroupListing | null;
  currentRateListing: IdentityGroupListing | null;
  rateScheduleValid: boolean;
  hasTierConflict: boolean;
  nowSeconds: number;
}): VipConversionPreview {
  const itemSeconds = BigInt(input.listing.durationMinutes) * 60n;
  const itemName = input.listing.group.displayName;

  if (input.listing.group.sourceType !== "vipcore" || !input.tier) {
    return {
      label: "Membership outcome",
      title: input.listing.durationMinutes === 0
        ? `Permanent ${itemName} access`
        : `Activates ${exactDuration(itemSeconds)} of ${itemName}`,
      detail: "This connected membership does not use VIP tier-rate conversion.",
      rate: null,
    };
  }
  if (input.hasTierConflict) {
    return {
      label: "Activation requirement",
      title: "Staff consolidation required",
      detail: "This account has overlapping active VIP tiers. Activation remains blocked without consuming the item until staff consolidates them in Groups.",
      rate: null,
    };
  }
  if (!input.rateScheduleValid) {
    return {
      label: "Activation requirement",
      title: "Live rate schedule unavailable",
      detail: "Activation is paused until every enabled VIP tier has an eligible canonical marketplace rate and those rates increase strictly through the tier ranks. The item will not be consumed while the schedule is invalid.",
      rate: null,
    };
  }
  if (input.listing.durationMinutes === 0 && input.relationship === "convert") {
    return {
      label: "Activation requirement",
      title: "Permanent lower tier cannot be converted",
      detail: `Permanent ${itemName} has no finite duration to revalue into ${input.currentTier?.name ?? "the current tier"}, so this offer cannot be activated.`,
      rate: null,
    };
  }
  if (input.listing.durationMinutes === 0) {
    return {
      label: "Membership outcome",
      title: input.relationship === "upgrade"
        ? `Permanent upgrade to ${itemName}`
        : `Permanent ${itemName} access`,
      detail: "Permanent items do not use timed price conversion.",
      rate: null,
    };
  }
  if (!input.currentTier) {
    return {
      label: "Membership outcome",
      title: `Activates ${exactDuration(itemSeconds)} exactly`,
      detail: "With no current VIP, the item's full duration starts on its own tier.",
      rate: null,
    };
  }
  if (input.currentPermanent) {
    return {
      label: "Activation requirement",
      title: "Permanent access is preserved",
      detail: input.relationship === "upgrade"
        ? "Only a higher permanent item can replace a permanent tier."
        : "Timed, same-tier, and lower-tier items remain unconsumed.",
      rate: null,
    };
  }
  if (input.relationship === "current") {
    const projectedExpiry = (input.currentExpiry ?? input.nowSeconds) + Number(itemSeconds);
    return {
      label: "Membership outcome",
      title: `Exact ${exactDuration(itemSeconds)} extension`,
      detail: `Same-tier time is never reduced. Estimated new expiry: ${formatDate(projectedExpiry)} UTC.`,
      rate: "Same tier · 100% of item time retained",
    };
  }

  const itemRateListing = input.itemRateListing;
  const currentRateListing = input.currentRateListing;
  const itemRate = conversionRate(itemRateListing);
  const currentRate = conversionRate(currentRateListing);
  if (!itemRateListing || !currentRateListing || !itemRate || !currentRate || !input.currentExpiry) {
    return {
      label: "Activation check",
      title: "Live quote calculated at activation",
      detail: "The exact converted time will appear before the item is consumed once both current marketplace tier rates are available.",
      rate: null,
    };
  }
  const currentSeconds = BigInt(Math.max(0, input.currentExpiry - input.nowSeconds));
  if (currentSeconds <= 0n) {
    return {
      label: "Activation check",
      title: "Live quote calculated at activation",
      detail: "Your current expiry will be checked again before the item is consumed.",
      rate: null,
    };
  }

  try {
    if (input.relationship === "upgrade") {
      if (compareVipTierRates(currentRate, itemRate) >= 0) throw new Error("Non-increasing VIP rates");
      const carriedSeconds = convertVipDurationBetweenTierRates(
        currentSeconds,
        currentRate,
        itemRate,
      );
      const deductedSeconds = currentSeconds - carriedSeconds;
      const resultSeconds = itemSeconds + carriedSeconds;
      return {
        label: "Live marketplace estimate",
        title: `${exactDuration(currentSeconds)} ${input.currentTier.name} → ${exactDuration(carriedSeconds)} ${itemName}`,
        detail: `${exactDuration(deductedSeconds)} is deducted for the tier difference, then the item's ${exactDuration(itemSeconds)} is added exactly. Estimated new expiry: ${formatDate(input.nowSeconds + Number(resultSeconds))} UTC.`,
        rate: rateDescription(currentRateListing, itemRateListing, currentSeconds, carriedSeconds),
      };
    }

    if (compareVipTierRates(itemRate, currentRate) >= 0) throw new Error("Non-increasing VIP rates");
    const addedSeconds = convertVipDurationBetweenTierRates(
      itemSeconds,
      itemRate,
      currentRate,
    );
    const deductedSeconds = itemSeconds - addedSeconds;
    return {
      label: "Live marketplace estimate",
      title: `Adds ${exactDuration(addedSeconds)} to ${input.currentTier.name}`,
      detail: `${exactDuration(deductedSeconds)} is deducted from the lower-tier item's ${exactDuration(itemSeconds)}. Estimated new expiry: ${formatDate(input.currentExpiry + Number(addedSeconds))} UTC.`,
      rate: rateDescription(itemRateListing, currentRateListing, itemSeconds, addedSeconds),
    };
  } catch {
    return {
      label: "Activation requirement",
      title: "Live quote unavailable",
      detail: "Activation will fail without consuming the item if the current tier-rate schedule is invalid.",
      rate: null,
    };
  }
}

function offerActionState(input: {
  listing: IdentityGroupListing;
  relationship: TierRelationship;
  tier: VipTier | null;
  currentTier: VipTier | null;
  access: MembershipAccess;
  currentPermanent: boolean;
  rateScheduleValid: boolean;
  hasTierConflict: boolean;
}) {
  const isStrictlyHigherTier = Boolean(
    input.tier && input.currentTier && input.tier.weight > input.currentTier.weight,
  );
  const isPermanentListing = input.listing.durationMinutes === 0;

  if (input.tier && input.hasTierConflict) {
    return { disabled: true, label: "Staff consolidation required" };
  }
  if (input.tier && !input.rateScheduleValid) {
    return { disabled: true, label: "Live rates unavailable" };
  }
  if (isPermanentListing && input.relationship === "convert") {
    return { disabled: true, label: "Permanent downgrade unavailable" };
  }
  if (input.tier && input.currentPermanent) {
    if (isPermanentListing && isStrictlyHigherTier) {
      return {
        disabled: false,
        label: `Upgrade permanently to ${input.tier.name}`,
      };
    }
    return { disabled: true, label: "Already owned" };
  }
  if (input.access.permanent) return { disabled: true, label: "Already owned" };
  if (input.relationship === "current") {
    return {
      disabled: false,
      label: isPermanentListing ? "Make permanent" : `Extend ${input.tier?.name ?? "membership"}`,
    };
  }
  if (input.relationship === "upgrade") {
    return { disabled: false, label: `Request upgrade to ${input.tier?.name ?? "this tier"}` };
  }
  if (input.relationship === "convert") {
    return { disabled: false, label: `Add value to ${input.currentTier?.name ?? "current VIP"}` };
  }
  if (input.relationship === "active") return { disabled: false, label: "Extend membership" };
  return {
    disabled: false,
    label: isPermanentListing ? "Get permanent access" : "Get membership",
  };
}

function artworkForGroup(group: GroupListingGroup) {
  if (group.sourceType !== "vipcore") return null;
  return vipTierArtwork[normalizedGroupName(group.externalKey ?? group.displayName)] ?? null;
}

async function loadMembershipListings() {
  if (!identityGroupListingStorageConfigured()) {
    return {
      listings: [] as IdentityGroupListing[],
      conversionRateListings: [] as IdentityGroupListing[],
      storageError: true,
      migrationNeeded: false,
    };
  }
  try {
    const [listings, conversionRateListings] = await Promise.all([
      getVipPageIdentityGroupListings(),
      getVipTierConversionRateListings(),
    ]);
    return {
      listings,
      conversionRateListings,
      storageError: false,
      migrationNeeded: false,
    };
  } catch (error) {
    const migrationNeeded = isMissingIdentityGroupListingSchemaError(error);
    if (!migrationNeeded) console.error("VIP membership storefront failed", error);
    return {
      listings: [] as IdentityGroupListing[],
      conversionRateListings: [] as IdentityGroupListing[],
      storageError: true,
      migrationNeeded,
    };
  }
}

function getPageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

type VipPageProps = { searchParams: Promise<{ page?: string }> };

export default async function VipPage({ searchParams }: VipPageProps) {
  const session = await getSession();
  const { page: pageValue } = await searchParams;
  const requestedPage = getPageNumber(pageValue);
  const [tiers, player, vipRoster, badgeCatalogue, listingState] = await Promise.all([
    getVipTiers(),
    session ? getPlayerDashboard(session.steamId) : Promise.resolve(null),
    getVipRoster(requestedPage),
    getIdentityGroupBadgeCatalogue(),
    loadMembershipListings(),
  ]);
  const {
    listings,
    conversionRateListings,
    storageError: listingStorageError,
    migrationNeeded: listingMigrationNeeded,
  } = listingState;
  const [effectiveIdentity, steamProfiles] = await Promise.all([
    session && player
      ? getEffectiveIdentity({
          steamId: session.steamId,
          vipGroupNames: player.vipGroups.map((group) => group.externalKey ?? group.name),
          adminGroupNames: player.adminGroups.map((group) => group.externalKey ?? group.name),
        })
      : Promise.resolve(null),
    getSteamProfiles(vipRoster.vips.map((vip) => vip.steamId)),
  ]);
  const effectiveVipGroups = (effectiveIdentity?.groups ?? [])
    .filter((group) => group.sourceType === "vipcore");
  const ownedNames = new Set(
    effectiveVipGroups.map((group) =>
      (group.externalKey ?? group.displayName).toUpperCase()
    ),
  );
  const hasTierConflict = new Set(effectiveVipGroups.map((group) => group.id)).size > 1;
  const currentTier = tiers.find((tier) => ownedNames.has(tier.name.toUpperCase())) ?? null;
  const effectiveGroups = new Map((effectiveIdentity?.groups ?? []).map((group) => [group.id, group]));
  const vipBadges = new Map(
    badgeCatalogue
      .filter(
        (group): group is IdentityGroupBadgeData & { externalKey: string } =>
          group.sourceType === "vipcore" && Boolean(group.externalKey),
      )
      .map((group) => [
        identityExternalBadgeLookupKey("vipcore", group.externalKey),
        group,
      ]),
  );
  const currentVipBadge = currentTier && !hasTierConflict
    ? vipBadges.get(
        identityExternalBadgeLookupKey("vipcore", currentTier.name),
      ) ?? null
    : null;
  const tiersByName = new Map(
    tiers.map((tier) => [normalizedGroupName(tier.name), tier]),
  );
  const conversionRatesByGroupId = new Map(
    conversionRateListings.map((listing) => [listing.groupId, listing]),
  );
  const conversionRatesByTierName = new Map(
    conversionRateListings.map((listing) => [
      normalizedGroupName(listing.group.externalKey ?? listing.group.displayName),
      listing,
    ]),
  );
  const rateScheduleValid = liveVipRateScheduleIsValid(
    tiers,
    conversionRateListings,
  );
  const groupedListings = new Map<
    number,
    {
      group: GroupListingGroup;
      listings: IdentityGroupListing[];
      tier: VipTier | null;
    }
  >();
  for (const listing of listings) {
    const existing = groupedListings.get(listing.groupId);
    if (existing) {
      existing.listings.push(listing);
      continue;
    }
    groupedListings.set(listing.groupId, {
      group: listing.group,
      listings: [listing],
      tier: listing.group.sourceType === "vipcore"
        ? tiersByName.get(
            normalizedGroupName(listing.group.externalKey ?? listing.group.displayName),
          ) ?? null
        : null,
    });
  }
  const membershipCards = [...groupedListings.values()];
  const currentEffectiveMembership = currentTier
    ? [...effectiveGroups.values()].find(
        (group) => group.sourceType === "vipcore" &&
          normalizedGroupName(group.externalKey ?? group.displayName) === normalizedGroupName(currentTier.name),
      )
    : undefined;
  const currentNativeMembership = currentTier &&
      currentEffectiveMembership &&
      !currentEffectiveMembership.hasPortalMembership
    ? player?.vipGroups.find((membership) =>
        [membership.externalKey, membership.name]
          .map(normalizedGroupName)
          .includes(normalizedGroupName(currentTier.name))) ?? null
    : null;
  const currentPermanent = Boolean(
    currentNativeMembership?.expiresAt === 0 ||
    (currentEffectiveMembership?.hasPortalMembership && currentEffectiveMembership.membershipExpiresAt === null),
  );
  const currentPortalExpiry = portalExpirySeconds(currentEffectiveMembership);
  const currentNativeExpiry = currentNativeMembership?.expiresAt && currentNativeMembership.expiresAt > 0
    ? currentNativeMembership.expiresAt
    : null;
  const currentExpiry = currentPermanent
    ? null
    : Math.max(currentNativeExpiry ?? 0, currentPortalExpiry ?? 0) || null;
  const currentRateListing = currentTier
    ? conversionRatesByTierName.get(normalizedGroupName(currentTier.name)) ?? null
    : null;
  const previewNowSeconds = Math.floor(Date.now() / 1_000);
  const totalPages = Math.max(1, Math.ceil(vipRoster.total / vipRoster.pageSize));
  const currentPage = Math.min(vipRoster.page, totalPages);

  return (
    <PortalShell authenticated={Boolean(session)} className="catalog-page vip-page">

        <section className="catalog-hero" aria-labelledby="vip-title">
          <div>
            <p className="tapped-kicker"><Crown aria-hidden="true" /> TAPPED.RO membership</p>
            <h1 id="vip-title">Choose your<br /><span>advantage.</span></h1>
            <p>Published VIPCore tiers and connected community memberships, delivered as auditable inventory items. Your active access is checked again after Steam login.</p>
          </div>
          <aside
            className={`catalog-signal ${styles.currentSignal}`}
            data-ui="vip-current-status"
            aria-label="Current VIP membership"
            style={currentVipBadge ? {
              "--vip-tier-color": currentVipBadge.badgeColor,
              "--vip-tier-soft": currentVipBadge.badgeSoftColor,
            } as CSSProperties : undefined}
          >
            <span className="signal-label">CURRENT VIP</span>
            {currentVipBadge ? <IdentityGroupBadge group={currentVipBadge} compact className={styles.currentBadge} /> : null}
            <strong>{hasTierConflict ? "Needs consolidation" : currentTier?.name ?? (session ? "No active tier" : "Steam login required")}</strong>
            <small>
              {hasTierConflict
                ? "Multiple active VIP tiers were found. Staff must consolidate them before another VIP item can be consumed."
                : currentTier && currentPermanent
                ? "Permanent access on your current tier."
                : currentTier && currentExpiry
                  ? <>Active until <time dateTime={new Date(currentExpiry * 1_000).toISOString()}>{formatDate(currentExpiry)} UTC</time>.</>
                  : currentTier
                    ? "Your active tier is connected and ready to extend or upgrade."
                    : `${membershipCards.length} published membership group${membershipCards.length === 1 ? "" : "s"} with ${listings.length} access option${listings.length === 1 ? "" : "s"}.`}
            </small>
          </aside>
        </section>

        <VipSectionNav active="memberships" />

        {listingStorageError ? <aside className={styles.storageNotice} role="status"><PackageCheck aria-hidden="true" /><div><strong>{listingMigrationNeeded ? "Membership listing tables are missing." : "Membership listings are being connected."}</strong><span>{listingMigrationNeeded ? "Staff must apply db/020_identity_group_listings.sql to the portal database." : "Configure the portal database to publish EUR donation options."}</span></div></aside> : null}

        {listings.length ? (
          <section className={`vip-catalogue ${styles.catalogue}`} aria-labelledby="vip-memberships-title">
            <div className="catalog-section-heading">
              <div><p className="tapped-kicker"><Sparkles aria-hidden="true" /> Published membership items</p><h2 id="vip-memberships-title">Choose your access.</h2></div>
              <p>Each donation creates a private purchase request. Staff delivers the exact inventory item shown here; activate it from your inventory when it arrives.</p>
            </div>
            <div className={styles.listingGrid}>
              {membershipCards.map(({ group, listings: groupListings, tier }) => {
                const firstListing = groupListings[0];
                const access = resolveMembershipAccess({
                  group,
                  effectiveMembership: effectiveGroups.get(group.id),
                  player,
                });
                const relationship = relationshipForTier(tier, currentTier, access);
                const artwork = artworkForGroup(group);
                const featuredBenefits = tier?.benefits.slice(0, 3) ?? [];
                const remainingBenefits = tier?.benefits.slice(3) ?? [];
                const titleId = `vip-membership-${group.id}-title`;
                const statusId = `vip-membership-${group.id}-status`;
                const relationshipId = `vip-membership-${group.id}-relationship`;
                const offersTitleId = `vip-membership-${group.id}-offers`;
                const description = groupListings.find((listing) => listing.description)?.description
                  ?? group.description
                  ?? `Activates ${group.displayName} membership when used from your inventory.`;

                return (
                  <article
                    data-ui="vip-tier-card"
                    data-relation={relationship}
                    data-owned={access.active ? "true" : "false"}
                    className={styles.tierCard}
                    key={group.id}
                    aria-labelledby={titleId}
                    style={{
                      "--vip-tier-color": group.badgeColor,
                      "--vip-tier-soft": group.badgeSoftColor,
                    } as CSSProperties}
                  >
                    <span className={styles.tierRail} data-part="accent" aria-hidden="true" />
                    <div className={styles.artwork} data-part="artwork">
                      {artwork ? (
                        <Image
                          src={artwork}
                          alt=""
                          fill
                          sizes="(max-width: 46rem) calc(100vw - 3rem), (max-width: 58rem) 46vw, (max-width: 80rem) 30vw, 19vw"
                          className={styles.artworkImage}
                        />
                      ) : (
                        <Crown className={styles.artworkFallback} aria-hidden="true" />
                      )}
                      <div className={styles.artworkShade} data-part="artwork-shade" aria-hidden="true" />
                      <div className={styles.cardTopline}>
                        <span>{sourceName(firstListing)}</span>
                        <span className={styles.relationshipBadge} data-part="relationship">
                          {relationshipLabel(relationship, currentTier)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.cardBody}>
                      <header className={styles.cardTitle} data-part="heading">
                        <IdentityGroupBadge group={group} compact />
                        <div>
                          <span>{tier ? "VIP membership tier" : "Connected membership"}</span>
                          <h2 id={titleId}>{group.displayName}</h2>
                        </div>
                      </header>

                      {access.active ? (
                        <div className={styles.accessStatus} data-part="status" id={statusId}>
                          {access.permanent ? <ShieldCheck aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
                          <span>
                            <strong>{access.permanent ? "Owned permanently" : "Currently active"}</strong>
                            <small>
                              {access.permanent
                                ? "No expiry date"
                                : access.expiresAt
                                  ? <>Until <time dateTime={new Date(access.expiresAt * 1_000).toISOString()}>{formatDate(access.expiresAt)} UTC</time></>
                                  : "Connected access"}
                            </small>
                          </span>
                        </div>
                      ) : null}

                      <p className={styles.description}>{description}</p>
                      <p className={styles.relationshipCopy} id={relationshipId}>
                        {relationshipDescription(
                          relationship,
                          tier,
                          currentTier,
                          access,
                          currentPermanent,
                          hasTierConflict,
                        )}
                      </p>

                      {featuredBenefits.length ? (
                        <div className={styles.benefitBlock} data-part="benefits">
                          <div className={styles.benefitHeading}>
                            <span>Enabled VIPCore benefits</span>
                            <strong>{tier?.benefits.length ?? 0}</strong>
                          </div>
                          <ul className={styles.benefitPreview}>
                            {featuredBenefits.map((benefit) => (
                              <li key={benefit.name}>
                                <Check aria-hidden="true" />
                                <span><strong>{benefit.name}</strong><small>{benefit.detail}</small></span>
                              </li>
                            ))}
                          </ul>
                          {remainingBenefits.length ? (
                            <details className={styles.benefits}>
                              <summary>{remainingBenefits.length} more benefit{remainingBenefits.length === 1 ? "" : "s"}</summary>
                              <ul>
                                {remainingBenefits.map((benefit) => (
                                  <li key={benefit.name}>
                                    <Check aria-hidden="true" />
                                    <span><strong>{benefit.name}</strong><small>{benefit.detail}</small></span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </div>
                      ) : (
                        <div className={styles.delivery} data-part="benefits">
                          <Clock3 aria-hidden="true" />
                          <span><strong>Connected access</strong><small>{sourceName(firstListing)} membership</small></span>
                        </div>
                      )}

                      <section className={styles.offers} data-part="offers" aria-labelledby={offersTitleId}>
                        <div className={styles.offersHeading}>
                          <h3 id={offersTitleId}>Access options</h3>
                          <span>{groupListings.length} item{groupListings.length === 1 ? "" : "s"}</span>
                        </div>
                        <ul>
                          {groupListings.map((listing) => {
                            const action = offerActionState({
                              listing,
                              relationship,
                              tier,
                              currentTier,
                              access,
                              currentPermanent,
                              rateScheduleValid,
                              hasTierConflict,
                            });
                            const conversionPreview = liveConversionPreview({
                              listing,
                              tier,
                              relationship,
                              currentTier,
                              currentExpiry,
                              currentPermanent,
                              itemRateListing: conversionRatesByGroupId.get(group.id) ?? null,
                              currentRateListing,
                              rateScheduleValid,
                              hasTierConflict,
                              nowSeconds: previewNowSeconds,
                            });
                            return (
                              <li key={listing.id}>
                                <div className={styles.offerDetails}>
                                  <strong>{duration(listing.durationMinutes)}</strong>
                                  <small>{listing.listingName}</small>
                                </div>
                                <div className={styles.conversionPreview} data-part="conversion-preview">
                                  <RefreshCw aria-hidden="true" />
                                  <span>
                                    <small className={styles.previewLabel}>{conversionPreview.label}</small>
                                    <strong>{conversionPreview.title}</strong>
                                    <small>{conversionPreview.detail}</small>
                                    {conversionPreview.rate ? <small className={styles.previewRate}>{conversionPreview.rate}</small> : null}
                                  </span>
                                </div>
                                <div className={styles.offerPurchase}>
                                  <span>{price(listing.euroPriceCents)}</span>
                                  {!session ? (
                                    <a className={`button button-primary ${styles.offerAction}`} data-part="action" href="/api/auth/steam">
                                      <LockKeyhole aria-hidden="true" /> Login to request
                                    </a>
                                  ) : action.disabled ? (
                                    <button className={`button button-quiet ${styles.offerAction}`} data-part="action" type="button" disabled aria-describedby={access.active ? `${statusId} ${relationshipId}` : relationshipId}>
                                      {action.label === "Already owned" ? <Check aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />} {action.label}
                                    </button>
                                  ) : (
                                    <Link className={`button button-primary ${styles.offerAction}`} data-part="action" href={requestUrl(listing)}>
                                      <PackageCheck aria-hidden="true" /> {action.label}
                                    </Link>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="catalog-disclaimer"><ShieldCheck aria-hidden="true" /> Purchase buttons open a private donation request with staff until a payment checkout is connected. Conversion previews use the current canonical Token rates; listing data and the exact result are recalculated atomically when the inventory item is activated.</p>
          </section>
        ) : !listingStorageError ? <section className="catalog-empty"><Crown aria-hidden="true" /><h2>No membership listings are published.</h2><p>Staff can publish monthly, permanent, custom, VIPCore, or Admins.Core group items from the group listing editor.</p></section> : null}

        <section className="vip-roster" aria-labelledby="vip-roster-title">
          <div className="catalog-section-heading">
            <div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> VIPCore roster</p><h2 id="vip-roster-title">Current VIPs.</h2></div>
            <p>{vipRoster.total.toLocaleString()} active VIP{vipRoster.total === 1 ? "" : "s"} on ARENA.TAPPED.RO. Profiles open publicly from the roster.</p>
          </div>
          {vipRoster.vips.length ? (
            <DataTable
              className="vip-roster-scroll"
              tableClassName="vip-roster-table"
              caption="Current ARENA VIP roster"
            >
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">VIP tier</th>
                  <th scope="col">Admin rank</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {vipRoster.vips.map((vip) => {
                  const profile = steamProfiles.get(vip.steamId);
                  const name = profile?.name || vip.name;
                  const vipGroup = vip.identityGroups.find(
                    (group) =>
                      group.sourceType === "vipcore" &&
                      identityExternalBadgeLookupKey(
                        "vipcore",
                        group.externalKey ?? group.displayName,
                      ) ===
                        identityExternalBadgeLookupKey("vipcore", vip.group),
                  );
                  const adminGroups = vip.identityGroups.filter(
                    (group) => group.sourceType === "admins_core",
                  );
                  const customGroups = vip.identityGroups.filter(
                    (group) => group.sourceType === "custom",
                  );

                  return (
                    <ThemedPlayerTableRow
                      profileThemeKey={vip.profileThemeKey}
                      key={`${vip.steamId}-${vip.group}`}
                    >
                      <td>
                        <PlayerIdentity
                          player={{
                            steamId: vip.steamId,
                            displayName: name,
                            avatarUrl: profile?.avatarFull ?? null,
                            presence: profile?.presence ?? "unknown",
                            profileThemeKey: vip.profileThemeKey,
                            identityGroups: customGroups,
                          }}
                          variant="table"
                          showSteamId={false}
                        />
                      </td>
                      <td>
                        {vipGroup ? (
                          <IdentityGroupBadge group={vipGroup} compact />
                        ) : (
                          <span className="role-empty">{vip.group}</span>
                        )}
                      </td>
                      <td>
                        <IdentityGroupBadgeList
                          groups={adminGroups}
                          compact
                          className="vip-roster-role-badges"
                        />
                        {adminGroups.length ? null : (
                          <span className="role-empty">—</span>
                        )}
                      </td>
                      <td>
                        <strong>
                          {vip.expiresAt === 0
                            ? "Permanent"
                            : `Until ${formatDate(vip.expiresAt)}`}
                        </strong>
                      </td>
                    </ThemedPlayerTableRow>
                  );
                })}
              </tbody>
            </DataTable>
          ) : (
            <section className="vip-roster-empty">
              <UsersRound aria-hidden="true" />
              <h3>No active VIPs yet.</h3>
              <p>VIPs with active or permanent access will appear here.</p>
            </section>
          )}
          <LinkPagination
            className="vip-roster-pagination"
            page={currentPage}
            totalPages={totalPages}
            label="VIP roster pages"
            hrefForPage={(targetPage) => `/vip?page=${targetPage}`}
          />
        </section>
    </PortalShell>
  );
}
