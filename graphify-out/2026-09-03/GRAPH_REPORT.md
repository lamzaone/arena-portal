# Graph Report - arena-portal  (2026-09-03)

## Corpus Check
- 279 files · ~704,794 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3211 nodes · 9226 edges · 108 communities (94 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e54e741a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Authorization Repository
- Identity Route Handlers
- Staff VIP Management
- VIP Activation Saga
- Economy Mutation Logic
- Crate Opening Design
- Admin Appeals Pages
- Assignment Workspace
- Arena Scope Resolution
- Crate Preview Components
- Economy Route Metadata
- Arena Group Authority
- Identity Catalogue Management
- Economy Request Handling
- Catalogue Locking System
- Crate Opening UI
- Staff Admin Assignment
- Membership Data Fetching
- Economy Catalogue Utilities
- Group Listing Pages
- Item Action Routes
- External Group Management
- Membership Confirmation UI
- User Dashboard Pages
- Site Navigation Components
- Inventory Manager Logic
- VIP Perk Routes
- Project Dependencies
- Marketplace Transaction Routes
- Marketplace Quote Logic
- Group Administration UI
- Admin Item Listings
- Economy Trade Management
- Profile Theme Settings
- Partner Inventory Routes
- VIP Membership Page
- Case Management Routes
- Auth and Inventory Routes
- Item Granting Controls
- Admin Inventory Management
- Loadout Manager UI
- Permission Configuration
- Marketplace Pricing Logic
- Crate Opening Implementation
- Economy View Models
- Loadout Editor Component
- VIP Tier Catalogue
- External Market Integration
- TypeScript Configuration
- Layout and Profile
- Admin Membership UI
- Profile Theme Definitions
- VIP Tier Conversion
- Database Schema Repair
- Economy State Reset
- Theme Registry
- Staff Inventory UI
- Theme Document Effects
- Profile Showcase UI
- Price Refresh Background
- Item Image Service
- Skinport Price Integration
- Database Snapshot Export
- Database Snapshot Import
- Player Hover Cards
- Player Settings Logic
- Market Discount UI
- Economy Item UI
- Market Preview Logic
- Loadout Update Routes
- Staff Membership Routes
- Server Status Service
- Market Preview Routes
- Game Modes Page
- Group Control Components
- Common Error Pages
- Loadout Preview Routes
- Image Proxy Route
- Steam Market Integration
- VIP Activation Messaging
- Legacy Admin Page
- Legacy VIP Page
- Project Documentation
- VIP Authority Sync
- Consolidation Design Plans
- VIP Entitlement Contracts
- Arena Scope Types
- Next.js Configuration
- Next.js Type Definitions
- Portal Theme Authoring Guide
- Database Connection Pools
- Player Search UI
- TAPPD Weapon Case Image
- Diamond VIP Badge
- Gold VIP Badge
- Silver VIP Badge
- Ultimate VIP Badge
- Arena Scope Registry
- Economy Content Creation
- Theme Visual Assets
- Primary Navigation UI
- Ranking and Identity
- Remote Image Components
- Discount Logic Analysis
- Economy Sellback Logic
- Loadout Workspace Design
- Loadout Workspace Implementation

## God Nodes (most connected - your core abstractions)
1. `economyError()` - 116 edges
2. `getSession` - 96 edges
3. `economyNumber()` - 60 edges
4. `getPortalPool()` - 59 edges
5. `economySteamId()` - 50 edges
6. `runEconomyMutation()` - 50 edges
7. `POST()` - 46 edges
8. `economyText()` - 43 edges
9. `getGameDatabasePool()` - 41 edges
10. `identityError()` - 40 edges

## Surprising Connections (you probably didn't know these)
- `submit()` --indirect_call--> `category()`  [INFERRED]
  components/loadout-editor.tsx → lib/data/vip-perks.ts
- `Portal Theme System` --references--> `Beta Tester Theme SVG`  [INFERRED]
  docs/theme-system.md → public/images/economy/profile-themes/beta-tester.svg
- `Portal Theme System` --references--> `Tap God Theme SVG`  [INFERRED]
  docs/theme-system.md → public/images/economy/profile-themes/tap-god.svg
- `VIP Perk Entitlement Contract` --references--> `Standard VIP Badge`  [INFERRED]
  docs/vip-perks.md → public/images/economy/vip/standard.png
- `submitSearch()` --indirect_call--> `query()`  [INFERRED]
  components/economy/discount-rule-admin.tsx → lib/data/mysql-utc-session.test.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **VIP and Identity Management** — docs_vip_perks, db_arena_readme, readme [EXTRACTED 0.90]

## Communities (108 total, 13 thin omitted)

### Community 0 - "Admin Authorization Repository"
Cohesion: 0.01
Nodes (231): ActivateVipMembershipItemInput, ActivateVipMembershipItemResult, AddStaffCustomCrateLootEntryInput, AddStaffCustomCrateLootEntryResult, AdminAuthorization, AdminAuthorizationRow, AdminListRow, AppealEligibilityRow (+223 more)

### Community 1 - "Identity Route Handlers"
Cohesion: 0.05
Nodes (138): bool(), number(), optionalNumber(), POST(), redirect(), returnTab(), text(), identityExternalBadgeLookupKey() (+130 more)

### Community 2 - "Staff VIP Management"
Cohesion: 0.10
Nodes (66): getGameDatabasePool(), activeNativeGroupNames(), ArenaVipScopeRow, ArenaVipSubscriptionMutationRow, ArenaVipSuppressionRow, ArenaVipTargetRow, asBoolean(), asDate() (+58 more)

### Community 3 - "VIP Activation Saga"
Cohesion: 0.08
Nodes (65): getPortalDatabasePool(), activateVipMembershipItemWithSaga(), ActivationManualReviewError, ActivationRequestPayload, applyArenaVipCommand(), ArenaCommandRejection, ArenaCommandRow, ArenaGroupRow (+57 more)

### Community 4 - "Economy Mutation Logic"
Cohesion: 0.11
Nodes (87): addStaffCustomCrateLootEntry(), applyTokenDelta(), attachEconomyCharm(), attachEconomySticker(), attachEconomyStickerRecord(), awardEconomyDrop(), clearEconomyLoadoutSlot(), clearEconomyLoadoutSlots() (+79 more)

### Community 5 - "Crate Opening Design"
Cohesion: 0.14
Nodes (13): Bulk-opening session, Chosen architecture, Component boundaries, Explicit non-goals, Goal, Inventory behavior, Inventory Crate Opening Integration Design, Normal item management (+5 more)

### Community 6 - "Admin Appeals Pages"
Cohesion: 0.05
Nodes (50): AppealBanSource(), CaseMessages(), errorText(), getPageNumber(), getSanctionEvents(), isSteamId(), noticeText(), ProfileMention() (+42 more)

### Community 7 - "Assignment Workspace"
Cohesion: 0.07
Nodes (27): AdminAssignment, Assignment, AssignmentRecordCard(), AssignmentStatus, AssignmentsWorkspace(), AssignmentsWorkspaceProps, AssignmentVipScope, AssignmentWorkspaceView (+19 more)

### Community 8 - "Arena Scope Resolution"
Cohesion: 0.08
Nodes (64): configuredArenaServerScopeLink(), acquireMigrationLock(), addDistinct(), applyArenaPlan(), applyPortalPlan(), asBoolean(), asIntegerString(), assertBridgeRow() (+56 more)

### Community 9 - "Crate Preview Components"
Cohesion: 0.06
Nodes (65): CrateDropPreview(), CrateDropPreviewReady(), DISPLAYED_RARITY_RANKS, EconomyCrateDrop, EconomyCrateDropState, economyCrateDropStateFromResponse(), normalizedText(), responseMessage() (+57 more)

### Community 10 - "Economy Route Metadata"
Cohesion: 0.13
Nodes (37): actionIdempotencyKey(), artworkContentTypes, catalogueMarketVersion(), crateActionErrorKey(), discountExclusions(), discountPercentageBps(), discountUtcDate(), formText() (+29 more)

### Community 11 - "Arena Group Authority"
Cohesion: 0.10
Nodes (58): actorValue(), AdminGroupRow, adminNativeRowId(), AdminServerRow, ArenaGroupDefinitionAuthorityError, ArenaGroupRow, ArenaGroupScopeRow, ArenaRuntimeAuthorityRenameHint (+50 more)

### Community 12 - "Identity Catalogue Management"
Cohesion: 0.06
Nodes (55): AdminDatabaseAssignmentRow, AdminDatabaseGroupRow, applyIdentityGroupRenameIntent(), assertIdentityGroupExternalKeyAvailable(), builtinGamePermissions, cancelIdentityGroupRename(), CatalogueAliasRow, completeIdentityGroupRename() (+47 more)

### Community 13 - "Economy Request Handling"
Cohesion: 0.06
Nodes (34): createEconomyIdempotencyKey(), EconomyActionRequestError, EconomyActionResult, postEconomyAction(), bulkSellItems(), runAction(), adminAction(), newIdempotencyKey() (+26 more)

### Community 14 - "Catalogue Locking System"
Cohesion: 0.10
Nodes (49): acquireIdentityCatalogueMutationLock(), CatalogueLockRow, identityCatalogueMutationLockName, releaseIdentityCatalogueMutationLock(), ArenaCatalogueTarget, ArenaCatalogueTargetRow, arenaGroupType(), ArenaVipScopeRow (+41 more)

### Community 15 - "Crate Opening UI"
Cohesion: 0.09
Nodes (37): EconomyItemView, rarityRankClass(), BulkCrateOpeningSession, BulkOpeningRow, crateLootPresentation(), CrateOpeningAnimation(), CrateOpeningRequestGroup, dropHeadline() (+29 more)

### Community 16 - "Staff Admin Assignment"
Cohesion: 0.13
Nodes (50): configuredGameServerGuid(), DEFAULT_GAME_SERVER_GUID, isAssignedToConfiguredGameServer(), adminMembershipError(), ArenaAdminDefinitionRow, arenaAuthorityMissing(), asBoolean(), asDate() (+42 more)

### Community 17 - "Membership Data Fetching"
Cohesion: 0.10
Nodes (49): activeVipRows(), authoritativeVipCoreRowsForSteamId(), emptyHitboxStats(), getActiveNativeVipSuppressedSteamIds(), getAdminPool(), getAuthoritativeExternalIdentityMemberships(), getExternalIdentityGroupMembershipIndex(), getExternalIdentityGroupMemberSteamIds() (+41 more)

### Community 18 - "Economy Catalogue Utilities"
Cohesion: 0.08
Nodes (67): applyEconomyCatalogueDiscounts(), economyBoolean(), EconomyCatalogueFilter, EconomyCataloguePage, economyCatalogueSearchFilter(), economyCount(), EconomyCratePage, EconomyCrateReelPool (+59 more)

### Community 19 - "Group Listing Pages"
Cohesion: 0.07
Nodes (37): durationLabel(), errors, euroInput(), GroupListingsPage(), ListingForm(), notices, positiveInteger(), selectedView() (+29 more)

### Community 20 - "Item Action Routes"
Cohesion: 0.21
Nodes (34): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+26 more)

