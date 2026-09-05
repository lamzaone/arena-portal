# Graph Report - arena-portal  (2026-09-05)

## Corpus Check
- 294 files · ~708,615 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3279 nodes · 9332 edges · 125 communities (109 shown, 15 thin omitted)
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
- getPlayerDashboard
- access.ts
- Arena Group Authority
- identity-groups.ts
- loadout-manager.tsx
- inventory-manager.tsx
- identity-group-listings.ts
- economyMutationFailure
- trade-manager.tsx
- external-group-management.ts
- listings/page.tsx
- scripts
- vip/page.tsx
- groups/route.ts
- site.ts
- identity-catalogue.ts
- assignments-workspace.tsx
- marketplace-browser.tsx
- staff-inventory-panel.tsx
- sell/route.ts
- player-identities.ts
- inventories/page.tsx
- session.ts
- crate-drop-preview.tsx
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
- staff-grant-item-controls.tsx
- source-aware-vip-memberships.tsx
- player-profile-page.tsx
- market/page.tsx
- profile-themes.ts
- getPortalDatabasePool
- purge-legacy-state.mjs
- reset-player-economy-state.mjs
- groups/page.tsx
- marketplace-item-preview.tsx
- progressive-form-runtime.tsx
- vip-membership-conversion.ts
- items/page.tsx
- groups-controls.tsx
- cs2-item-images.ts
- reconcileIdentityGroupRewards
- price-refresh.ts
- economyText
- create-logical-snapshot.mjs
- restore-logical-snapshot.mjs
- postEconomyAction
- StaffGrantItemControls
- navigation-progress.tsx
- skinport-prices.ts
- discount-rule-admin.tsx
- identityError
- market-preview.ts
- redeem-code-admin.tsx
- database-pools.ts
- loadout/route.ts
- Inventory Crate Opening Integration Design
- prepareIdentityGroupRename
- sellback.ts
- resolvePortalThemeSurface
- catalogue-search-field.tsx
- Loadout Workspace Design
- applyArenaVipCommand
- Project Documentation
- adminScopes
- chat-colors.ts
- Consolidation Design Plans
- VIP Entitlement Contracts
- theme-document-effects.tsx
- group-listings/route.ts
- market/preview/route.ts
- Portal Theme Authoring Guide
- market/purchase/route.ts
- request-database-scope.test.mjs
- TAPPD Weapon Case Image
- Diamond VIP Badge
- Gold VIP Badge
- Silver VIP Badge
- Ultimate VIP Badge
- File structure
- equipProfileThemeItem
- not-found.tsx
- staff-membership-inventory.ts
- vip-activation-state.ts
- adaptive-player-hover-card.tsx
- primary-navigation.tsx
- Global Constraints
- steam.ts
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
- `GroupListingsPage()` --calls--> `getAdminAccess`  [EXTRACTED]
  app/admin/groups/listings/page.tsx → lib/admin/access.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **VIP and Identity Management** — docs_vip_perks, db_arena_readme, readme [EXTRACTED 0.90]

## Communities (125 total, 15 thin omitted)

### Community 0 - "portal-repository.ts"
Cohesion: 0.01
Nodes (221): ActivateVipMembershipItemInput, ActivateVipMembershipItemResult, AddStaffCustomCrateLootEntryInput, AddStaffCustomCrateLootEntryResult, AdminAuthorization, AdminAuthorizationRow, AdminListRow, AppealBan (+213 more)

### Community 1 - "staff-vip-memberships.ts"
Cohesion: 0.05
Nodes (111): adminMembershipReference(), adminMembershipSource(), arenaMembershipUuid(), assignmentDurationMinutes(), exactStoredAdminGroup(), exactStoredVipGroup(), fallbackVipGroups, optionalVipServerId() (+103 more)

### Community 2 - "staff-admin-memberships.ts"
Cohesion: 0.07
Nodes (72): ActionExplanation(), dateTimeFormatter, exactReferenceAvailable(), exactReferenceLabel(), fallbackIdentity(), isFounderGroup(), MembershipRecord(), parsedTimestamp() (+64 more)

