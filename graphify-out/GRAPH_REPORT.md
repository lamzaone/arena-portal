# Graph Report - arena-portal  (2026-09-05)

## Corpus Check
- 294 files · ~708,780 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3280 nodes · 9333 edges · 125 communities (109 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ac55c5c1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- portal-repository.ts
- staff-vip-memberships.ts
- staff-admin-memberships.ts
- economy/route.ts
- economyError
- staff-management-page.tsx
- vip-perks.ts
- economyNumber
- Arena Scope Resolution
- isSteamId
- formActionRedirect
- Arena Group Authority
- identity-groups.ts
- loadout-manager.tsx
- inventory-manager.tsx
- identity-group-listings.ts
- economyMutationFailure
- trade-manager.tsx
- external-group-management.ts
- groups/perks/page.tsx
- scripts
- vip/page.tsx
- vip-perks/route.ts
- site.ts
- identity-catalogue.ts
- assignments-workspace.tsx
- marketplace-browser.tsx
- player-search-field.tsx
- sell/route.ts
- player-identities.ts
- inventories/page.tsx
- session.ts
- staff/route.ts
- tickets/route.ts
- economy-view-model.ts
- registry.ts
- loadRuntimeDatabaseGroups
- market-pricing.ts
- getSession
- inventory-crate-opening.tsx
- loadout-editor.tsx
- vip-membership-activation-saga.ts
- vip-tier-catalogue.ts
- external-market-prices.ts
- compilerOptions
- ranking/page.tsx
- listings/page.tsx
- source-aware-vip-memberships.tsx
- player-profile-page.tsx
- market/page.tsx
- player-identity.tsx
- app/appeals/page.tsx
- purge-legacy-state.mjs
- reset-player-economy-state.mjs
- groups/page.tsx
- marketplace-item-preview.tsx
- progressive-form-runtime.tsx
- vip-membership-conversion.ts
- items/page.tsx
- groups-controls.tsx
- cs2-item-images.ts
- source-aware-admin-memberships.tsx
- price-refresh.ts
- purchaseEconomyItem
- create-logical-snapshot.mjs
- restore-logical-snapshot.mjs
- success-toast.tsx
- staff-grant-item-controls.tsx
- navigation-progress.tsx
- skinport-prices.ts
- item-taxonomy.ts
- getAdminAccess
- market-preview.ts
- staff-submenu.tsx
- access.ts
- loadout/route.ts
- Inventory Crate Opening Integration Design
- app/tickets/page.tsx
- sellback.ts
- resolvePortalThemeSurface
- staff-inventory-panel.tsx
- Loadout Workspace Design
- getPlayerDashboard
- Project Documentation
- server-status.ts
- chat-colors.ts
- Consolidation Design Plans
- VIP Entitlement Contracts
- dateToIso
- normalizeVipGroup
- market/preview/route.ts
- Portal Theme Authoring Guide
- partners/[steamId]/inventory/route.ts
- request-database-scope.test.mjs
- TAPPD Weapon Case Image
- Diamond VIP Badge
- Gold VIP Badge
- Silver VIP Badge
- Ultimate VIP Badge
- File structure
- players/[steamId]/inventory/route.ts
- error.tsx
- SearchNavigationForm
- data-table.tsx
- adaptive-player-hover-card.tsx
- primary-navigation.tsx
- Global Constraints
- search/route.ts
- loadout/preview/route.ts
- copy-to-clipboard-button.tsx
- image/route.ts
- Q: Items bought for a discount should be sold relative to their buying price, then audit the full site UI/UX.
- Q: How does Inventory open more than ten selected crates while retaining one selection owner?
- Q: in market, for crates, remove the Container price square. Keep the amount selector, and the 2 buttons stacked on eachother. Widen the modal if needed, when expanding possible drops
- Q: Improve the layout for crates in Inventory because it has too much unused space.
- Q: Where are the arena portal SEO metadata, homepage content, canonical URL, robots, and sitemap implemented?
- steam-market.ts
- vip-activation-message.ts
- admins/page.tsx
- vips/page.tsx
- Worker database request isolation
- arena-scope-resolution.d.mts
- next.config.ts
- next-env.d.ts

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

## Communities (125 total, 15 thin omitted)

### Community 0 - "portal-repository.ts"
Cohesion: 0.01
Nodes (222): ActivateVipMembershipItemInput, ActivateVipMembershipItemResult, AddStaffCustomCrateLootEntryInput, AddStaffCustomCrateLootEntryResult, AdminAuthorization, AdminAuthorizationRow, AdminListRow, AppealEligibilityRow (+214 more)

### Community 1 - "staff-vip-memberships.ts"
Cohesion: 0.07
Nodes (84): authorityMissing(), booleanValue(), compareMembershipPrecedence(), dateValue(), deterministicUuid(), MappedRawVipRow, membershipIsActive(), MembershipRow (+76 more)

### Community 2 - "staff-admin-memberships.ts"
Cohesion: 0.14
Nodes (47): adminMembershipError(), ArenaAdminDefinitionRow, arenaAuthorityMissing(), asBoolean(), asDate(), assignmentDurationMinutes(), assignStaffAdminMembership(), detachNativeAdminGroup() (+39 more)

### Community 3 - "economy/route.ts"
Cohesion: 0.08
Nodes (61): actionIdempotencyKey(), artworkContentTypes, catalogueMarketVersion(), crateActionErrorKey(), discountExclusions(), discountPercentageBps(), discountUtcDate(), formText() (+53 more)

### Community 4 - "economyError"
Cohesion: 0.13
Nodes (73): applyTokenDelta(), attachEconomyCharm(), attachEconomySticker(), attachEconomyStickerRecord(), awardEconomyDrop(), cancelEconomyTrade(), clearEconomyLoadoutSlot(), clearEconomyLoadoutSlots() (+65 more)

### Community 5 - "staff-management-page.tsx"
Cohesion: 0.12
Nodes (22): AppealBanSource(), CaseMessages(), errorText(), getPageNumber(), getSanctionEvents(), isSteamId(), noticeText(), ProfileMention() (+14 more)

### Community 6 - "vip-perks.ts"
Cohesion: 0.11
Nodes (40): AdminAuditRow, ArenaCustomMembership, ArenaCustomMembershipRow, configuration(), EffectiveRow, EffectiveSource, EffectiveVipPerkPage, expiryMilliseconds() (+32 more)

### Community 7 - "economyNumber"
Cohesion: 0.07
Nodes (79): createEconomyRedeemCode(), economyBoolean(), economyCount(), EconomyCrateReelPool, economyCustomDisplayName(), economyDateToIso(), economyDecimal(), economyDiscountTableMissing() (+71 more)

### Community 8 - "Arena Scope Resolution"
Cohesion: 0.08
Nodes (64): configuredArenaServerScopeLink(), acquireMigrationLock(), addDistinct(), applyArenaPlan(), applyPortalPlan(), asBoolean(), asIntegerString(), assertBridgeRow() (+56 more)

### Community 9 - "isSteamId"
Cohesion: 0.15
Nodes (33): activeVipRows(), authoritativeVipCoreRowsForSteamId(), getActiveNativeVipSuppressedSteamIds(), getAdminPool(), getAuthoritativeExternalIdentityMemberships(), getExternalIdentityGroupMembershipIndex(), getExternalIdentityGroupMemberSteamIds(), getGamePool() (+25 more)

### Community 10 - "formActionRedirect"
Cohesion: 0.14
Nodes (28): allowedImageTypes, getScreenshot(), parseCaseId(), POST(), redirect(), bool(), euroCents(), integer() (+20 more)

### Community 11 - "Arena Group Authority"
Cohesion: 0.10
Nodes (58): actorValue(), AdminGroupRow, adminNativeRowId(), AdminServerRow, ArenaGroupDefinitionAuthorityError, ArenaGroupRow, ArenaGroupScopeRow, ArenaRuntimeAuthorityRenameHint (+50 more)

### Community 12 - "identity-groups.ts"
Cohesion: 0.06
Nodes (135): bool(), number(), optionalNumber(), POST(), redirect(), returnTab(), text(), isIdentityGroupBadgeIconKey() (+127 more)

### Community 13 - "loadout-manager.tsx"
Cohesion: 0.07
Nodes (47): EconomyLoadoutManager(), chooseTeamTarget(), chooseWeaponDefinition(), runAction(), EconomyLoadoutManagerProps, equippedTeamLabels(), fallbackSlotPreview(), LOADOUT_CATEGORIES (+39 more)

### Community 14 - "inventory-manager.tsx"
Cohesion: 0.08
Nodes (43): itemIsVipMembership(), itemSupportsCharm(), itemSupportsLoadout(), useInventoryCrateOpening(), canBulkSellItem(), compareItems(), gridColumnCount(), inventoryItemToggleId() (+35 more)

### Community 15 - "identity-group-listings.ts"
Cohesion: 0.10
Nodes (42): acquireIdentityCatalogueMutationLock(), CatalogueLockRow, identityCatalogueMutationLockName, releaseIdentityCatalogueMutationLock(), ArenaCatalogueTarget, ArenaCatalogueTargetRow, arenaGroupType(), ArenaVipScopeRow (+34 more)

### Community 16 - "economyMutationFailure"
Cohesion: 0.21
Nodes (33): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+25 more)

