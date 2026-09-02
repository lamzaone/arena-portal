# Graph Report - arena-portal  (2026-09-02)

## Corpus Check
- 273 files · ~697,800 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3159 nodes · 9186 edges · 109 communities (95 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dfe61ed4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Portal Repository
- Identity Group Routing
- VIP Membership Database
- Database Connection Pools
- Economy Mutation Logic
- Catalogue Search Components
- Appeals and Tickets
- Admin Assignment Workspace
- Server Scope Migration
- Marketplace UI Helpers
- Economy API Endpoints
- Group Authority Definitions
- Identity Catalogue Sync
- Economy Request Handling
- Catalogue Mutation Locking
- Crate Opening UI
- Staff Admin Assignment
- Membership Data Fetching
- Economy Data Types
- Group Listing Management
- Item Action Routes
- External Group Management
- VIP Membership Forms
- Admin Dashboard Pages
- Player Profile Pages
- Inventory Management UI
- VIP Perk Management
- Project Dependencies
- Economy Quote Routes
- Economy Catalogue Filtering
- Group Administration UI
- Admin Items Page
- Crate Opening Logic
- Profile Theme Settings
- Partner Inventory API
- VIP Membership Page
- Case and Catalogue Routes
- Authentication and Sessions
- Staff Item Granting
- Admin Inventory Management
- Economy Trade UI
- Permission Configuration
- Marketplace Price Calculation
- VIP Perk Administration
- Economy View Models
- Loadout Editor UI
- VIP Tier Definitions
- External Market Pricing
- TypeScript Configuration
- Player Profile Stats
- Admin Membership Forms
- Staff Sanction Management
- VIP Tier Conversion
- Legacy State Cleanup
- Economy State Reset
- Player Hover Cards
- Form Runtime Logic
- Layout and Themes
- Profile Settings UI
- Price Refresh Background
- Item Image Caching
- Skinport Price Integration
- Database Snapshot Export
- Database Snapshot Import
- Profile Navigation Tabs
- Economy Trade History
- Economy Drop Logic
- Staff Inventory Tools
- Loadout Market Previews
- Loadout Update API
- Staff Membership API
- Server Status Monitoring
- Market Preview API
- Game Mode Catalogue
- Group Sorting Controls
- Common Error Pages
- Marketplace Discount UI
- Loadout Preview API
- Image Proxy Route
- Steam Market Integration
- VIP Activation Messaging
- Legacy Admin Page
- Legacy VIP Page
- Project Documentation
- VIP Authority Sync
- Consolidation Design Plans
- VIP Entitlement Contracts
- Arena Scope Resolution
- Next.js Configuration
- next-env.d.ts
- Portal Theme Authoring Guide
- Group Rename Logic
- Player Search Field
- TAPPD Weapon Case Image
- Diamond VIP Badge
- Gold VIP Badge
- Silver VIP Badge
- Ultimate VIP Badge
- Server Scope Registry
- Economy Pricing Logic
- Theme Visual Assets
- Market Purchase API
- Primary Navigation UI
- Player Inventory API
- Clipboard Utilities
- Search Navigation Logic
- Remote Image Handling
- Discount Policy Documentation

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
- `AppealBanContext()` --calls--> `formatDate()`  [EXTRACTED]
  app/appeals/page.tsx → components/formatters.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **VIP and Identity Management** — docs_vip_perks, db_arena_readme, readme [EXTRACTED 0.90]

## Communities (109 total, 13 thin omitted)

### Community 0 - "Admin Portal Repository"
Cohesion: 0.01
Nodes (216): ActivateVipMembershipItemInput, ActivateVipMembershipItemResult, AddStaffCustomCrateLootEntryInput, AddStaffCustomCrateLootEntryResult, AdminAuthorization, AdminAuthorizationRow, AdminListRow, AppealEligibilityRow (+208 more)

### Community 1 - "Identity Group Routing"
Cohesion: 0.06
Nodes (136): bool(), number(), optionalNumber(), POST(), redirect(), returnTab(), text(), isIdentityGroupBadgeIconKey() (+128 more)

### Community 2 - "VIP Membership Database"
Cohesion: 0.10
Nodes (66): getGameDatabasePool(), activeNativeGroupNames(), ArenaVipScopeRow, ArenaVipSubscriptionMutationRow, ArenaVipSuppressionRow, ArenaVipTargetRow, asBoolean(), asDate() (+58 more)

### Community 3 - "Database Connection Pools"
Cohesion: 0.05
Nodes (83): ArenaDatabasePoolRegistry, connectionLimit(), getPool(), getPortalDatabasePool(), globalWithArenaPools, installMysqlUtcSessionInitializer(), MYSQL_UTC_CLIENT_TIMEZONE, MYSQL_UTC_SESSION_SQL (+75 more)

### Community 4 - "Economy Mutation Logic"
Cohesion: 0.13
Nodes (69): applyTokenDelta(), attachEconomyCharm(), attachEconomySticker(), attachEconomyStickerRecord(), cancelEconomyTrade(), clearEconomyLoadoutSlot(), clearEconomyLoadoutSlots(), createEconomyInventoryItem() (+61 more)

### Community 5 - "Catalogue Search Components"
Cohesion: 0.09
Nodes (22): CatalogueSearchField(), CatalogueSearchFieldProps, CatalogueSearchItem, CatalogueSearchResponse, isRecord(), parseItems(), adminAction(), newIdempotencyKey() (+14 more)

### Community 6 - "Appeals and Tickets"
Cohesion: 0.06
Nodes (39): AppealBanContext(), AppealCase(), AppealsPageProps, canReply(), canReply(), getVipRequest(), listingId(), TicketCase() (+31 more)

### Community 7 - "Admin Assignment Workspace"
Cohesion: 0.07
Nodes (27): AdminAssignment, Assignment, AssignmentRecordCard(), AssignmentStatus, AssignmentsWorkspace(), AssignmentsWorkspaceProps, AssignmentVipScope, AssignmentWorkspaceView (+19 more)

### Community 8 - "Server Scope Migration"
Cohesion: 0.08
Nodes (64): configuredArenaServerScopeLink(), acquireMigrationLock(), addDistinct(), applyArenaPlan(), applyPortalPlan(), asBoolean(), asIntegerString(), assertBridgeRow() (+56 more)

### Community 9 - "Marketplace UI Helpers"
Cohesion: 0.07
Nodes (56): CratePurchaseControls(), defaultFloatForItem(), discountPercentLabel(), displayQuotedFloat(), floatInRange(), floatsMatch(), formatFloat(), isContainerItem() (+48 more)

### Community 10 - "Economy API Endpoints"
Cohesion: 0.09
Nodes (57): actionIdempotencyKey(), artworkContentTypes, catalogueMarketVersion(), crateActionErrorKey(), discountExclusions(), discountPercentageBps(), discountUtcDate(), ensureActorCanTarget() (+49 more)

### Community 11 - "Group Authority Definitions"
Cohesion: 0.10
Nodes (58): actorValue(), AdminGroupRow, adminNativeRowId(), AdminServerRow, ArenaGroupDefinitionAuthorityError, ArenaGroupRow, ArenaGroupScopeRow, ArenaRuntimeAuthorityRenameHint (+50 more)

### Community 12 - "Identity Catalogue Sync"
Cohesion: 0.07
Nodes (41): AdminDatabaseAssignmentRow, AdminDatabaseGroupRow, builtinGamePermissions, CatalogueAliasRow, contentHash(), CountRow, disableUndeliverableExternalListings(), disableUnverifiedConfigSources() (+33 more)

### Community 13 - "Economy Request Handling"
Cohesion: 0.06
Nodes (41): createEconomyIdempotencyKey(), EconomyActionRequestError, EconomyActionResult, postEconomyAction(), bulkSellItems(), runAction(), EconomyLoadoutManager(), runAction() (+33 more)

### Community 14 - "Catalogue Mutation Locking"
Cohesion: 0.09
Nodes (50): acquireIdentityCatalogueMutationLock(), CatalogueLockRow, identityCatalogueMutationLockName, releaseIdentityCatalogueMutationLock(), ArenaCatalogueTarget, ArenaCatalogueTargetRow, arenaGroupType(), ArenaVipScopeRow (+42 more)

### Community 15 - "Crate Opening UI"
Cohesion: 0.08
Nodes (43): CrateDropPreview(), CrateDropPreviewReady(), DISPLAYED_RARITY_RANKS, EconomyCrateDrop, EconomyCrateDropState, economyCrateDropStateFromResponse(), normalizedText(), responseMessage() (+35 more)

### Community 16 - "Staff Admin Assignment"
Cohesion: 0.13
Nodes (50): configuredGameServerGuid(), DEFAULT_GAME_SERVER_GUID, isAssignedToConfiguredGameServer(), adminMembershipError(), ArenaAdminDefinitionRow, arenaAuthorityMissing(), asBoolean(), asDate() (+42 more)

### Community 17 - "Membership Data Fetching"
Cohesion: 0.09
Nodes (53): activeVipRows(), authoritativeVipCoreRowsForSteamId(), emptyHitboxStats(), getActiveNativeVipSuppressedSteamIds(), getAdminPool(), getAuthoritativeExternalIdentityMemberships(), getExternalIdentityGroupMembershipIndex(), getExternalIdentityGroupMemberSteamIds() (+45 more)

### Community 18 - "Economy Data Types"
Cohesion: 0.12
Nodes (48): createEconomyRedeemCode(), economyBoolean(), economyCount(), EconomyCrateReelPool, economyCustomDisplayName(), economyDateToIso(), economyDecimal(), economyDirectPurchasePrice() (+40 more)

### Community 19 - "Group Listing Management"
Cohesion: 0.08
Nodes (29): durationLabel(), errors, euroInput(), GroupListingsPage(), ListingForm(), notices, positiveInteger(), selectedView() (+21 more)

### Community 20 - "Item Action Routes"
Cohesion: 0.21
Nodes (34): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+26 more)