### Community 3 - "economy/route.ts"
Cohesion: 0.08
Nodes (74): actionIdempotencyKey(), artworkContentTypes, catalogueMarketVersion(), crateActionErrorKey(), discountExclusions(), discountPercentageBps(), discountUtcDate(), ensureActorCanTarget() (+66 more)

### Community 4 - "economyError"
Cohesion: 0.08
Nodes (76): applyTokenDelta(), attachEconomyCharm(), attachEconomySticker(), awardEconomyDrop(), cancelEconomyTrade(), clearEconomyLoadoutSlots(), createEconomyInventoryItem(), createEconomyNotification() (+68 more)

### Community 5 - "staff-management-page.tsx"
Cohesion: 0.06
Nodes (51): AppealBanSource(), CaseMessages(), errorText(), getPageNumber(), getSanctionEvents(), isSteamId(), noticeText(), ProfileMention() (+43 more)

### Community 6 - "vip-perks.ts"
Cohesion: 0.07
Nodes (66): VipPerkShop(), VipPerkShopProps, AdminAuditRow, adminMutation(), ArenaCustomMembership, ArenaCustomMembershipRow, category(), configuration() (+58 more)

### Community 7 - "economyNumber"
Cohesion: 0.08
Nodes (69): applyEconomyCatalogueDiscounts(), economyBoolean(), EconomyCatalogueFilter, EconomyCataloguePage, economyCatalogueSearchFilter(), economyCount(), EconomyCratePage, EconomyCrateReelPool (+61 more)

### Community 8 - "Arena Scope Resolution"
Cohesion: 0.08
Nodes (64): configuredArenaServerScopeLink(), acquireMigrationLock(), addDistinct(), applyArenaPlan(), applyPortalPlan(), asBoolean(), asIntegerString(), assertBridgeRow() (+56 more)

### Community 9 - "getPlayerDashboard"
Cohesion: 0.07
Nodes (65): key(), normalizeVipGroup(), activeVipRows(), authoritativeVipCoreRowsForSteamId(), clampStaffPage(), emptyHitboxStats(), escapeLikeSearch(), getActiveNativeVipSuppressedSteamIds() (+57 more)

### Community 10 - "access.ts"
Cohesion: 0.07
Nodes (53): allowedImageTypes, getScreenshot(), parseCaseId(), POST(), redirect(), catalogueId(), GET(), json() (+45 more)

### Community 11 - "Arena Group Authority"
Cohesion: 0.10
Nodes (58): actorValue(), AdminGroupRow, adminNativeRowId(), AdminServerRow, ArenaGroupDefinitionAuthorityError, ArenaGroupRow, ArenaGroupScopeRow, ArenaRuntimeAuthorityRenameHint (+50 more)

### Community 12 - "identity-groups.ts"
Cohesion: 0.06
Nodes (59): ensureIdentityCatalogue(), getIdentityCatalogueStatus(), ArenaAuthorityMembership, ArenaAuthorityMembershipRow, ArenaAuthorityMembershipSnapshot, arenaGroupType(), ArenaIdentityGroupTargetRow, ArenaIdentityMembershipMutationRow (+51 more)

### Community 13 - "loadout-manager.tsx"
Cohesion: 0.06
Nodes (48): EconomyLoadoutManager(), chooseTeamTarget(), chooseWeaponDefinition(), runAction(), EconomyLoadoutManagerProps, equippedTeamLabels(), fallbackSlotPreview(), LOADOUT_CATEGORIES (+40 more)

### Community 14 - "inventory-manager.tsx"
Cohesion: 0.07
Nodes (43): itemIsVipMembership(), itemSupportsCharm(), itemSupportsLoadout(), canBulkSellItem(), compareItems(), gridColumnCount(), inventoryItemToggleId(), InventoryManager() (+35 more)

### Community 15 - "identity-group-listings.ts"
Cohesion: 0.10
Nodes (48): acquireIdentityCatalogueMutationLock(), CatalogueLockRow, identityCatalogueMutationLockName, releaseIdentityCatalogueMutationLock(), ArenaCatalogueTarget, ArenaCatalogueTargetRow, arenaGroupType(), ArenaVipScopeRow (+40 more)