### Community 17 - "trade-manager.tsx"
Cohesion: 0.08
Nodes (35): EconomyEmptyState(), EconomyItemCard(), EconomyItemCardProps, EconomyItemView, EconomyTradeItemView, EconomyTradeView, EconomyWalletView, formatTokens() (+27 more)

### Community 18 - "external-group-management.ts"
Cohesion: 0.13
Nodes (45): AdminAssignmentRow, AdminGroupRow, appliesToServer(), assertRuntimeCreateNameAvailable(), booleanValue(), cancelPreparedRename(), completeRenameAndRefreshPortal(), createRuntimeAdminsCoreGroup() (+37 more)

### Community 19 - "groups/perks/page.tsx"
Cohesion: 0.14
Nodes (18): configuration(), errors, expiry(), notices, pageNumber(), View, views, VipPerkAdminPage() (+10 more)

### Community 20 - "scripts"
Cohesion: 0.04
Nodes (45): lucide-react, mysql2, next, dependencies, lucide-react, mysql2, next, react (+37 more)

### Community 21 - "vip/page.tsx"
Cohesion: 0.09
Nodes (35): artworkForGroup(), conversionRate(), exactDuration(), getPageNumber(), liveConversionPreview(), matchesGroup(), MembershipAccess, metadata (+27 more)