### Community 21 - "External Group Management"
Cohesion: 0.15
Nodes (40): AdminAssignmentRow, AdminGroupRow, appliesToServer(), booleanValue(), completeRenameAndRefreshPortal(), createRuntimeAdminsCoreGroup(), createRuntimeVipCoreGroup(), deleteRuntimeVipCoreGroup() (+32 more)

### Community 22 - "VIP Membership Forms"
Cohesion: 0.13
Nodes (24): ConfirmSubmitButton(), consolidationChoices(), dateTimeFormatter, exactReferenceLabel(), ExtensionForm(), fallbackIdentity(), hasExactMutationReference(), MembershipRecord() (+16 more)

### Community 23 - "Admin Dashboard Pages"
Cohesion: 0.14
Nodes (27): RedeemCodeAdminPage(), RedeemCodeAdminPageProps, GET(), RouteContext, DashboardPage(), DashboardPageProps, InventoryPage(), LoadoutPage() (+19 more)

### Community 24 - "Player Profile Pages"
Cohesion: 0.09
Nodes (24): PlayerProfilePageProps, PublicPlayerProfilePage(), getPageNumber(), rankingLink(), RankingPage(), RankingPageProps, accountLinks, AccountNav() (+16 more)

### Community 25 - "Inventory Management UI"
Cohesion: 0.08
Nodes (42): itemIsVipMembership(), itemSupportsCharm(), itemSupportsLoadout(), canBulkSellItem(), compareItems(), gridColumnCount(), inventoryItemToggleId(), InventoryManager() (+34 more)