### Community 16 - "economyMutationFailure"
Cohesion: 0.21
Nodes (34): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+26 more)

### Community 17 - "trade-manager.tsx"
Cohesion: 0.07
Nodes (40): EconomyEmptyState(), EconomyItemCard(), EconomyItemCardProps, EconomyItemView, EconomyTradeItemView, EconomyTradeView, EconomyWalletView, formatTokens() (+32 more)

### Community 18 - "external-group-management.ts"
Cohesion: 0.12
Nodes (47): AdminAssignmentRow, AdminGroupRow, appliesToServer(), assertRuntimeCreateNameAvailable(), booleanValue(), cancelPreparedRename(), completeRenameAndRefreshPortal(), createRuntimeAdminsCoreGroup() (+39 more)

### Community 19 - "listings/page.tsx"
Cohesion: 0.08
Nodes (36): ConfirmSubmitButton(), durationLabel(), errors, euroInput(), GroupListingsPage(), ListingForm(), notices, positiveInteger() (+28 more)

### Community 20 - "scripts"
Cohesion: 0.04
Nodes (45): lucide-react, mysql2, next, dependencies, lucide-react, mysql2, next, react (+37 more)

### Community 21 - "vip/page.tsx"
Cohesion: 0.08
Nodes (41): artworkForGroup(), conversionRate(), exactDuration(), getPageNumber(), liveConversionPreview(), liveVipRateScheduleIsValid(), loadMembershipListings(), matchesGroup() (+33 more)

### Community 22 - "groups/route.ts"
Cohesion: 0.19
Nodes (42): bool(), number(), optionalNumber(), POST(), redirect(), returnTab(), text(), isIdentityGroupBadgeIconKey() (+34 more)

### Community 23 - "site.ts"
Cohesion: 0.08
Nodes (33): GET(), metadata, ModesPage(), HomePage(), metadata, robots(), sitemap(), ArenaMode (+25 more)

### Community 24 - "identity-catalogue.ts"
Cohesion: 0.07
Nodes (41): AdminDatabaseAssignmentRow, AdminDatabaseGroupRow, builtinGamePermissions, CatalogueAliasRow, contentHash(), CountRow, disableUndeliverableExternalListings(), disableUnverifiedConfigSources() (+33 more)

### Community 25 - "assignments-workspace.tsx"
Cohesion: 0.07
Nodes (29): AdminAssignment, Assignment, AssignmentRecordCard(), AssignmentStatus, AssignmentsWorkspace(), AssignmentsWorkspaceProps, AssignmentVipScope, AssignmentWorkspaceView (+21 more)

### Community 26 - "marketplace-browser.tsx"
Cohesion: 0.09
Nodes (38): defaultFloatForItem(), discountPercentLabel(), displayQuotedFloat(), floatInRange(), floatsMatch(), formatFloat(), isContainerItem(), isFloatSelectable() (+30 more)

### Community 27 - "staff-inventory-panel.tsx"
Cohesion: 0.08
Nodes (34): GrantCatalogueItem, StaffGrantItemForm(), DirectoryContext, formatTokens(), InventoryFilters, inventoryStates, Pagination, StaffInventoryPanel() (+26 more)

### Community 28 - "sell/route.ts"
Cohesion: 0.12
Nodes (32): isLegacySteamPrice(), metadataFloat(), POST(), catalogueIdFromSearch(), floatFromSearch(), GET(), legacySteamPrice(), metadataSeed() (+24 more)

### Community 29 - "player-identities.ts"
Cohesion: 0.10
Nodes (28): GET(), json(), noStore, GET(), json(), pageNumber(), privateNoStore, RouteContext (+20 more)

### Community 30 - "inventories/page.tsx"
Cohesion: 0.10
Nodes (29): AdminInventoriesPage(), AdminInventoriesPageProps, feedback(), formatTokens(), inventoriesHref(), inventoryMutationAction(), inventoryStates, positivePage() (+21 more)

### Community 31 - "session.ts"
Cohesion: 0.11
Nodes (27): POST(), GET(), GET(), json(), pageNumber(), privateNoStore, RouteContext, json() (+19 more)