### Community 22 - "vip-perks/route.ts"
Cohesion: 0.18
Nodes (27): actionView(), bool(), number(), POST(), redirect(), value(), adminMutation(), category() (+19 more)

### Community 23 - "site.ts"
Cohesion: 0.11
Nodes (22): metadata, ModesPage(), HomePage(), metadata, robots(), sitemap(), ArenaMode, arenaModes (+14 more)

### Community 24 - "identity-catalogue.ts"
Cohesion: 0.06
Nodes (55): AdminDatabaseAssignmentRow, AdminDatabaseGroupRow, applyIdentityGroupRenameIntent(), assertIdentityGroupExternalKeyAvailable(), builtinGamePermissions, cancelIdentityGroupRename(), CatalogueAliasRow, completeIdentityGroupRename() (+47 more)

### Community 25 - "assignments-workspace.tsx"
Cohesion: 0.07
Nodes (39): AdminAssignment, adminScopes(), Assignment, AssignmentRecordCard(), assignmentRecords(), AssignmentStatus, AssignmentsWorkspace(), AssignmentsWorkspaceProps (+31 more)

### Community 26 - "marketplace-browser.tsx"
Cohesion: 0.06
Nodes (66): CrateDropPreview(), CrateDropPreviewReady(), DISPLAYED_RARITY_RANKS, economyCrateDropStateFromResponse(), normalizedText(), responseMessage(), rarityName(), defaultFloatForItem() (+58 more)

### Community 27 - "player-search-field.tsx"
Cohesion: 0.19
Nodes (17): isRecord(), isSteamId64(), noLocalPlayers, parsePlayers(), PLAYER_SEARCH_ENDPOINT, playerIdentity(), PlayerSearchField(), choosePlayer() (+9 more)

### Community 28 - "sell/route.ts"
Cohesion: 0.12
Nodes (35): isLegacySteamPrice(), metadataFloat(), POST(), isLegacySteamPrice(), metadataSeed(), optionalFloat(), optionalStattrak(), POST() (+27 more)

### Community 29 - "player-identities.ts"
Cohesion: 0.20
Nodes (16): PlayerProfilePageProps, PublicPlayerProfilePage(), getEffectiveIdentity(), getPlayerProfileThemeKey(), getPlayerProfileThemeKeys(), getPlayerSettings(), toOwnedProfileTheme(), chunks() (+8 more)

### Community 30 - "inventories/page.tsx"
Cohesion: 0.16
Nodes (18): AdminInventoriesPage(), AdminInventoriesPageProps, feedback(), formatTokens(), inventoriesHref(), inventoryMutationAction(), inventoryStates, positivePage() (+10 more)

### Community 31 - "session.ts"
Cohesion: 0.12
Nodes (28): POST(), GET(), GET(), json(), POST(), privateNoStore, publicSettings(), record() (+20 more)