### Community 21 - "External Group Management"
Cohesion: 0.13
Nodes (45): AdminAssignmentRow, AdminGroupRow, appliesToServer(), assertRuntimeCreateNameAvailable(), booleanValue(), cancelPreparedRename(), completeRenameAndRefreshPortal(), createRuntimeAdminsCoreGroup() (+37 more)

### Community 22 - "Membership Confirmation UI"
Cohesion: 0.13
Nodes (24): ConfirmSubmitButton(), consolidationChoices(), dateTimeFormatter, exactReferenceLabel(), ExtensionForm(), fallbackIdentity(), hasExactMutationReference(), MembershipRecord() (+16 more)

### Community 23 - "User Dashboard Pages"
Cohesion: 0.14
Nodes (29): GET(), RouteContext, DashboardPage(), DashboardPageProps, InventoryPage(), LoadoutPage(), marketDiscountCategoryLabels, MarketPage() (+21 more)

### Community 24 - "Site Navigation Components"
Cohesion: 0.11
Nodes (23): GET(), json(), noStore, accountLinks, AccountNav(), AccountNavProps, SiteHeader(), SiteHeaderProps (+15 more)

### Community 25 - "Inventory Manager Logic"
Cohesion: 0.07
Nodes (44): itemIsVipMembership(), itemSupportsCharm(), itemSupportsLoadout(), useInventoryCrateOpening(), canBulkSellItem(), compareItems(), gridColumnCount(), inventoryItemToggleId() (+36 more)