### Community 32 - "crate-drop-preview.tsx"
Cohesion: 0.14
Nodes (27): CrateDropPreview(), CrateDropPreviewReady(), DISPLAYED_RARITY_RANKS, economyCrateDropStateFromResponse(), normalizedText(), responseMessage(), purchase(), MarketplaceContainerPanel() (+19 more)

### Community 33 - "tickets/route.ts"
Cohesion: 0.14
Nodes (26): hasActiveBan(), isClosedAppeal(), parseCaseId(), POST(), redirect(), categories, isClosedTicket(), parseCaseId() (+18 more)

### Community 34 - "economy-view-model.ts"
Cohesion: 0.21
Nodes (28): asArray(), authoritativeCrateRarity(), economyCatalogueItems(), economyCrates(), EconomyCrateView, economyLoadout(), EconomyLoadoutView, economyTrades() (+20 more)

### Community 35 - "registry.ts"
Cohesion: 0.10
Nodes (23): rainDrops, RainDropStyle, TapGodRainBackground(), themeBackgrounds, ThemeIconProps, themeIcons, betaTesterTheme, defaultTheme (+15 more)

### Community 36 - "loadRuntimeDatabaseGroups"
Cohesion: 0.14
Nodes (30): addPermission(), adminsConfigCandidates(), appliesToConfiguredServer(), asObject(), boundedInteger(), cleanCapabilityKey(), cleanGroupName(), cleanPermissionKey() (+22 more)

### Community 37 - "market-pricing.ts"
Cohesion: 0.13
Nodes (29): economyMarketplaceQuoteKey(), economyValidateResolvedMarketplaceQuote(), addCandidate(), adjustedMarketplaceEuroCents(), boundedFloat(), boundedSeed(), deriveMarketplacePriceIdentity(), isFloatPricedMarketplaceItem() (+21 more)

### Community 38 - "getSession"
Cohesion: 0.20
Nodes (18): GET(), RouteContext, DashboardPage(), DashboardPageProps, InventoryPage(), LoadoutPage(), RedeemPage(), SettingsPage() (+10 more)

### Community 39 - "inventory-crate-opening.tsx"
Cohesion: 0.12
Nodes (28): EconomyCrateDrop, EconomyCrateDropState, rarityName(), rarityRankClass(), BulkCrateOpeningSession, BulkOpeningRow, crateLootPresentation(), CrateOpeningAnimation() (+20 more)

### Community 40 - "loadout-editor.tsx"
Cohesion: 0.10
Nodes (27): categories, EditorCategory, fallbackIcon(), isSkinCategory(), LoadoutEditor(), changeCategory(), changeWeaponGroup(), resetAdvancedFields() (+19 more)

### Community 41 - "vip-membership-activation-saga.ts"
Cohesion: 0.09
Nodes (27): ActivationRequestPayload, ArenaCommandRow, ArenaGroupRow, ArenaMembershipRow, ArenaReceipt, ArenaReceiptRow, ArenaScopeRow, ArenaSubscriptionRow (+19 more)

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
Cohesion: 0.11
Nodes (23): getPageNumber(), metadata, rankingLink(), RankingPage(), RankingPageProps, classNames(), DataTable(), DataTableProps (+15 more)

### Community 46 - "staff-grant-item-controls.tsx"
Cohesion: 0.10
Nodes (23): BatchGrantResponse, CatalogueFilter, catalogueFilters, CatalogueSearchResponse, customItemTypes, featuredTypes, GrantLine, GrantMode (+15 more)

### Community 47 - "source-aware-vip-memberships.tsx"
Cohesion: 0.13
Nodes (23): consolidationChoices(), dateTimeFormatter, exactReferenceLabel(), ExtensionForm(), fallbackIdentity(), hasExactMutationReference(), MembershipRecord(), parsedTimestamp() (+15 more)

### Community 48 - "player-profile-page.tsx"
Cohesion: 0.13
Nodes (23): formatPlaytime(), avatarInitial(), countFormatter, formatCount(), Hitbox, hitboxes, hitIntensity(), HitMap() (+15 more)