### Community 32 - "staff/route.ts"
Cohesion: 0.13
Nodes (26): adminMembershipReference(), adminMembershipSource(), arenaMembershipUuid(), assignmentDurationMinutes(), exactStoredAdminGroup(), exactStoredVipGroup(), fallbackVipGroups, optionalVipServerId() (+18 more)

### Community 33 - "tickets/route.ts"
Cohesion: 0.16
Nodes (22): hasActiveBan(), isClosedAppeal(), parseCaseId(), POST(), redirect(), categories, isClosedTicket(), parseCaseId() (+14 more)

### Community 34 - "economy-view-model.ts"
Cohesion: 0.20
Nodes (29): asArray(), authoritativeCrateRarity(), economyCatalogueItems(), economyCrates(), EconomyCrateView, economyItems(), economyLoadout(), EconomyLoadoutView (+21 more)

### Community 35 - "registry.ts"
Cohesion: 0.08
Nodes (29): ProfileThemeSurfaceBadgeProps, surfaceClassNames, rainDrops, RainDropStyle, TapGodRainBackground(), ThemeBackground(), themeBackgrounds, ThemeIcon() (+21 more)

### Community 36 - "loadRuntimeDatabaseGroups"
Cohesion: 0.14
Nodes (30): addPermission(), adminsConfigCandidates(), appliesToConfiguredServer(), asObject(), boundedInteger(), cleanCapabilityKey(), cleanGroupName(), cleanPermissionKey() (+22 more)

### Community 37 - "market-pricing.ts"
Cohesion: 0.14
Nodes (25): addCandidate(), boundedFloat(), boundedSeed(), deriveMarketplacePriceIdentity(), MarketplaceFloatRange, MarketplacePriceCandidate, MarketplacePriceFallback, MarketplacePriceIdentity (+17 more)

### Community 38 - "getSession"
Cohesion: 0.11
Nodes (28): RedeemCodeAdminPage(), RedeemCodeAdminPageProps, GET(), RouteContext, DashboardPage(), DashboardPageProps, InventoryPage(), LoadoutPage() (+20 more)

### Community 39 - "inventory-crate-opening.tsx"
Cohesion: 0.12
Nodes (27): EconomyCrateDrop, EconomyCrateDropState, humanize(), rarityClass(), rarityRankClass(), BulkCrateOpeningSession, BulkOpeningRow, crateLootPresentation() (+19 more)

### Community 40 - "loadout-editor.tsx"
Cohesion: 0.10
Nodes (28): categories, EditorCategory, fallbackIcon(), isSkinCategory(), LoadoutEditor(), changeCategory(), changeWeaponGroup(), resetAdvancedFields() (+20 more)

### Community 41 - "vip-membership-activation-saga.ts"
Cohesion: 0.06
Nodes (76): ArenaDatabasePoolRegistry, connectionLimit(), getPool(), getPortalDatabasePool(), globalWithArenaPools, installMysqlUtcSessionInitializer(), MYSQL_UTC_CLIENT_TIMEZONE, MYSQL_UTC_SESSION_SQL (+68 more)

### Community 42 - "vip-tier-catalogue.ts"
Cohesion: 0.14
Nodes (28): boolean(), configuredVipServerId(), displayNumber(), fallbackTierSkeletons, finiteNumber(), formatUtilities(), GameVipGroupRow, genericDetail() (+20 more)

### Community 43 - "external-market-prices.ts"
Cohesion: 0.15
Nodes (28): CsfloatExactListingLookup, csfloatQuotes(), exactListingCache, exactListingCacheKey(), ExactListingCacheValue, exchangeRateFromPayload(), ExchangeRateSnapshot, ExternalMarketPrice (+20 more)

### Community 44 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 45 - "ranking/page.tsx"
Cohesion: 0.13
Nodes (17): getPageNumber(), metadata, rankingLink(), RankingPage(), RankingPageProps, accountLinks, AccountNav(), AccountNavProps (+9 more)

### Community 46 - "listings/page.tsx"
Cohesion: 0.12
Nodes (24): durationLabel(), errors, euroInput(), GroupListingsPage(), ListingForm(), notices, positiveInteger(), selectedView() (+16 more)

### Community 47 - "source-aware-vip-memberships.tsx"
Cohesion: 0.13
Nodes (24): ConfirmSubmitButton(), consolidationChoices(), dateTimeFormatter, exactReferenceLabel(), ExtensionForm(), fallbackIdentity(), hasExactMutationReference(), MembershipRecord() (+16 more)