### Community 26 - "VIP Perk Management"
Cohesion: 0.08
Nodes (69): actionView(), bool(), number(), POST(), redirect(), value(), AdminAuditRow, adminMutation() (+61 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.05
Nodes (42): lucide-react, mysql2, next, dependencies, lucide-react, mysql2, next, react (+34 more)

### Community 28 - "Economy Quote Routes"
Cohesion: 0.13
Nodes (27): isLegacySteamPrice(), metadataFloat(), POST(), catalogueIdFromSearch(), floatFromSearch(), GET(), legacySteamPrice(), metadataSeed() (+19 more)

### Community 29 - "Economy Catalogue Filtering"
Cohesion: 0.10
Nodes (28): applyEconomyCatalogueDiscounts(), EconomyCatalogueFilter, EconomyCataloguePage, economyCatalogueSearchFilter(), economyCatalogueSearchTerms(), EconomyCratePage, economyDirectPurchasePriceFromEuroCents(), economyDiscountSaving() (+20 more)

### Community 30 - "Group Administration UI"
Cohesion: 0.11
Nodes (27): chatColors, errorMessages, formatSyncedAt(), GroupAdminTab, groupAdminTabs, GroupCard(), GroupsPage(), GroupsPageProps (+19 more)

### Community 31 - "Admin Items Page"
Cohesion: 0.09
Nodes (36): AdminItemsPage(), AdminItemsPageProps, catalogueArtworkUrl(), cleanLookup(), errorText(), formatDate(), formatDropChance(), formatPrice() (+28 more)

### Community 32 - "Crate Opening Logic"
Cohesion: 0.09
Nodes (28): CrateOpener(), changeCrateTab(), changeOwnedPage(), changeSelectionMode(), clearUnboxResult(), closeOwnedCrate(), completeBulkReveal(), dismissBulkOpeningResults() (+20 more)

### Community 33 - "Profile Theme Settings"
Cohesion: 0.10
Nodes (31): ProfileSettingsForm(), ProfileThemeSurfaceBadge(), ProfileThemeSurfaceBadgeProps, surfaceClassNames, ThemeIcon(), getTrustedProfileTheme(), isTrustedProfileThemeKey(), ProfileThemeSurface (+23 more)

### Community 34 - "Partner Inventory API"
Cohesion: 0.47
Nodes (5): GET(), json(), pageNumber(), privateNoStore, RouteContext

### Community 35 - "VIP Membership Page"
Cohesion: 0.08
Nodes (44): artworkForGroup(), conversionRate(), exactDuration(), getPageNumber(), liveConversionPreview(), liveVipRateScheduleIsValid(), loadMembershipListings(), matchesGroup() (+36 more)

### Community 36 - "Case and Catalogue Routes"
Cohesion: 0.05
Nodes (78): allowedImageTypes, getScreenshot(), parseCaseId(), POST(), redirect(), catalogueId(), GET(), json() (+70 more)

### Community 37 - "Authentication and Sessions"
Cohesion: 0.15
Nodes (21): POST(), GET(), GET(), json(), POST(), privateNoStore, publicSettings(), record() (+13 more)

### Community 38 - "Staff Item Granting"
Cohesion: 0.06
Nodes (44): BatchGrantResponse, CatalogueFilter, catalogueFilters, catalogueLine(), CatalogueSearchResponse, customItemTypes, customLine(), featuredTypes (+36 more)

### Community 39 - "Admin Inventory Management"
Cohesion: 0.15
Nodes (18): AdminInventoriesPage(), AdminInventoriesPageProps, feedback(), formatTokens(), inventoriesHref(), inventoryMutationAction(), inventoryStates, positivePage() (+10 more)

### Community 40 - "Economy Trade UI"
Cohesion: 0.11
Nodes (27): buyCrate(), EconomyEmptyState(), EconomyItemCard(), EconomyItemCardProps, EconomyTradeItemView, EconomyTradeView, formatTokens(), itemIsTradable() (+19 more)

### Community 41 - "Permission Configuration"
Cohesion: 0.14
Nodes (30): addPermission(), adminsConfigCandidates(), appliesToConfiguredServer(), asObject(), boundedInteger(), cleanCapabilityKey(), cleanGroupName(), cleanPermissionKey() (+22 more)

### Community 42 - "Marketplace Price Calculation"
Cohesion: 0.13
Nodes (32): economyMarketplaceQuoteKey(), economyValidateResolvedMarketplaceQuote(), getExternalMarketPrices(), addCandidate(), adjustedMarketplaceEuroCents(), boundedFloat(), boundedSeed(), deriveMarketplacePriceIdentity() (+24 more)

### Community 43 - "VIP Perk Administration"
Cohesion: 0.10
Nodes (28): configuration(), errors, expiry(), notices, pageNumber(), View, views, VipPerkAdminPage() (+20 more)

### Community 44 - "Economy View Models"
Cohesion: 0.15
Nodes (34): asArray(), authoritativeCrateRarity(), economyCatalogueItems(), economyCrates(), economyItems(), economyLoadout(), EconomyLoadoutView, economyTrades() (+26 more)

### Community 45 - "Loadout Editor UI"
Cohesion: 0.10
Nodes (27): categories, EditorCategory, fallbackIcon(), isSkinCategory(), LoadoutEditor(), changeCategory(), changeWeaponGroup(), resetAdvancedFields() (+19 more)

### Community 46 - "VIP Tier Definitions"
Cohesion: 0.15
Nodes (27): boolean(), configuredVipServerId(), displayNumber(), fallbackTierSkeletons, finiteNumber(), formatUtilities(), GameVipGroupRow, genericDetail() (+19 more)

### Community 47 - "External Market Pricing"
Cohesion: 0.15
Nodes (27): CsfloatExactListingLookup, csfloatQuotes(), exactListingCache, exactListingCacheKey(), ExactListingCacheValue, exchangeRateFromPayload(), ExchangeRateSnapshot, ExternalMarketPrice (+19 more)

### Community 48 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 49 - "Player Profile Stats"
Cohesion: 0.13
Nodes (23): formatPlaytime(), avatarInitial(), countFormatter, formatCount(), Hitbox, hitboxes, hitIntensity(), HitMap() (+15 more)

### Community 50 - "Admin Membership Forms"
Cohesion: 0.13
Nodes (21): ActionExplanation(), dateTimeFormatter, exactReferenceAvailable(), exactReferenceLabel(), fallbackIdentity(), isFounderGroup(), MembershipRecord(), parsedTimestamp() (+13 more)

### Community 51 - "Staff Sanction Management"
Cohesion: 0.12
Nodes (22): AppealBanSource(), CaseMessages(), errorText(), getPageNumber(), getSanctionEvents(), isSteamId(), noticeText(), ProfileMention() (+14 more)

### Community 52 - "VIP Tier Conversion"
Cohesion: 0.17
Nodes (22): assertValidVipTierRate(), compareVipEntitlementPrecedence(), compareVipTierRates(), convertTimedVipMembership(), convertVipDurationBetweenTierRates(), isEligibleVipTierRateListingCandidate(), isValidVipTierRate(), requireIncreasingTierRate() (+14 more)

### Community 53 - "Legacy State Cleanup"
Cohesion: 0.16
Nodes (20): acquireLock(), arenaProtectedState(), args, captureDeleteTriggers(), checksum(), count(), dropDeleteTriggers(), portableTriggerSql() (+12 more)

### Community 54 - "Economy State Reset"
Cohesion: 0.11
Nodes (16): args, captureDeleteTriggers(), checksum(), count(), portableTriggerSql(), protectedTables, quoteIdentifier(), report (+8 more)

### Community 55 - "Player Hover Cards"
Cohesion: 0.33
Nodes (6): AdaptivePlayerHoverCard(), AdaptivePlayerHoverCardProps, CardPosition, Placement, relatedTargetIsInside(), triggerSelector

### Community 56 - "Form Runtime Logic"
Cohesion: 0.15
Nodes (21): appendQuery(), AUTH_ENTRY_PATHS, dispatchFormEvent(), NATIVE_FORM_VALUES, ProgressiveFormRuntime(), handleSubmit(), onSubmit(), settleAfterNavigation() (+13 more)

### Community 57 - "Layout and Themes"
Cohesion: 0.16
Nodes (17): metadata, RootLayout(), CursorGridBackground(), GlobalThemeBackground(), GlobalThemeDocumentEffects(), ProfileThemeAvatarAdornment(), ProfileThemeBackground(), ProfileThemeDocumentEffects() (+9 more)

### Community 58 - "Profile Settings UI"
Cohesion: 0.25
Nodes (7): InventoryVisibility, OwnedTheme, ProfileSettingsFormProps, ProfileSettingsValue, SettingsResponse, ProfileShowcases(), upcomingShowcases

### Community 59 - "Price Refresh Background"
Cohesion: 0.17
Nodes (16): GET(), isAuthorized(), maxDuration, runtime, register(), EconomyPublicPriceRefreshUpdate, getEconomyPublicPriceRefreshCandidates(), pruneCompletedEconomyOperationReceipts() (+8 more)

### Community 60 - "Item Image Caching"
Cohesion: 0.17
Nodes (19): asNumber(), asRecord(), asRows(), asText(), buildImageSource(), CachedValue, cacheKey(), CatalogueImageSource (+11 more)

### Community 61 - "Skinport Price Integration"
Cohesion: 0.22
Nodes (17): euroCents(), fetchSkinportRows(), fetchSnapshot(), getSkinportHistoricalPrices(), getSnapshot(), HistoricalPeriod, historicalPeriods, listingPriceFields (+9 more)

### Community 62 - "Database Snapshot Export"
Cohesion: 0.11
Nodes (13): args, encodeRow(), encodeValue(), fileOutput, gzip, manifest, outputDir, outputFile (+5 more)

### Community 63 - "Database Snapshot Import"
Cohesion: 0.11
Nodes (12): args, file, manifest, mismatches, objects, relative, root, rowCounts (+4 more)

### Community 64 - "Profile Navigation Tabs"
Cohesion: 0.23
Nodes (11): ProfileTab, ProfileTabs(), activateTab(), selectWithKeyboard(), tabId(), ProfileTabsProps, announceNavigationStart(), currentThemeKey() (+3 more)

### Community 65 - "Economy Trade History"
Cohesion: 0.10
Nodes (29): isTrustedOwnedProfileThemeKey(), clampStaffPage(), dateToIso(), economyStorageConfigured(), economyStorageRequired(), EconomyTradeFilter, EconomyTradePage, economyUuid() (+21 more)

### Community 66 - "Economy Drop Logic"
Cohesion: 0.23
Nodes (18): awardEconomyDrop(), economyChildIdempotencyKey(), economyEffectiveLootFloatRange(), economyIsSkinLike(), economyItemSupportsNametag(), economyJobKey(), enqueueEconomyJob(), getEconomyPlayerDisplayName() (+10 more)

### Community 67 - "Staff Inventory Tools"
Cohesion: 0.09
Nodes (25): EconomyWalletView, rarityName(), GrantCatalogueItem, StaffGrantItemForm(), DirectoryContext, formatTokens(), InventoryFilters, inventoryImageUrl() (+17 more)

### Community 68 - "Loadout Market Previews"
Cohesion: 0.17
Nodes (15): LoadoutAgent, LoadoutCatalogue, LoadoutCategory, LoadoutItem, LoadoutPaintkit, CachedPreview, fetchMarketImage(), findItem() (+7 more)

### Community 69 - "Loadout Update API"
Cohesion: 0.27
Nodes (13): advancedSkinPayload(), agentIndexes(), has(), integer(), jsonError(), LoadoutRequest, POST(), selectedTeams() (+5 more)

### Community 70 - "Staff Membership API"
Cohesion: 0.14
Nodes (24): adminMembershipReference(), adminMembershipSource(), arenaMembershipUuid(), assignmentDurationMinutes(), exactStoredAdminGroup(), exactStoredVipGroup(), fallbackVipGroups, optionalVipServerId() (+16 more)

### Community 71 - "Server Status Monitoring"
Cohesion: 0.29
Nodes (10): GET(), getServerStatus(), parseInfoResponse(), parseStatus(), querySourceServer(), queryStatusEndpoint(), readCString(), ServerStatus (+2 more)

### Community 72 - "Market Preview API"
Cohesion: 0.40
Nodes (9): asCatalogueId(), asFloat(), GET(), metadataText(), officialImageUrl(), previewMarketNames(), uniqueImageUrls(), wearLabel() (+1 more)

### Community 73 - "Game Mode Catalogue"
Cohesion: 0.31
Nodes (8): ModesPage(), ArenaMode, arenaModes, duelFlow, duelLengths, DuelType, duelTypes, getArenaModes()

### Community 74 - "Group Sorting Controls"
Cohesion: 0.13
Nodes (15): compareGroups(), GroupSort, GroupSortKey, groupTypeLabel(), groupTypeOrder, GroupWorkspace(), selectGroup(), GroupWorkspaceEntry (+7 more)

### Community 75 - "Common Error Pages"
Cohesion: 0.32
Nodes (3): ErrorPageProps, EmptyState(), EmptyStateProps

### Community 76 - "Marketplace Discount UI"
Cohesion: 0.21
Nodes (14): marketDiscountCategoryLabels, MarketPage(), MarketPageProps, positivePage(), adjustmentLabel(), endLabel(), MarketDiscountAnnouncement(), MarketDiscountAnnouncementItem (+6 more)

### Community 77 - "Loadout Preview API"
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
Cohesion: 0.20
Nodes (20): authorityMissing(), booleanValue(), compareMembershipPrecedence(), dateValue(), deterministicUuid(), MappedRawVipRow, membershipIsActive(), MembershipRow (+12 more)

### Community 92 - "Group Rename Logic"
Cohesion: 0.14
Nodes (20): assertRuntimeCreateNameAvailable(), cancelPreparedRename(), portalPoolForRename(), prepareRuntimeRename(), rethrowRenameError(), applyIdentityGroupRenameIntent(), assertIdentityGroupExternalKeyAvailable(), cancelIdentityGroupRename() (+12 more)

### Community 93 - "Player Search Field"
Cohesion: 0.19
Nodes (17): isRecord(), isSteamId64(), noLocalPlayers, parsePlayers(), PLAYER_SEARCH_ENDPOINT, playerIdentity(), PlayerSearchField(), choosePlayer() (+9 more)

### Community 99 - "Server Scope Registry"
Cohesion: 0.29
Nodes (13): adminScopes(), assignmentRecords(), customScope(), findRegisteredServerScope(), globalArenaScope(), groupDefinition(), groupMatches(), normalize() (+5 more)

### Community 100 - "Economy Pricing Logic"
Cohesion: 0.27
Nodes (13): economyAmount(), economyDiscountDate(), economyMarketVariantPriceKey(), economyMarketVariantPublicWear(), economyMarketVariantStorageWear(), economyText(), getEconomyMarketVariantPrice(), getEconomyMarketVariantPrices() (+5 more)

### Community 101 - "Theme Visual Assets"
Cohesion: 0.20
Nodes (9): rainDrops, RainDropStyle, TapGodRainBackground(), ThemeBackground(), themeBackgrounds, ThemeIconProps, themeIcons, PortalThemeBackgroundKey (+1 more)

### Community 102 - "Market Purchase API"
Cohesion: 0.36
Nodes (8): isLegacySteamPrice(), metadataSeed(), optionalFloat(), optionalStattrak(), POST(), EconomyRepositoryError, isEconomyProfileTheme(), isEconomyVipMembership()

### Community 103 - "Primary Navigation UI"
Cohesion: 0.43
Nodes (4): primaryLinks, PrimaryNavigation(), PrimaryNavigationLinks(), isPrimaryNavigationLinkActive()

### Community 104 - "Player Inventory API"
Cohesion: 0.47
Nodes (5): GET(), json(), pageNumber(), privateNoStore, RouteContext

### Community 105 - "Clipboard Utilities"
Cohesion: 0.40
Nodes (5): CopyState, CopyToClipboardButton(), handleCopy(), CopyToClipboardButtonProps, writeToClipboard()

### Community 106 - "Search Navigation Logic"
Cohesion: 0.60
Nodes (6): SearchNavigationForm(), change(), input(), navigate(), schedule(), submit()

### Community 107 - "Remote Image Handling"
Cohesion: 0.60
Nodes (3): ResilientRemoteImage(), ResilientRemoteImageProps, proxiedImageUrl()

### Community 108 - "Discount Policy Documentation"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Items bought for a discount should be sold relative to their buying price, then audit the full site UI/UX., Source Nodes

## Knowledge Gaps
- **793 isolated node(s):** `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope`, `AssignmentsWorkspaceProps`, `AssignmentStatus` (+788 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 911 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getGameDatabasePool()` connect `VIP Membership Database` to `Admin Portal Repository`, `Identity Group Routing`, `Database Connection Pools`, `Case and Catalogue Routes`, `Permission Configuration`, `Group Authority Definitions`, `Identity Catalogue Sync`, `Catalogue Mutation Locking`, `VIP Tier Definitions`, `Staff Admin Assignment`, `Membership Data Fetching`, `External Group Management`, `VIP Perk Management`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `getSession` connect `Admin Dashboard Pages` to `Identity Group Routing`, `Appeals and Tickets`, `Economy API Endpoints`, `Group Listing Management`, `Item Action Routes`, `Player Profile Pages`, `VIP Perk Management`, `Economy Quote Routes`, `Group Administration UI`, `Admin Items Page`, `Partner Inventory API`, `VIP Membership Page`, `Case and Catalogue Routes`, `Authentication and Sessions`, `Admin Inventory Management`, `VIP Perk Administration`, `Staff Sanction Management`, `Layout and Themes`, `Loadout Update API`, `Staff Membership API`, `Market Preview API`, `Game Mode Catalogue`, `Marketplace Discount UI`, `Loadout Preview API`, `Player Inventory API`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `configuredArenaServerScopeLink()` connect `Server Scope Migration` to `Group Authority Definitions`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope` to the rest of the system?**
  _793 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Portal Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.009472606246799796 - nodes in this community are weakly interconnected._
- **Should `Identity Group Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.05546866854342613 - nodes in this community are weakly interconnected._
- **Should `VIP Membership Database` be split into smaller, more focused modules?**
  _Cohesion score 0.09769335142469471 - nodes in this community are weakly interconnected._