### Community 49 - "market/page.tsx"
Cohesion: 0.13
Nodes (21): marketDiscountCategoryLabels, MarketPage(), MarketPageProps, metadata, positivePage(), adjustmentLabel(), endLabel(), MarketDiscountAnnouncement() (+13 more)

### Community 50 - "profile-themes.ts"
Cohesion: 0.14
Nodes (20): InventoryVisibility, OwnedTheme, ProfileSettingsForm(), ProfileSettingsFormProps, ProfileSettingsValue, SettingsResponse, ProfileThemeSurfaceBadge(), ProfileThemeSurfaceBadgeProps (+12 more)

### Community 51 - "getPortalDatabasePool"
Cohesion: 0.22
Nodes (23): getPortalDatabasePool(), activateVipMembershipItemWithSaga(), ActivationManualReviewError, asDate(), asInteger(), asRecord(), claimJob(), fail() (+15 more)

### Community 52 - "purge-legacy-state.mjs"
Cohesion: 0.16
Nodes (20): acquireLock(), arenaProtectedState(), args, captureDeleteTriggers(), checksum(), count(), dropDeleteTriggers(), portableTriggerSql() (+12 more)

### Community 53 - "reset-player-economy-state.mjs"
Cohesion: 0.11
Nodes (16): args, captureDeleteTriggers(), checksum(), count(), portableTriggerSql(), protectedTables, quoteIdentifier(), report (+8 more)

### Community 54 - "groups/page.tsx"
Cohesion: 0.16
Nodes (20): errorMessages, formatSyncedAt(), GroupAdminTab, groupAdminTabs, GroupCard(), GroupsPage(), GroupsPageProps, groupType() (+12 more)

### Community 55 - "marketplace-item-preview.tsx"
Cohesion: 0.14
Nodes (18): economyItems(), fallbackIcon(), imageCandidates(), MarketplaceItemPreview(), MarketplaceItemPreviewProps, marketPreviewUrl(), previewImageUrlsFromResponse(), PreviewState (+10 more)

### Community 56 - "progressive-form-runtime.tsx"
Cohesion: 0.15
Nodes (22): appendQuery(), AUTH_ENTRY_PATHS, dispatchFormEvent(), NATIVE_FORM_VALUES, ProgressiveFormRuntime(), handleSubmit(), navigate(), onSubmit() (+14 more)

### Community 57 - "vip-membership-conversion.ts"
Cohesion: 0.19
Nodes (20): assertValidVipTierRate(), compareVipEntitlementPrecedence(), compareVipTierRates(), convertTimedVipMembership(), convertVipDurationBetweenTierRates(), isEligibleVipTierRateListingCandidate(), isValidVipTierRate(), requireIncreasingTierRate() (+12 more)

### Community 58 - "items/page.tsx"
Cohesion: 0.16
Nodes (20): AdminItemsPage(), AdminItemsPageProps, catalogueArtworkUrl(), cleanLookup(), errorText(), formatDate(), formatDropChance(), formatPrice() (+12 more)

### Community 59 - "groups-controls.tsx"
Cohesion: 0.13
Nodes (15): compareGroups(), GroupSort, GroupSortKey, groupTypeLabel(), groupTypeOrder, GroupWorkspace(), selectGroup(), GroupWorkspaceEntry (+7 more)

### Community 60 - "cs2-item-images.ts"
Cohesion: 0.18
Nodes (20): asNumber(), asRecord(), asRows(), asText(), buildImageSource(), CachedValue, cacheKey(), CatalogueImageSource (+12 more)

### Community 61 - "reconcileIdentityGroupRewards"
Cohesion: 0.18
Nodes (20): applyIdentityGroupMembershipRewards(), asRecord(), awardRewardsForGroup(), enqueueIdentityRewardRefresh(), getEffectiveGroupRows(), identitySteamId(), loadAccountBoundRewardAwards(), reactivateAccountBoundRewardsForGroup() (+12 more)

### Community 62 - "price-refresh.ts"
Cohesion: 0.18
Nodes (15): GET(), isAuthorized(), maxDuration, runtime, register(), EconomyPublicPriceRefreshUpdate, pruneCompletedEconomyOperationReceipts(), withEconomyPublicPriceRefreshLock() (+7 more)