### Community 48 - "player-profile-page.tsx"
Cohesion: 0.13
Nodes (23): formatPlaytime(), avatarInitial(), countFormatter, formatCount(), Hitbox, hitboxes, hitIntensity(), HitMap() (+15 more)

### Community 49 - "market/page.tsx"
Cohesion: 0.14
Nodes (19): marketDiscountCategoryLabels, MarketPage(), MarketPageProps, metadata, positivePage(), adjustmentLabel(), endLabel(), MarketDiscountAnnouncement() (+11 more)

### Community 50 - "player-identity.tsx"
Cohesion: 0.11
Nodes (25): avatarInitial(), PlayerIdentity(), PlayerIdentityProps, PlayerIdentityVariant, presenceLabel(), InventoryVisibility, OwnedTheme, ProfileSettingsForm() (+17 more)

### Community 51 - "app/appeals/page.tsx"
Cohesion: 0.10
Nodes (19): AppealBanContext(), AppealCase(), AppealsPageProps, canReply(), authorName(), CaseConversation(), CaseConversationProps, MessageCard() (+11 more)

### Community 52 - "purge-legacy-state.mjs"
Cohesion: 0.16
Nodes (20): acquireLock(), arenaProtectedState(), args, captureDeleteTriggers(), checksum(), count(), dropDeleteTriggers(), portableTriggerSql() (+12 more)

### Community 53 - "reset-player-economy-state.mjs"
Cohesion: 0.11
Nodes (16): args, captureDeleteTriggers(), checksum(), count(), portableTriggerSql(), protectedTables, quoteIdentifier(), report (+8 more)

### Community 54 - "groups/page.tsx"
Cohesion: 0.10
Nodes (30): errorMessages, formatSyncedAt(), GroupAdminTab, groupAdminTabs, GroupCard(), GroupsPage(), GroupsPageProps, groupType() (+22 more)

### Community 55 - "marketplace-item-preview.tsx"
Cohesion: 0.15
Nodes (17): fallbackIcon(), imageCandidates(), MarketplaceItemPreview(), MarketplaceItemPreviewProps, marketPreviewUrl(), previewImageUrlsFromResponse(), PreviewState, safeImageUrl() (+9 more)

### Community 56 - "progressive-form-runtime.tsx"
Cohesion: 0.15
Nodes (21): appendQuery(), AUTH_ENTRY_PATHS, dispatchFormEvent(), NATIVE_FORM_VALUES, ProgressiveFormRuntime(), handleSubmit(), onSubmit(), settleAfterNavigation() (+13 more)

### Community 57 - "vip-membership-conversion.ts"
Cohesion: 0.16
Nodes (22): liveVipRateScheduleIsValid(), assertValidVipTierRate(), compareVipTierRates(), convertTimedVipMembership(), convertVipDurationBetweenTierRates(), isEligibleVipTierRateListingCandidate(), isValidVipTierRate(), requireIncreasingTierRate() (+14 more)

### Community 58 - "items/page.tsx"
Cohesion: 0.17
Nodes (19): AdminItemsPage(), AdminItemsPageProps, catalogueArtworkUrl(), cleanLookup(), errorText(), formatDate(), formatDropChance(), formatPrice() (+11 more)

### Community 59 - "groups-controls.tsx"
Cohesion: 0.13
Nodes (15): compareGroups(), GroupSort, GroupSortKey, groupTypeLabel(), groupTypeOrder, GroupWorkspace(), selectGroup(), GroupWorkspaceEntry (+7 more)

### Community 60 - "cs2-item-images.ts"
Cohesion: 0.17
Nodes (19): asNumber(), asRecord(), asRows(), asText(), buildImageSource(), CachedValue, cacheKey(), CatalogueImageSource (+11 more)

### Community 61 - "source-aware-admin-memberships.tsx"
Cohesion: 0.13
Nodes (21): ActionExplanation(), dateTimeFormatter, exactReferenceAvailable(), exactReferenceLabel(), fallbackIdentity(), isFounderGroup(), MembershipRecord(), parsedTimestamp() (+13 more)

### Community 62 - "price-refresh.ts"
Cohesion: 0.16
Nodes (18): GET(), isAuthorized(), maxDuration, runtime, register(), EconomyPublicPriceRefreshUpdate, getEconomyPublicPriceRefreshCandidates(), pruneCompletedEconomyOperationReceipts() (+10 more)