### Community 26 - "VIP Perk Routes"
Cohesion: 0.08
Nodes (67): actionView(), bool(), number(), POST(), redirect(), value(), AdminAuditRow, adminMutation() (+59 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.05
Nodes (42): lucide-react, mysql2, next, dependencies, lucide-react, mysql2, next, react (+34 more)

### Community 28 - "Marketplace Transaction Routes"
Cohesion: 0.12
Nodes (33): isLegacySteamPrice(), metadataFloat(), POST(), isLegacySteamPrice(), metadataSeed(), optionalFloat(), optionalStattrak(), POST() (+25 more)

### Community 29 - "Marketplace Quote Logic"
Cohesion: 0.48
Nodes (7): economyFilterFloatRange(), economyFloat(), economyMarketplaceFallbackMetadata(), economyMarketplaceQuoteAmount(), economyMarketplaceQuoteText(), economyResolvedMarketplacePurchaseQuote(), economyResolvedMarketSalePrice()

### Community 30 - "Group Administration UI"
Cohesion: 0.09
Nodes (34): chatColors, errorMessages, formatSyncedAt(), GroupAdminTab, groupAdminTabs, GroupCard(), GroupsPage(), GroupsPageProps (+26 more)

### Community 31 - "Admin Item Listings"
Cohesion: 0.06
Nodes (50): AdminItemsPage(), AdminItemsPageProps, catalogueArtworkUrl(), cleanLookup(), errorText(), formatDate(), formatDropChance(), formatPrice() (+42 more)

### Community 32 - "Economy Trade Management"
Cohesion: 0.18
Nodes (12): cancelEconomyTrade(), economyTradeHasExpired(), economyUuid(), getEconomyTrade(), getPlayerInventoryVisibilities(), getPlayerInventoryVisibility(), getTradePartnerInventory(), hydrateEconomyTrades() (+4 more)

### Community 33 - "Profile Theme Settings"
Cohesion: 0.27
Nodes (9): ProfileSettingsForm(), ProfileThemeSurfaceBadge(), ProfileThemeSurfaceBadgeProps, surfaceClassNames, ThemeIcon(), getTrustedProfileTheme(), ProfileThemeSurface, getPortalTheme() (+1 more)

### Community 34 - "Partner Inventory Routes"
Cohesion: 0.47
Nodes (5): GET(), json(), pageNumber(), privateNoStore, RouteContext

### Community 35 - "VIP Membership Page"
Cohesion: 0.07
Nodes (45): artworkForGroup(), conversionRate(), exactDuration(), getPageNumber(), liveConversionPreview(), liveVipRateScheduleIsValid(), loadMembershipListings(), matchesGroup() (+37 more)

### Community 36 - "Case Management Routes"
Cohesion: 0.05
Nodes (78): allowedImageTypes, getScreenshot(), parseCaseId(), POST(), redirect(), catalogueId(), GET(), json() (+70 more)

### Community 37 - "Auth and Inventory Routes"
Cohesion: 0.09
Nodes (35): RedeemCodeAdminPage(), POST(), GET(), GET(), GET(), json(), pageNumber(), privateNoStore (+27 more)

### Community 38 - "Item Granting Controls"
Cohesion: 0.06
Nodes (43): BatchGrantResponse, CatalogueFilter, catalogueFilters, catalogueLine(), CatalogueSearchResponse, customItemTypes, customLine(), featuredTypes (+35 more)

### Community 39 - "Admin Inventory Management"
Cohesion: 0.10
Nodes (27): AdminInventoriesPage(), AdminInventoriesPageProps, feedback(), formatTokens(), inventoriesHref(), inventoryMutationAction(), inventoryStates, positivePage() (+19 more)

### Community 40 - "Loadout Manager UI"
Cohesion: 0.07
Nodes (45): EconomyLoadoutManager(), chooseTeamTarget(), chooseWeaponDefinition(), runAction(), EconomyLoadoutManagerProps, equippedTeamLabels(), fallbackSlotPreview(), LOADOUT_CATEGORIES (+37 more)

### Community 41 - "Permission Configuration"
Cohesion: 0.14
Nodes (30): addPermission(), adminsConfigCandidates(), appliesToConfiguredServer(), asObject(), boundedInteger(), cleanCapabilityKey(), cleanGroupName(), cleanPermissionKey() (+22 more)

### Community 42 - "Marketplace Pricing Logic"
Cohesion: 0.12
Nodes (31): economyMarketplaceQuoteKey(), economyValidateResolvedMarketplaceQuote(), addCandidate(), adjustedMarketplaceEuroCents(), boundedFloat(), boundedSeed(), deriveMarketplacePriceIdentity(), isFloatPricedMarketplaceItem() (+23 more)

### Community 43 - "Crate Opening Implementation"
Cohesion: 0.22
Nodes (8): File structure, Global Constraints, Inventory Crate Opening Integration Implementation Plan, Task 1: Pure crate-selection and multi-request planning policy, Task 2: Extract the Inventory opening controller and presentation, Task 3: Integrate single-container opening into item management, Task 4: Integrate up-to-50 bulk opening with lock and sale actions, Task 5: Remove the duplicate opener, finish responsive UI, and verify

### Community 44 - "Economy View Models"
Cohesion: 0.15
Nodes (33): asArray(), authoritativeCrateRarity(), economyCatalogueItems(), economyCrates(), EconomyCrateView, economyItems(), economyLoadout(), EconomyLoadoutView (+25 more)

### Community 45 - "Loadout Editor Component"
Cohesion: 0.10
Nodes (27): categories, EditorCategory, fallbackIcon(), isSkinCategory(), LoadoutEditor(), changeCategory(), changeWeaponGroup(), resetAdvancedFields() (+19 more)

### Community 46 - "VIP Tier Catalogue"
Cohesion: 0.14
Nodes (28): boolean(), configuredVipServerId(), displayNumber(), fallbackTierSkeletons, finiteNumber(), formatUtilities(), GameVipGroupRow, genericDetail() (+20 more)

### Community 47 - "External Market Integration"
Cohesion: 0.15
Nodes (28): CsfloatExactListingLookup, csfloatQuotes(), exactListingCache, exactListingCacheKey(), ExactListingCacheValue, exchangeRateFromPayload(), ExchangeRateSnapshot, ExternalMarketPrice (+20 more)

### Community 48 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 49 - "Layout and Profile"
Cohesion: 0.10
Nodes (33): metadata, RootLayout(), formatPlaytime(), avatarInitial(), countFormatter, formatCount(), Hitbox, hitboxes (+25 more)

### Community 50 - "Admin Membership UI"
Cohesion: 0.13
Nodes (21): ActionExplanation(), dateTimeFormatter, exactReferenceAvailable(), exactReferenceLabel(), fallbackIdentity(), isFounderGroup(), MembershipRecord(), parsedTimestamp() (+13 more)

### Community 51 - "Profile Theme Definitions"
Cohesion: 0.32
Nodes (7): isTrustedProfileThemeKey(), ProfileThemeSurfacePresentation, TrustedProfileTheme, isOwnedPortalThemeKey(), isPortalThemeKey(), PortalThemeKey, PortalThemeSurfaceDefinition

### Community 52 - "VIP Tier Conversion"
Cohesion: 0.17
Nodes (21): assertValidVipTierRate(), compareVipTierRates(), convertTimedVipMembership(), convertVipDurationBetweenTierRates(), isEligibleVipTierRateListingCandidate(), isValidVipTierRate(), requireIncreasingTierRate(), requirePositive() (+13 more)

### Community 53 - "Database Schema Repair"
Cohesion: 0.16
Nodes (20): acquireLock(), arenaProtectedState(), args, captureDeleteTriggers(), checksum(), count(), dropDeleteTriggers(), portableTriggerSql() (+12 more)

### Community 54 - "Economy State Reset"
Cohesion: 0.11
Nodes (16): args, captureDeleteTriggers(), checksum(), count(), portableTriggerSql(), protectedTables, quoteIdentifier(), report (+8 more)

### Community 55 - "Theme Registry"
Cohesion: 0.29
Nodes (7): betaTesterTheme, defaultTheme, portalThemes, ResolvedPortalThemeSurface, tapGodTheme, PortalThemeDefinition, PortalThemeSurfaceMap

### Community 56 - "Staff Inventory UI"
Cohesion: 0.07
Nodes (43): interactiveSelector, StaffInventoryPlayerRow(), handleClick(), navigate(), StaffInventoryPlayerRowProps, ProfileTab, ProfileTabs(), activateTab() (+35 more)

### Community 57 - "Theme Document Effects"
Cohesion: 0.25
Nodes (8): CursorGridBackground(), EffectRegistration, registrations, setCursorGrid(), syncDocumentEffects(), ThemeDocumentEffects(), PORTAL_THEME_CHANGE_EVENT, PortalThemeDocumentEffects

### Community 58 - "Profile Showcase UI"
Cohesion: 0.25
Nodes (7): InventoryVisibility, OwnedTheme, ProfileSettingsFormProps, ProfileSettingsValue, SettingsResponse, ProfileShowcases(), upcomingShowcases

### Community 59 - "Price Refresh Background"
Cohesion: 0.17
Nodes (16): GET(), isAuthorized(), maxDuration, runtime, register(), EconomyPublicPriceRefreshUpdate, getEconomyPublicPriceRefreshCandidates(), pruneCompletedEconomyOperationReceipts() (+8 more)

### Community 60 - "Item Image Service"
Cohesion: 0.17
Nodes (19): asNumber(), asRecord(), asRows(), asText(), buildImageSource(), CachedValue, cacheKey(), CatalogueImageSource (+11 more)

### Community 61 - "Skinport Price Integration"
Cohesion: 0.20
Nodes (18): euroCents(), fetchSkinportRows(), fetchSnapshot(), getSkinportHistoricalPrice(), getSkinportHistoricalPrices(), getSnapshot(), HistoricalPeriod, historicalPeriods (+10 more)

### Community 62 - "Database Snapshot Export"
Cohesion: 0.11
Nodes (13): args, encodeRow(), encodeValue(), fileOutput, gzip, manifest, outputDir, outputFile (+5 more)

### Community 63 - "Database Snapshot Import"
Cohesion: 0.11
Nodes (12): args, file, manifest, mismatches, objects, relative, root, rowCounts (+4 more)

### Community 64 - "Player Hover Cards"
Cohesion: 0.33
Nodes (6): AdaptivePlayerHoverCard(), AdaptivePlayerHoverCardProps, CardPosition, Placement, relatedTargetIsInside(), triggerSelector

### Community 65 - "Player Settings Logic"
Cohesion: 0.20
Nodes (11): isTrustedOwnedProfileThemeKey(), createEconomyRedeemCode(), economyRedeemCodeHash(), economyRedeemCodeHint(), economyRedeemRewards(), economyStorageRequired(), ensureEconomyRedeemSchema(), getPlayerSettings() (+3 more)

### Community 66 - "Market Discount UI"
Cohesion: 0.43
Nodes (6): adjustmentLabel(), endLabel(), MarketDiscountAnnouncement(), MarketDiscountAnnouncementItem, MarketDiscountAnnouncementProps, percentageLabel()

### Community 67 - "Economy Item UI"
Cohesion: 0.07
Nodes (47): EconomyEmptyState(), EconomyItemCard(), EconomyItemCardProps, EconomyTradeItemView, EconomyTradeView, EconomyWalletView, formatTokens(), humanize() (+39 more)

### Community 68 - "Market Preview Logic"
Cohesion: 0.17
Nodes (15): LoadoutAgent, LoadoutCatalogue, LoadoutCategory, LoadoutItem, LoadoutPaintkit, CachedPreview, fetchMarketImage(), findItem() (+7 more)

### Community 69 - "Loadout Update Routes"
Cohesion: 0.27
Nodes (13): advancedSkinPayload(), agentIndexes(), has(), integer(), jsonError(), LoadoutRequest, POST(), selectedTeams() (+5 more)

### Community 70 - "Staff Membership Routes"
Cohesion: 0.14
Nodes (24): adminMembershipReference(), adminMembershipSource(), arenaMembershipUuid(), assignmentDurationMinutes(), exactStoredAdminGroup(), exactStoredVipGroup(), fallbackVipGroups, optionalVipServerId() (+16 more)

### Community 71 - "Server Status Service"
Cohesion: 0.29
Nodes (10): GET(), getServerStatus(), parseInfoResponse(), parseStatus(), querySourceServer(), queryStatusEndpoint(), readCString(), ServerStatus (+2 more)

### Community 72 - "Market Preview Routes"
Cohesion: 0.40
Nodes (9): asCatalogueId(), asFloat(), GET(), metadataText(), officialImageUrl(), previewMarketNames(), uniqueImageUrls(), wearLabel() (+1 more)

### Community 73 - "Game Modes Page"
Cohesion: 0.31
Nodes (8): ModesPage(), ArenaMode, arenaModes, duelFlow, duelLengths, DuelType, duelTypes, getArenaModes()

### Community 74 - "Group Control Components"
Cohesion: 0.13
Nodes (15): compareGroups(), GroupSort, GroupSortKey, groupTypeLabel(), groupTypeOrder, GroupWorkspace(), selectGroup(), GroupWorkspaceEntry (+7 more)

### Community 75 - "Common Error Pages"
Cohesion: 0.32
Nodes (3): ErrorPageProps, EmptyState(), EmptyStateProps

### Community 77 - "Loadout Preview Routes"
Cohesion: 0.52
Nodes (6): asInteger(), asWear(), GET(), previewResponse(), getLoadoutCatalogue(), getCs2CatalogueImage()

### Community 78 - "Image Proxy Route"
Cohesion: 0.60
Nodes (4): GET(), runtime, safeContentType(), trustedImageUrl()

### Community 79 - "Steam Market Integration"
Cohesion: 0.60
Nodes (4): fetchSteamMarketPrice(), getLowestPrice(), parseEuroCents(), SteamMarketPrice

### Community 80 - "VIP Activation Messaging"
Cohesion: 0.60
Nodes (4): formatExpiry(), formatVipDuration(), vipActivationMessage(), VipActivationMessageResult

### Community 83 - "Project Documentation"
Cohesion: 0.29
Nodes (7): Arena Group Authority Documentation, Discord Bot Plan, Portal Theme System, Website Plan, Beta Tester Theme SVG, Tap God Theme SVG, ARENA Portal README

### Community 85 - "VIP Authority Sync"
Cohesion: 0.19
Nodes (21): authorityMissing(), booleanValue(), compareMembershipPrecedence(), dateValue(), deterministicUuid(), MappedRawVipRow, membershipIsActive(), MembershipRow (+13 more)

### Community 92 - "Database Connection Pools"
Cohesion: 0.19
Nodes (12): ArenaDatabasePoolRegistry, connectionLimit(), getPool(), globalWithArenaPools, installMysqlUtcSessionInitializer(), MYSQL_UTC_CLIENT_TIMEZONE, MYSQL_UTC_SESSION_SQL, MysqlSessionConnection (+4 more)

### Community 93 - "Player Search UI"
Cohesion: 0.19
Nodes (17): isRecord(), isSteamId64(), noLocalPlayers, parsePlayers(), PLAYER_SEARCH_ENDPOINT, playerIdentity(), PlayerSearchField(), choosePlayer() (+9 more)

### Community 99 - "Arena Scope Registry"
Cohesion: 0.29
Nodes (13): adminScopes(), assignmentRecords(), customScope(), findRegisteredServerScope(), globalArenaScope(), groupDefinition(), groupMatches(), normalize() (+5 more)

### Community 100 - "Economy Content Creation"
Cohesion: 0.15
Nodes (24): createEconomyDiscountRule(), createStaffCustomCrate(), economyAmount(), economyArtworkUrl(), economyCatalogueSearchTerms(), economyDiscountDate(), economyMarketVariantPriceKey(), economyMarketVariantPublicWear() (+16 more)

### Community 101 - "Theme Visual Assets"
Cohesion: 0.12
Nodes (17): rainDrops, RainDropStyle, TapGodRainBackground(), ThemeBackground(), themeBackgrounds, ThemeIconProps, themeIcons, PortalThemeAvatarAdornment (+9 more)

### Community 103 - "Primary Navigation UI"
Cohesion: 0.43
Nodes (4): primaryLinks, PrimaryNavigation(), PrimaryNavigationLinks(), isPrimaryNavigationLinkActive()

### Community 106 - "Ranking and Identity"
Cohesion: 0.11
Nodes (22): getPageNumber(), rankingLink(), RankingPage(), RankingPageProps, CopyState, CopyToClipboardButton(), handleCopy(), CopyToClipboardButtonProps (+14 more)

### Community 107 - "Remote Image Components"
Cohesion: 0.60
Nodes (3): ResilientRemoteImage(), ResilientRemoteImageProps, proxiedImageUrl()

### Community 108 - "Discount Logic Analysis"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Items bought for a discount should be sold relative to their buying price, then audit the full site UI/UX., Source Nodes

### Community 109 - "Economy Sellback Logic"
Cohesion: 0.22
Nodes (12): ECONOMY_SELLBACK_BASIS_POINTS, ECONOMY_SELLBACK_MINIMUM_TOKENS, ECONOMY_SELLBACK_PERCENT_LABEL, economySellbackPayoutTokens(), EconomySellbackResolution, economySellbackSaleMessage(), EconomySellbackSaleMessageInput, economySellbackUsesMinimum() (+4 more)

### Community 110 - "Loadout Workspace Design"
Cohesion: 0.15
Nodes (12): 1. Choose a category, 2. Choose a weapon or team, 3. Choose an owned item, Accessibility, Data and component design, Error and empty states, Goal, Interaction model (+4 more)

### Community 113 - "Loadout Workspace Implementation"
Cohesion: 0.29
Nodes (6): Global Constraints, Guided Loadout Workspace Implementation Plan, Task 1: Add the pure owned-loadout selection model, Task 2: Rebuild the Loadout manager as a guided visual workflow, Task 3: Add the responsive image-led presentation and page copy, Task 4: Review, verify, and refresh architecture output

## Knowledge Gaps
- **834 isolated node(s):** `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope`, `AssignmentsWorkspaceProps`, `AssignmentStatus` (+829 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 954 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getGameDatabasePool()` connect `Staff VIP Management` to `Admin Authorization Repository`, `Identity Route Handlers`, `VIP Activation Saga`, `Case Management Routes`, `Permission Configuration`, `Arena Group Authority`, `Identity Catalogue Management`, `Catalogue Locking System`, `VIP Tier Catalogue`, `Staff Admin Assignment`, `Membership Data Fetching`, `External Group Management`, `VIP Perk Routes`, `Database Connection Pools`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `getSession` connect `User Dashboard Pages` to `Identity Route Handlers`, `Admin Appeals Pages`, `Economy Route Metadata`, `Group Listing Pages`, `Item Action Routes`, `Site Navigation Components`, `VIP Perk Routes`, `Marketplace Transaction Routes`, `Group Administration UI`, `Admin Item Listings`, `Partner Inventory Routes`, `VIP Membership Page`, `Case Management Routes`, `Auth and Inventory Routes`, `Admin Inventory Management`, `Layout and Profile`, `Loadout Update Routes`, `Staff Membership Routes`, `Market Preview Routes`, `Game Modes Page`, `Loadout Preview Routes`, `Ranking and Identity`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `configuredArenaServerScopeLink()` connect `Arena Scope Resolution` to `Arena Group Authority`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope` to the rest of the system?**
  _834 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Authorization Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.00954565635637117 - nodes in this community are weakly interconnected._
- **Should `Identity Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.05430597771023303 - nodes in this community are weakly interconnected._
- **Should `Staff VIP Management` be split into smaller, more focused modules?**
  _Cohesion score 0.09769335142469471 - nodes in this community are weakly interconnected._