### Community 63 - "economyText"
Cohesion: 0.18
Nodes (19): createEconomyRedeemCode(), createStaffCustomCrate(), economyAmount(), economyArtworkUrl(), economyCatalogueSearchTerms(), economyMarketVariantPublicWear(), economyMarketVariantStorageWear(), economyRedeemCodeHash() (+11 more)

### Community 64 - "create-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (13): args, encodeRow(), encodeValue(), fileOutput, gzip, manifest, outputDir, outputFile (+5 more)

### Community 65 - "restore-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (12): args, file, manifest, mismatches, objects, relative, root, rowCounts (+4 more)

### Community 66 - "postEconomyAction"
Cohesion: 0.16
Nodes (13): createEconomyIdempotencyKey(), EconomyActionRequestError, EconomyActionResult, postEconomyAction(), bulkSellItems(), runAction(), RedeemCodeForm(), submit() (+5 more)

### Community 67 - "StaffGrantItemControls"
Cohesion: 0.15
Nodes (16): catalogueLine(), customLine(), isContainer(), isSkinLike(), matchesFilter(), newIdempotencyKey(), newLineKey(), parsedOptionalNumber() (+8 more)

### Community 68 - "navigation-progress.tsx"
Cohesion: 0.17
Nodes (15): interactiveSelector, StaffInventoryPlayerRow(), handleClick(), navigate(), StaffInventoryPlayerRowProps, ProfileTab, ProfileTabs(), activateTab() (+7 more)

### Community 69 - "skinport-prices.ts"
Cohesion: 0.22
Nodes (17): euroCents(), fetchSkinportRows(), fetchSnapshot(), getSkinportHistoricalPrices(), getSnapshot(), HistoricalPeriod, historicalPeriods, listingPriceFields (+9 more)

### Community 70 - "discount-rule-admin.tsx"
Cohesion: 0.18
Nodes (16): CatalogueSearchResponse, DiscountCatalogueOption, DiscountRuleAdmin(), searchCatalogue(), submitSearch(), DiscountRuleAdminProps, itemTypes, percentageValue() (+8 more)

### Community 71 - "identityError"
Cohesion: 0.32
Nodes (16): archiveIdentityGroup(), assignIdentityGroup(), exactArenaMembershipReference(), extendIdentityGroupMembership(), identityError(), IdentityGroupError, lockArenaCustomMembership(), lockArenaGlobalGroupTarget() (+8 more)

### Community 72 - "market-preview.ts"
Cohesion: 0.17
Nodes (15): LoadoutAgent, LoadoutCatalogue, LoadoutCategory, LoadoutItem, LoadoutPaintkit, CachedPreview, fetchMarketImage(), findItem() (+7 more)

### Community 73 - "redeem-code-admin.tsx"
Cohesion: 0.17
Nodes (11): adminAction(), newIdempotencyKey(), RedeemCodeAdmin(), createCode(), toggleCode(), RedeemCodeAdminProps, SelectedReward, UseMode (+3 more)

### Community 74 - "database-pools.ts"
Cohesion: 0.21
Nodes (11): ArenaDatabasePoolRegistry, connectionLimit(), getPool(), globalWithArenaPools, installMysqlUtcSessionInitializer(), MYSQL_UTC_CLIENT_TIMEZONE, MYSQL_UTC_SESSION_SQL, MysqlSessionConnection (+3 more)

### Community 75 - "loadout/route.ts"
Cohesion: 0.27
Nodes (13): advancedSkinPayload(), agentIndexes(), has(), integer(), jsonError(), LoadoutRequest, POST(), selectedTeams() (+5 more)

### Community 76 - "Inventory Crate Opening Integration Design"
Cohesion: 0.14
Nodes (13): Bulk-opening session, Chosen architecture, Component boundaries, Explicit non-goals, Goal, Inventory behavior, Inventory Crate Opening Integration Design, Normal item management (+5 more)