### Community 63 - "purchaseEconomyItem"
Cohesion: 0.09
Nodes (38): applyEconomyCatalogueDiscounts(), createEconomyInventoryItem(), EconomyCatalogueFilter, economyCatalogueFloatRange(), EconomyCataloguePage, economyCatalogueSearchFilter(), economyCatalogueSearchTerms(), economyCharmAttributes() (+30 more)

### Community 64 - "create-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (13): args, encodeRow(), encodeValue(), fileOutput, gzip, manifest, outputDir, outputFile (+5 more)

### Community 65 - "restore-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (12): args, file, manifest, mismatches, objects, relative, root, rowCounts (+4 more)

### Community 66 - "success-toast.tsx"
Cohesion: 0.11
Nodes (21): createEconomyIdempotencyKey(), EconomyActionRequestError, EconomyActionResult, postEconomyAction(), bulkSellItems(), runAction(), RedeemCodeForm(), submit() (+13 more)

### Community 67 - "staff-grant-item-controls.tsx"
Cohesion: 0.10
Nodes (29): BatchGrantResponse, CatalogueFilter, catalogueFilters, catalogueLine(), CatalogueSearchResponse, customItemTypes, customLine(), featuredTypes (+21 more)

### Community 68 - "navigation-progress.tsx"
Cohesion: 0.16
Nodes (16): interactiveSelector, StaffInventoryPlayerRow(), handleClick(), navigate(), StaffInventoryPlayerRowProps, ProfileTab, ProfileTabs(), activateTab() (+8 more)

### Community 69 - "skinport-prices.ts"
Cohesion: 0.22
Nodes (17): euroCents(), fetchSkinportRows(), fetchSnapshot(), getSkinportHistoricalPrice(), getSkinportHistoricalPrices(), getSnapshot(), HistoricalPeriod, historicalPeriods (+9 more)

### Community 70 - "item-taxonomy.ts"
Cohesion: 0.05
Nodes (48): CatalogueSearchField(), CatalogueSearchFieldProps, CatalogueSearchItem, CatalogueSearchResponse, isRecord(), parseItems(), CatalogueSearchResponse, DiscountCatalogueOption (+40 more)

### Community 71 - "getAdminAccess"
Cohesion: 0.18
Nodes (17): catalogueId(), GET(), json(), noStore, ensureActorCanTarget(), GET(), idempotencyKey(), optionalInteger() (+9 more)

### Community 72 - "market-preview.ts"
Cohesion: 0.18
Nodes (14): LoadoutAgent, LoadoutCatalogue, LoadoutItem, LoadoutPaintkit, CachedPreview, fetchMarketImage(), findItem(), getMarketPreview() (+6 more)

### Community 73 - "staff-submenu.tsx"
Cohesion: 0.15
Nodes (14): AdminRedirectPage(), LegacyAdminSearchParams, staffSection(), GroupAdminNav(), groupAdminNavItems, GroupAdminNavKey, StaffModerationSection, staffModerationSections (+6 more)

### Community 74 - "access.ts"
Cohesion: 0.21
Nodes (15): AdminGroupConfig, currentGroups, getAdminAccessUncached(), getConfiguredGroups(), getStaffGroupDefinitions(), hasPermission(), isStaffPermission(), LiveAdminGroupRow (+7 more)

### Community 75 - "loadout/route.ts"
Cohesion: 0.27
Nodes (13): advancedSkinPayload(), agentIndexes(), has(), integer(), jsonError(), LoadoutRequest, POST(), selectedTeams() (+5 more)

### Community 76 - "Inventory Crate Opening Integration Design"
Cohesion: 0.14
Nodes (13): Bulk-opening session, Chosen architecture, Component boundaries, Explicit non-goals, Goal, Inventory behavior, Inventory Crate Opening Integration Design, Normal item management (+5 more)

### Community 77 - "app/tickets/page.tsx"
Cohesion: 0.21
Nodes (11): canReply(), getVipRequest(), listingId(), TicketCase(), TicketsPage(), TicketsPageProps, IdentityGroupListing, PortalTicket (+3 more)

### Community 78 - "sellback.ts"
Cohesion: 0.22
Nodes (12): ECONOMY_SELLBACK_BASIS_POINTS, ECONOMY_SELLBACK_MINIMUM_TOKENS, ECONOMY_SELLBACK_PERCENT_LABEL, economySellbackPayoutTokens(), EconomySellbackResolution, economySellbackSaleMessage(), EconomySellbackSaleMessageInput, economySellbackUsesMinimum() (+4 more)

### Community 79 - "resolvePortalThemeSurface"
Cohesion: 0.15
Nodes (18): metadata, RootLayout(), CursorGridBackground(), GlobalThemeBackground(), GlobalThemeDocumentEffects(), ProfileThemeAvatarAdornment(), ProfileThemeBackground(), ProfileThemeDocumentEffects() (+10 more)

### Community 80 - "staff-inventory-panel.tsx"
Cohesion: 0.14
Nodes (14): GrantCatalogueItem, StaffGrantItemForm(), DirectoryContext, formatTokens(), InventoryFilters, inventoryImageUrl(), inventoryStates, ItemEditor() (+6 more)

### Community 81 - "Loadout Workspace Design"
Cohesion: 0.15
Nodes (12): 1. Choose a category, 2. Choose a weapon or team, 3. Choose an owned item, Accessibility, Data and component design, Error and empty states, Goal, Interaction model (+4 more)

### Community 82 - "getPlayerDashboard"
Cohesion: 0.24
Nodes (14): emptyHitboxStats(), getLeaderboard(), getLeaderboardPosition(), getLeaderboardTotal(), getMvpColumn(), getNoscopeColumn(), getPlayerDashboard(), getPublicPlayerProfile() (+6 more)

### Community 83 - "Project Documentation"
Cohesion: 0.29
Nodes (7): Arena Group Authority Documentation, Discord Bot Plan, Portal Theme System, Website Plan, Beta Tester Theme SVG, Tap God Theme SVG, ARENA Portal README

### Community 84 - "server-status.ts"
Cohesion: 0.29
Nodes (10): GET(), getServerStatus(), parseInfoResponse(), parseStatus(), querySourceServer(), queryStatusEndpoint(), readCString(), ServerStatus (+2 more)

### Community 85 - "chat-colors.ts"
Cohesion: 0.31
Nodes (7): TagColorFields(), ChatColor, chatColorPreview(), chatColors, normalizeChatColor(), supported, tokens

### Community 88 - "dateToIso"
Cohesion: 0.33
Nodes (10): clampStaffPage(), dateToIso(), getAppealBans(), getAppeals(), getCaseAttachments(), getCaseMessages(), getStaffAppeals(), getStaffTickets() (+2 more)

### Community 89 - "normalizeVipGroup"
Cohesion: 0.39
Nodes (6): fallbackVipGroups, vipGroupIdentity(), visibleVipGroups(), key(), normalizeVipGroup(), StaffVip

### Community 90 - "market/preview/route.ts"
Cohesion: 0.40
Nodes (9): asCatalogueId(), asFloat(), GET(), metadataText(), officialImageUrl(), previewMarketNames(), uniqueImageUrls(), wearLabel() (+1 more)

### Community 92 - "partners/[steamId]/inventory/route.ts"
Cohesion: 0.47
Nodes (5): GET(), json(), pageNumber(), privateNoStore, RouteContext

### Community 99 - "File structure"
Cohesion: 0.22
Nodes (8): File structure, Global Constraints, Inventory Crate Opening Integration Implementation Plan, Task 1: Pure crate-selection and multi-request planning policy, Task 2: Extract the Inventory opening controller and presentation, Task 3: Integrate single-container opening into item management, Task 4: Integrate up-to-50 bulk opening with lock and sale actions, Task 5: Remove the duplicate opener, finish responsive UI, and verify

### Community 100 - "players/[steamId]/inventory/route.ts"
Cohesion: 0.47
Nodes (5): GET(), json(), pageNumber(), privateNoStore, RouteContext

### Community 101 - "error.tsx"
Cohesion: 0.40
Nodes (3): ErrorPageProps, EmptyState(), EmptyStateProps

### Community 102 - "SearchNavigationForm"
Cohesion: 0.60
Nodes (6): SearchNavigationForm(), change(), input(), navigate(), schedule(), submit()

### Community 103 - "data-table.tsx"
Cohesion: 0.50
Nodes (4): classNames(), DataTable(), DataTableProps, NativeTableProps

### Community 104 - "adaptive-player-hover-card.tsx"
Cohesion: 0.33
Nodes (6): AdaptivePlayerHoverCard(), AdaptivePlayerHoverCardProps, CardPosition, Placement, relatedTargetIsInside(), triggerSelector

### Community 105 - "primary-navigation.tsx"
Cohesion: 0.43
Nodes (4): primaryLinks, PrimaryNavigation(), PrimaryNavigationLinks(), isPrimaryNavigationLinkActive()