### Community 77 - "prepareIdentityGroupRename"
Cohesion: 0.22
Nodes (13): applyIdentityGroupRenameIntent(), assertIdentityGroupExternalKeyAvailable(), completeIdentityGroupRename(), identityGroupAliasLookupKey(), IdentityGroupRenameError, isFounderExternalKey(), lockExternalRenameAdapters(), preparedRename() (+5 more)

### Community 78 - "sellback.ts"
Cohesion: 0.22
Nodes (12): ECONOMY_SELLBACK_BASIS_POINTS, ECONOMY_SELLBACK_MINIMUM_TOKENS, ECONOMY_SELLBACK_PERCENT_LABEL, economySellbackPayoutTokens(), EconomySellbackResolution, economySellbackSaleMessage(), EconomySellbackSaleMessageInput, economySellbackUsesMinimum() (+4 more)

### Community 79 - "resolvePortalThemeSurface"
Cohesion: 0.27
Nodes (11): metadata, RootLayout(), GlobalThemeBackground(), GlobalThemeDocumentEffects(), ProfileThemeAvatarAdornment(), ProfileThemeBackground(), ProfileThemeDocumentEffects(), ThemeSlotProps (+3 more)

### Community 80 - "catalogue-search-field.tsx"
Cohesion: 0.18
Nodes (10): CatalogueSearchField(), CatalogueSearchFieldProps, CatalogueSearchItem, CatalogueSearchResponse, isRecord(), parseItems(), DEFAULT_SEARCH_DEBOUNCE_MS, SearchField() (+2 more)

### Community 81 - "Loadout Workspace Design"
Cohesion: 0.15
Nodes (12): 1. Choose a category, 2. Choose a weapon or team, 3. Choose an owned item, Accessibility, Data and component design, Error and empty states, Goal, Interaction model (+4 more)

### Community 82 - "applyArenaVipCommand"
Cohesion: 0.31
Nodes (12): applyArenaVipCommand(), ArenaCommandRejection, arenaResultHash(), asArenaBigInt(), asArenaInteger(), asArenaRecord(), optionalArenaPositiveInteger(), parseRateSnapshot() (+4 more)

### Community 83 - "Project Documentation"
Cohesion: 0.29
Nodes (7): Arena Group Authority Documentation, Discord Bot Plan, Portal Theme System, Website Plan, Beta Tester Theme SVG, Tap God Theme SVG, ARENA Portal README

### Community 84 - "adminScopes"
Cohesion: 0.30
Nodes (12): adminScopes(), assignmentRecords(), customScope(), findRegisteredServerScope(), globalArenaScope(), groupDefinition(), groupMatches(), registeredArenaScope() (+4 more)

### Community 85 - "chat-colors.ts"
Cohesion: 0.27
Nodes (8): TagColorFields(), ChatColor, chatColorPreview(), chatColors, normalizeChatColor(), supported, tokens, identityChatColor()

### Community 88 - "theme-document-effects.tsx"
Cohesion: 0.25
Nodes (8): CursorGridBackground(), EffectRegistration, registrations, setCursorGrid(), syncDocumentEffects(), ThemeDocumentEffects(), PORTAL_THEME_CHANGE_EVENT, PortalThemeDocumentEffects

### Community 89 - "group-listings/route.ts"
Cohesion: 0.36
Nodes (8): bool(), euroCents(), integer(), POST(), redirect(), value(), GroupListingActor, IdentityGroupListingError

### Community 90 - "market/preview/route.ts"
Cohesion: 0.40
Nodes (9): asCatalogueId(), asFloat(), GET(), metadataText(), officialImageUrl(), previewMarketNames(), uniqueImageUrls(), wearLabel() (+1 more)

### Community 92 - "market/purchase/route.ts"
Cohesion: 0.36
Nodes (8): isLegacySteamPrice(), metadataSeed(), optionalFloat(), optionalStattrak(), POST(), EconomyRepositoryError, isEconomyProfileTheme(), isEconomyVipMembership()

### Community 99 - "File structure"
Cohesion: 0.22
Nodes (8): File structure, Global Constraints, Inventory Crate Opening Integration Implementation Plan, Task 1: Pure crate-selection and multi-request planning policy, Task 2: Extract the Inventory opening controller and presentation, Task 3: Integrate single-container opening into item management, Task 4: Integrate up-to-50 bulk opening with lock and sale actions, Task 5: Remove the duplicate opener, finish responsive UI, and verify