### Community 106 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Global Constraints, Guided Loadout Workspace Implementation Plan, Task 1: Add the pure owned-loadout selection model, Task 2: Rebuild the Loadout manager as a guided visual workflow, Task 3: Add the responsive image-led presentation and page copy, Task 4: Review, verify, and refresh architecture output

### Community 107 - "search/route.ts"
Cohesion: 0.67
Nodes (3): GET(), json(), noStore

### Community 108 - "loadout/preview/route.ts"
Cohesion: 0.60
Nodes (5): asInteger(), asWear(), GET(), previewResponse(), getCs2CatalogueImage()

### Community 109 - "copy-to-clipboard-button.tsx"
Cohesion: 0.40
Nodes (5): CopyState, CopyToClipboardButton(), handleCopy(), CopyToClipboardButtonProps, writeToClipboard()

### Community 110 - "image/route.ts"
Cohesion: 0.60
Nodes (4): GET(), runtime, safeContentType(), trustedImageUrl()

### Community 111 - "Q: Items bought for a discount should be sold relative to their buying price, then audit the full site UI/UX."
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Items bought for a discount should be sold relative to their buying price, then audit the full site UI/UX., Source Nodes

### Community 112 - "Q: How does Inventory open more than ten selected crates while retaining one selection owner?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How does Inventory open more than ten selected crates while retaining one selection owner?, Source Nodes

### Community 113 - "Q: in market, for crates, remove the Container price square. Keep the amount selector, and the 2 buttons stacked on eachother. Widen the modal if needed, when expanding possible drops"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: in market, for crates, remove the Container price square. Keep the amount selector, and the 2 buttons stacked on eachother. Widen the modal if needed, when expanding possible drops, Source Nodes

### Community 114 - "Q: Improve the layout for crates in Inventory because it has too much unused space."
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Improve the layout for crates in Inventory because it has too much unused space., Source Nodes

### Community 115 - "Q: Where are the arena portal SEO metadata, homepage content, canonical URL, robots, and sitemap implemented?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Where are the arena portal SEO metadata, homepage content, canonical URL, robots, and sitemap implemented?, Source Nodes

### Community 116 - "steam-market.ts"
Cohesion: 0.60
Nodes (4): fetchSteamMarketPrice(), getLowestPrice(), parseEuroCents(), SteamMarketPrice

### Community 117 - "vip-activation-message.ts"
Cohesion: 0.60
Nodes (4): formatExpiry(), formatVipDuration(), vipActivationMessage(), VipActivationMessageResult

## Knowledge Gaps
- **859 isolated node(s):** `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope`, `AssignmentsWorkspaceProps`, `AssignmentStatus` (+854 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 991 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `crate-drop-preview.tsx` (2× useful, score=1.910384208)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSession` connect `getSession` to `economy/route.ts`, `staff-management-page.tsx`, `formActionRedirect`, `identity-groups.ts`, `economyMutationFailure`, `groups/perks/page.tsx`, `vip/page.tsx`, `vip-perks/route.ts`, `site.ts`, `sell/route.ts`, `player-identities.ts`, `inventories/page.tsx`, `session.ts`, `staff/route.ts`, `tickets/route.ts`, `ranking/page.tsx`, `listings/page.tsx`, `market/page.tsx`, `app/appeals/page.tsx`, `groups/page.tsx`, `items/page.tsx`, `getAdminAccess`, `loadout/route.ts`, `app/tickets/page.tsx`, `resolvePortalThemeSurface`, `market/preview/route.ts`, `partners/[steamId]/inventory/route.ts`, `players/[steamId]/inventory/route.ts`, `search/route.ts`, `loadout/preview/route.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `getGameDatabasePool()` connect `staff-vip-memberships.ts` to `portal-repository.ts`, `staff-admin-memberships.ts`, `loadRuntimeDatabaseGroups`, `vip-perks.ts`, `vip-membership-activation-saga.ts`, `access.ts`, `Arena Group Authority`, `identity-groups.ts`, `isSteamId`, `listings/page.tsx`, `identity-group-listings.ts`, `vip-tier-catalogue.ts`, `external-group-management.ts`, `groups/page.tsx`, `vip-perks/route.ts`, `identity-catalogue.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `configuredArenaServerScopeLink()` connect `Arena Scope Resolution` to `Arena Group Authority`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope` to the rest of the system?**
  _859 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal-repository.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.009372601300852422 - nodes in this community are weakly interconnected._
- **Should `staff-vip-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07056936647955092 - nodes in this community are weakly interconnected._
- **Should `staff-admin-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1427304964539007 - nodes in this community are weakly interconnected._