### Community 100 - "equipProfileThemeItem"
Cohesion: 0.25
Nodes (9): isTrustedOwnedProfileThemeKey(), economyStorageRequired(), ensureEconomyRedeemSchema(), ensureEconomySteamAccount(), equipProfileThemeItem(), getPlayerSettings(), getPortalSession(), toOwnedProfileTheme() (+1 more)

### Community 101 - "not-found.tsx"
Cohesion: 0.32
Nodes (3): ErrorPageProps, EmptyState(), EmptyStateProps

### Community 102 - "staff-membership-inventory.ts"
Cohesion: 0.32
Nodes (7): emptySummary(), getStaffMembershipInventorySummaries(), MembershipInventoryRow, MembershipJobRow, missingTable(), StaffMembershipInventoryProduct, StaffMembershipInventorySummary

### Community 103 - "vip-activation-state.ts"
Cohesion: 0.36
Nodes (5): canonicalVipActivationJson(), VIP_ACTIVATION_TERMINAL_STATES, VipActivationJobState, vipActivationResumeAction, vipSuppressionRequiresReconciliation()

### Community 104 - "adaptive-player-hover-card.tsx"
Cohesion: 0.33
Nodes (6): AdaptivePlayerHoverCard(), AdaptivePlayerHoverCardProps, CardPosition, Placement, relatedTargetIsInside(), triggerSelector

### Community 105 - "primary-navigation.tsx"
Cohesion: 0.43
Nodes (4): primaryLinks, PrimaryNavigation(), PrimaryNavigationLinks(), isPrimaryNavigationLinkActive()

### Community 106 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Global Constraints, Guided Loadout Workspace Implementation Plan, Task 1: Add the pure owned-loadout selection model, Task 2: Rebuild the Loadout manager as a guided visual workflow, Task 3: Add the responsive image-led presentation and page copy, Task 4: Review, verify, and refresh architecture output

### Community 107 - "steam.ts"
Cohesion: 0.60
Nodes (4): GET(), createSteamLoginUrl(), getPortalOrigin(), verifySteamLogin()

### Community 108 - "loadout/preview/route.ts"
Cohesion: 0.60
Nodes (5): asInteger(), asWear(), GET(), previewResponse(), getLoadoutCatalogue()

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 990 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `crate-drop-preview.tsx` (2× useful, score=1.910384208)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getGameDatabasePool()` connect `staff-vip-memberships.ts` to `portal-repository.ts`, `staff-admin-memberships.ts`, `loadRuntimeDatabaseGroups`, `vip-perks.ts`, `identityError`, `getPlayerDashboard`, `access.ts`, `Arena Group Authority`, `database-pools.ts`, `identity-groups.ts`, `vip-membership-activation-saga.ts`, `identity-group-listings.ts`, `vip-tier-catalogue.ts`, `external-group-management.ts`, `applyArenaVipCommand`, `identity-catalogue.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `getSession` connect `getSession` to `staff-vip-memberships.ts`, `economy/route.ts`, `staff-management-page.tsx`, `access.ts`, `economyMutationFailure`, `listings/page.tsx`, `vip/page.tsx`, `groups/route.ts`, `site.ts`, `sell/route.ts`, `player-identities.ts`, `inventories/page.tsx`, `session.ts`, `tickets/route.ts`, `ranking/page.tsx`, `market/page.tsx`, `groups/page.tsx`, `items/page.tsx`, `loadout/route.ts`, `resolvePortalThemeSurface`, `group-listings/route.ts`, `market/preview/route.ts`, `loadout/preview/route.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `configuredArenaServerScopeLink()` connect `Arena Scope Resolution` to `Arena Group Authority`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope` to the rest of the system?**
  _859 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal-repository.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.009372601300852422 - nodes in this community are weakly interconnected._
- **Should `staff-vip-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05049580472921434 - nodes in this community are weakly interconnected._
- **Should `staff-admin-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07075624797143784 - nodes in this community are weakly interconnected._