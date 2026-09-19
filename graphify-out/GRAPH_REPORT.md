# Graph Report - arena-portal  (2026-09-19)

## Corpus Check
- 510 files · ~933,297 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4390 nodes · 11576 edges · 201 communities (162 shown, 36 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 76 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a10c2ca6`
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
- migrate-arena-group-authority.mjs
- getPlayerDashboard
- formActionRedirect
- arena-group-definition-authority.ts
- identity-groups.ts
- loadout-manager.tsx
- inventory-manager.tsx
- identity-group-listings.ts
- economyMutationFailure
- inventories/page.tsx
- external-group-management.ts
- listings/page.tsx
- scripts
- vip/page.tsx
- migrate-vip-scope.mjs
- site.ts
- identity-catalogue.ts
- assignments-workspace.tsx
- marketplace-browser.tsx
- player-search-field.tsx
- index.mjs
- player-identities.ts
- staff/route.ts
- staff-inventory-panel.tsx
- registry.ts
- trade-manager.tsx
- economy-view-model.ts
- profile-themes.ts
- loadRuntimeDatabaseGroups
- market-pricing.ts
- getSession
- inventory-crate-opening.tsx
- loadout-editor.tsx
- vip-membership-activation-saga.ts
- vip-tier-catalogue.ts
- external-market-prices.ts
- compilerOptions
- staff-inventory-player-row.tsx
- groups/route.ts
- source-aware-vip-memberships.tsx
- player-profile-page.tsx
- weapon-customizer.tsx
- progressive-form-runtime.tsx
- thumbnail-cache.ts
- purge-legacy-state.mjs
- reset-player-economy-state.mjs
- groups/page.tsx
- trade-activity.tsx
- weapon-thumbnail.ts
- access.ts
- app/tickets/page.tsx
- groups-controls.tsx
- cs2-item-images.ts
- source-aware-admin-memberships.tsx
- economyText
- purchaseEconomyItem
- create-logical-snapshot.mjs
- restore-logical-snapshot.mjs
- public-staff-directory.ts
- staff-grant-item-controls.tsx
- vip-perks/route.ts
- skinport-prices.ts
- items/page.tsx
- session.ts
- vip-membership-conversion.ts
- data/weapon-customization.test.ts
- arena-vip-authority-sync.ts
- loadout/route.ts
- Inventory Crate Opening Integration Design
- repository.ts
- DeployTests
- resolvePortalThemeSurface
- link-repository.ts
- Loadout Workspace Design
- adaptive-player-hover-card.tsx
- ARENA Portal README
- redeem-code-admin.tsx
- chat-colors.ts
- Consolidation Design Plans
- VIP Entitlement Contracts
- notifications/route.ts
- getIdentityAdminSnapshot
- database-pools.ts
- Portal Theme Authoring Guide
- marketplace-item-preview.tsx
- request-database-scope.test.mjs
- TAPPD Weapon Case Image
- Diamond VIP Badge
- Gold VIP Badge
- Silver VIP Badge
- Ultimate VIP Badge
- File structure
- ingest.ts
- thumbnail-client.test.ts
- discord-bot/package.json
- thumbnail-renderer.ts
- thumbnail-session.test.ts
- appeals.test.ts
- Global Constraints
- weapon-customization.ts
- link-service.ts
- live-server-panel.tsx
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
- staff-showcase.tsx
- arena-scope-resolution.d.mts
- next.config.ts
- next-env.d.ts
- TransportTests
- sell/route.ts
- thumbnail-client.ts
- identityError
- dependencies
- Public and player page UI review
- modes/page.tsx
- protocol.ts
- DeploymentTests
- bot-service.ts
- warm-weapon-thumbnails.mjs
- portalRedirectUrl
- ConfirmSubmitButton
- profile-theme-entitlements.test.ts
- group-listings/route.ts
- devDependencies
- theme-runtime-assets.tsx
- cs2-catalogue-quarantine-policy.mjs
- LoadoutEditor
- updatePlayerSettings
- createThumbnailCache
- thumbnail-renderer.test.ts
- client-polling.test.ts
- package.json
- rejection
- redeem-code-management.test.mjs
- repository.test.ts
- Live server status setup
- cs2-finish-validity.test.ts
- generate-brand-icons.mjs
- Staff UI and interaction polish
- Browser-generated weapon thumbnails
- discord-link/page.tsx
- getAdminAccess
- activate.sh
- start-hosting.sh
- vip-activation-state.ts
- CS2 catalogue, custom finishes and drop rewards
- VIP and staff theme progression
- UI/UX review and improvements
- Q: Why can a selected theme reset while it remains in inventory?
- provider-cache.test.ts
- PackageTests
- deploy.sh
- health/route.ts
- build-hosting.mjs
- smoke.sh
- prepare-opennext-windows.mjs
- sync-cs2-finishes.mjs
- vip-scope-consolidation-cli.test.mjs
- server-link-deployment-20260905.md
- 2026-09-06-browser-weapon-thumbnails.md
- 2026-09-06-item-grid-layout.md
- package.sh
- sync-weapon-models.mjs
- staff-membership-inventory.ts
- bot-routes.test.ts
- market/purchase/route.ts
- brand-emblem.tsx
- notification-repository.ts
- discord-bot/hosting/activate.sh
- identity-catalogue-lock.ts
- account-nav.tsx
- redeem-code-management.md
- public-staff-directory.test.mjs
- case-notifications.test.ts
- link-routes.test.ts
- check.mjs
- 2026-09-12-discord-bridge.md
- SearchNavigationForm
- profile-dependencies.test.ts
- appeals/route.test.ts
- discord-bot/hosting/start-hosting.sh
- discord-bot/hosting/package.sh

## God Nodes (most connected - your core abstractions)
1. `economyError()` - 117 edges
2. `getSession` - 102 edges
3. `economyNumber()` - 61 edges
4. `getPortalPool()` - 59 edges
5. `economySteamId()` - 52 edges
6. `runEconomyMutation()` - 52 edges
7. `scripts` - 47 edges
8. `POST()` - 46 edges
9. `getGameDatabasePool()` - 44 edges
10. `economyText()` - 43 edges

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
  components/economy/discount-rule-admin.tsx → lib/server-link/repository.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **VIP and Identity Management** — docs_vip_perks, db_arena_readme, readme [EXTRACTED 0.90]

## Communities (201 total, 36 thin omitted)

### Community 0 - "portal-repository.ts"
Cohesion: 0.01
Nodes (233): ActivateVipMembershipItemInput, ActivateVipMembershipItemResult, AddStaffCustomCrateLootEntryInput, AddStaffCustomCrateLootEntryResult, AdminAuthorization, AdminAuthorizationRow, AdminListRow, AppealEligibility (+225 more)

### Community 1 - "staff-vip-memberships.ts"
Cohesion: 0.11
Nodes (62): getGameDatabasePool(), activeNativeGroupNames(), ArenaVipScopeRow, ArenaVipSubscriptionMutationRow, ArenaVipSuppressionRow, ArenaVipTargetRow, asBoolean(), asDate() (+54 more)

### Community 2 - "staff-admin-memberships.ts"
Cohesion: 0.14
Nodes (47): adminMembershipError(), ArenaAdminDefinitionRow, arenaAuthorityMissing(), asBoolean(), asDate(), assignmentDurationMinutes(), assignStaffAdminMembership(), detachNativeAdminGroup() (+39 more)

### Community 3 - "economy/route.ts"
Cohesion: 0.09
Nodes (55): actionIdempotencyKey(), artworkContentTypes, catalogueMarketVersion(), crateActionErrorKey(), discountExclusions(), discountPercentageBps(), discountUtcDate(), ensureActorCanTarget() (+47 more)

### Community 4 - "economyError"
Cohesion: 0.12
Nodes (74): applyTokenDelta(), attachEconomyCharm(), attachEconomySticker(), attachEconomyStickerRecord(), awardEconomyDrop(), cancelEconomyTrade(), clearEconomyLoadoutSlot(), clearEconomyLoadoutSlots() (+66 more)

### Community 5 - "staff-management-page.tsx"
Cohesion: 0.06
Nodes (46): AppealBanSource(), CaseMessages(), errorText(), getPageNumber(), getSanctionEvents(), isSteamId(), noticeText(), ProfileMention() (+38 more)

### Community 6 - "vip-perks.ts"
Cohesion: 0.11
Nodes (40): AdminAuditRow, ArenaCustomMembership, ArenaCustomMembershipRow, configuration(), EffectiveRow, EffectiveSource, EffectiveVipPerkPage, expiryMilliseconds() (+32 more)

### Community 7 - "economyNumber"
Cohesion: 0.06
Nodes (81): GET(), RouteContext, InventoryPage(), applyEconomyCatalogueDiscounts(), archiveEconomyRedeemCode(), economyBoolean(), EconomyCatalogueFilter, EconomyCataloguePage (+73 more)

### Community 8 - "migrate-arena-group-authority.mjs"
Cohesion: 0.08
Nodes (64): configuredArenaServerScopeLink(), acquireMigrationLock(), addDistinct(), applyArenaPlan(), applyPortalPlan(), asBoolean(), asIntegerString(), assertBridgeRow() (+56 more)

### Community 9 - "getPlayerDashboard"
Cohesion: 0.08
Nodes (54): fallbackVipGroups, vipGroupIdentity(), visibleVipGroups(), key(), normalizeVipGroup(), activeVipRows(), authoritativeVipCoreRowsForSteamId(), emptyHitboxStats() (+46 more)

### Community 10 - "formActionRedirect"
Cohesion: 0.17
Nodes (22): allowedImageTypes, getScreenshot(), parseCaseId(), POST(), redirect(), POST(), redirect(), validSteamId() (+14 more)

### Community 11 - "arena-group-definition-authority.ts"
Cohesion: 0.10
Nodes (58): actorValue(), AdminGroupRow, adminNativeRowId(), AdminServerRow, ArenaGroupDefinitionAuthorityError, ArenaGroupRow, ArenaGroupScopeRow, ArenaRuntimeAuthorityRenameHint (+50 more)

### Community 12 - "identity-groups.ts"
Cohesion: 0.06
Nodes (60): applyIdentityGroupMembershipRewards(), ArenaAuthorityMembership, ArenaAuthorityMembershipRow, ArenaAuthorityMembershipSnapshot, arenaGroupType(), ArenaIdentityGroupTargetRow, ArenaIdentityMembershipMutationRow, arenaIdentityStorageMissing() (+52 more)

### Community 13 - "loadout-manager.tsx"
Cohesion: 0.07
Nodes (45): EconomyLoadoutManager(), chooseTeamTarget(), chooseWeaponDefinition(), runAction(), EconomyLoadoutManagerProps, equippedTeamLabels(), fallbackSlotPreview(), LOADOUT_CATEGORIES (+37 more)

### Community 14 - "inventory-manager.tsx"
Cohesion: 0.07
Nodes (51): itemIsVipMembership(), itemSupportsLoadout(), useInventoryCrateOpening(), canBulkSellItem(), compareItems(), gridColumnCount(), inventoryItemToggleId(), InventoryManager() (+43 more)

### Community 15 - "identity-group-listings.ts"
Cohesion: 0.11
Nodes (45): ArenaCatalogueTarget, ArenaCatalogueTargetRow, arenaGroupType(), ArenaVipScopeRow, catalogueMetadata(), catalogueTargetSnapshot(), createIdentityGroupListing(), databaseUuid() (+37 more)

### Community 16 - "economyMutationFailure"
Cohesion: 0.22
Nodes (33): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+25 more)

### Community 17 - "inventories/page.tsx"
Cohesion: 0.08
Nodes (32): AdminInventoriesPage(), AdminInventoriesPageProps, feedback(), formatTokens(), inventoriesHref(), inventoryMutationAction(), inventoryStates, positivePage() (+24 more)

### Community 18 - "external-group-management.ts"
Cohesion: 0.13
Nodes (45): AdminAssignmentRow, AdminGroupRow, appliesToServer(), assertRuntimeCreateNameAvailable(), booleanValue(), cancelPreparedRename(), completeRenameAndRefreshPortal(), createRuntimeAdminsCoreGroup() (+37 more)

### Community 19 - "listings/page.tsx"
Cohesion: 0.07
Nodes (42): durationLabel(), errors, euroInput(), GroupListingsPage(), ListingForm(), notices, positiveInteger(), selectedView() (+34 more)

### Community 20 - "scripts"
Cohesion: 0.04
Nodes (47): scripts, build, build:cloudflare, build:hosting, build:release, deploy:cloudflare, dev, discord:build (+39 more)

### Community 21 - "vip/page.tsx"
Cohesion: 0.08
Nodes (41): artworkForGroup(), conversionRate(), exactDuration(), getPageNumber(), liveConversionPreview(), liveVipRateScheduleIsValid(), loadMembershipListings(), matchesGroup() (+33 more)

### Community 22 - "migrate-vip-scope.mjs"
Cohesion: 0.09
Nodes (35): acquireNamedLock(), apply(), applyGamePlan(), applyPortalPlan(), buildPlan(), commerceMetadataPatchValues(), detachSourceSubscription(), dryRun() (+27 more)

### Community 23 - "site.ts"
Cohesion: 0.16
Nodes (15): HomePage(), metadata, robots(), sitemap(), BRAND_IMAGE, buildHomeMetadata(), buildHomeStructuredData(), buildPageMetadata() (+7 more)

### Community 24 - "identity-catalogue.ts"
Cohesion: 0.06
Nodes (55): AdminDatabaseAssignmentRow, AdminDatabaseGroupRow, applyIdentityGroupRenameIntent(), assertIdentityGroupExternalKeyAvailable(), builtinGamePermissions, cancelIdentityGroupRename(), CatalogueAliasRow, completeIdentityGroupRename() (+47 more)

### Community 25 - "assignments-workspace.tsx"
Cohesion: 0.07
Nodes (40): AdminAssignment, adminScopes(), Assignment, AssignmentRecordCard(), assignmentRecords(), AssignmentStatus, AssignmentsWorkspace(), AssignmentsWorkspaceProps (+32 more)

### Community 26 - "marketplace-browser.tsx"
Cohesion: 0.07
Nodes (62): defaultFloatForItem(), discountPercentLabel(), displayQuotedFloat(), floatInRange(), formatFloat(), isContainerItem(), isFloatSelectable(), isProfileThemeItem() (+54 more)

### Community 27 - "player-search-field.tsx"
Cohesion: 0.14
Nodes (21): isRecord(), isSteamId64(), noLocalPlayers, PLAYER_SEARCH_ENDPOINT, playerIdentity(), PlayerSearchField(), choosePlayer(), clearSelection() (+13 more)

### Community 28 - "index.mjs"
Cohesion: 0.11
Nodes (38): createAutomaticRoleSync(), fingerprint(), commandDefinitions, createCommandHandler(), registerCommands(), readConfig(), startHealthReporter(), logError() (+30 more)

### Community 29 - "player-identities.ts"
Cohesion: 0.08
Nodes (31): getPageNumber(), metadata, rankingLink(), RankingPage(), RankingPageProps, classNames(), DataTable(), DataTableProps (+23 more)

### Community 30 - "staff/route.ts"
Cohesion: 0.12
Nodes (27): adminMembershipReference(), adminMembershipSource(), arenaMembershipUuid(), assignmentDurationMinutes(), exactStoredAdminGroup(), exactStoredVipGroup(), fallbackVipGroups, optionalVipServerId() (+19 more)

### Community 31 - "staff-inventory-panel.tsx"
Cohesion: 0.06
Nodes (41): CatalogueSearchField(), CatalogueSearchFieldProps, CatalogueSearchItem, CatalogueSearchResponse, isRecord(), parseItems(), CatalogueSearchResponse, DiscountCatalogueOption (+33 more)

### Community 32 - "registry.ts"
Cohesion: 0.11
Nodes (20): betaTesterTheme, defaultTheme, rankThemeDescriptions, RankThemeKey, RankThemeOptions, rankThemes, portalThemes, ResolvedPortalThemeSurface (+12 more)

### Community 33 - "trade-manager.tsx"
Cohesion: 0.06
Nodes (40): createEconomyIdempotencyKey(), EconomyActionRequestError, postEconomyAction(), EconomyTradeItemView, itemIsTradable(), rarityName(), bulkSellItems(), runAction() (+32 more)

### Community 34 - "economy-view-model.ts"
Cohesion: 0.17
Nodes (30): asArray(), authoritativeCrateRarity(), economyCatalogueItems(), economyCrates(), EconomyCrateView, economyItems(), economyLoadout(), EconomyLoadoutView (+22 more)

### Community 35 - "profile-themes.ts"
Cohesion: 0.14
Nodes (20): InventoryVisibility, OwnedTheme, ProfileSettingsForm(), ProfileSettingsFormProps, ProfileSettingsValue, SettingsResponse, ProfileThemeSurfaceBadge(), ProfileThemeSurfaceBadgeProps (+12 more)

### Community 36 - "loadRuntimeDatabaseGroups"
Cohesion: 0.14
Nodes (30): addPermission(), adminsConfigCandidates(), appliesToConfiguredServer(), asObject(), boundedInteger(), cleanCapabilityKey(), cleanGroupName(), cleanPermissionKey() (+22 more)

### Community 37 - "market-pricing.ts"
Cohesion: 0.07
Nodes (56): catalogueIdFromSearch(), floatFromSearch(), GET(), legacySteamPrice(), seedFromSearch(), stattrakFromSearch(), EconomyInventoryFilter, EconomyInventoryItem (+48 more)

### Community 38 - "getSession"
Cohesion: 0.08
Nodes (41): RedeemCodeAdminPage(), RedeemCodeAdminPageProps, GET(), json(), noStore, DashboardPage(), DashboardPageProps, LoadoutPage() (+33 more)

### Community 39 - "inventory-crate-opening.tsx"
Cohesion: 0.10
Nodes (34): CrateDropPreview(), CrateDropPreviewReady(), DISPLAYED_RARITY_RANKS, EconomyCrateDrop, EconomyCrateDropState, economyCrateDropStateFromResponse(), normalizedText(), responseMessage() (+26 more)

### Community 40 - "loadout-editor.tsx"
Cohesion: 0.13
Nodes (16): categories, EditorCategory, fallbackIcon(), LoadoutEditorProps, MarketPreview(), MarketPreviewRequest, previewImageUrlsFromResponse(), previewUrl() (+8 more)

### Community 41 - "vip-membership-activation-saga.ts"
Cohesion: 0.10
Nodes (52): getPortalDatabasePool(), activateVipMembershipItemWithSaga(), ActivationManualReviewError, ActivationRequestPayload, applyArenaVipCommand(), ArenaCommandRow, ArenaGroupRow, ArenaMembershipRow (+44 more)

### Community 42 - "vip-tier-catalogue.ts"
Cohesion: 0.14
Nodes (27): boolean(), configuredVipServerId(), displayNumber(), fallbackTierSkeletons, finiteNumber(), formatUtilities(), GameVipGroupRow, genericDetail() (+19 more)

### Community 43 - "external-market-prices.ts"
Cohesion: 0.11
Nodes (31): CsfloatExactListingLookup, csfloatQuotes(), exactListingCache, exactListingCacheKey(), ExactListingCacheValue, exactListingRequests, exchangeRateFromPayload(), ExchangeRateSnapshot (+23 more)

### Community 44 - "compilerOptions"
Cohesion: 0.07
Nodes (29): dist, dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 45 - "staff-inventory-player-row.tsx"
Cohesion: 0.24
Nodes (10): interactiveSelector, StaffInventoryPlayerRow(), handleClick(), navigate(), StaffInventoryPlayerRowProps, announceNavigationStart(), currentThemeKey(), internalNavigation() (+2 more)

### Community 46 - "groups/route.ts"
Cohesion: 0.20
Nodes (41): bool(), number(), optionalNumber(), POST(), redirect(), returnTab(), text(), isIdentityGroupBadgeIconKey() (+33 more)

### Community 47 - "source-aware-vip-memberships.tsx"
Cohesion: 0.13
Nodes (23): consolidationChoices(), dateTimeFormatter, exactReferenceLabel(), ExtensionForm(), fallbackIdentity(), hasExactMutationReference(), MembershipRecord(), parsedTimestamp() (+15 more)

### Community 48 - "player-profile-page.tsx"
Cohesion: 0.10
Nodes (28): CopyState, CopyToClipboardButton(), handleCopy(), CopyToClipboardButtonProps, writeToClipboard(), formatPlaytime(), avatarInitial(), countFormatter (+20 more)

### Community 49 - "weapon-customizer.tsx"
Cohesion: 0.12
Nodes (21): itemSupportsCharm(), Props, WeaponCustomizerDialog(), Props, WeaponCustomizer(), WeaponCustomizerReady(), Props, WeaponInspectButton() (+13 more)

### Community 50 - "progressive-form-runtime.tsx"
Cohesion: 0.15
Nodes (21): appendQuery(), AUTH_ENTRY_PATHS, dispatchFormEvent(), NATIVE_FORM_VALUES, ProgressiveFormRuntime(), handleSubmit(), onSubmit(), settleAfterNavigation() (+13 more)

### Community 51 - "thumbnail-cache.ts"
Cohesion: 0.13
Nodes (16): Job, Options, QueuedJob, ThumbnailTicket, Dependencies, item, createInventoryThumbnailPrewarmer(), scan() (+8 more)

### Community 52 - "purge-legacy-state.mjs"
Cohesion: 0.16
Nodes (20): acquireLock(), arenaProtectedState(), args, captureDeleteTriggers(), checksum(), count(), dropDeleteTriggers(), portableTriggerSql() (+12 more)

### Community 53 - "reset-player-economy-state.mjs"
Cohesion: 0.11
Nodes (16): args, captureDeleteTriggers(), checksum(), count(), portableTriggerSql(), protectedTables, quoteIdentifier(), report (+8 more)

### Community 54 - "groups/page.tsx"
Cohesion: 0.11
Nodes (27): errorMessages, formatSyncedAt(), GroupAdminTab, groupAdminTabs, GroupCard(), GroupsPage(), GroupsPageProps, groupType() (+19 more)

### Community 55 - "trade-activity.tsx"
Cohesion: 0.10
Nodes (27): EconomyEmptyState(), EconomyItemCard(), EconomyItemCardProps, EconomyItemStatTrak(), EconomyItemView, EconomyTradeView, EconomyWalletView, formatTokens() (+19 more)

### Community 56 - "weapon-thumbnail.ts"
Cohesion: 0.18
Nodes (13): fixture(), item, requireSeparator(), nativeStickerPlacement(), viewerStickerPlacement(), weaponLegacyModel(), normalizeWeaponThumbnail(), number() (+5 more)

### Community 57 - "access.ts"
Cohesion: 0.11
Nodes (25): AdminRedirectPage(), LegacyAdminSearchParams, staffSection(), StaffModerationSection, staffModerationSections, StaffSection, StaffSubmenu(), StaffSubmenuAccess (+17 more)

### Community 58 - "app/tickets/page.tsx"
Cohesion: 0.09
Nodes (34): hasActiveBan(), parseCaseId(), POST(), redirect(), categories, isClosedTicket(), parseCaseId(), parseListingId() (+26 more)

### Community 59 - "groups-controls.tsx"
Cohesion: 0.13
Nodes (15): compareGroups(), GroupSort, GroupSortKey, groupTypeLabel(), groupTypeOrder, GroupWorkspace(), selectGroup(), GroupWorkspaceEntry (+7 more)

### Community 60 - "cs2-item-images.ts"
Cohesion: 0.05
Nodes (54): asCatalogueId(), asFloat(), catalogueArtworkUrl(), GET(), metadataText(), officialImageUrl(), previewMarketNames(), state (+46 more)

### Community 61 - "source-aware-admin-memberships.tsx"
Cohesion: 0.13
Nodes (21): ActionExplanation(), dateTimeFormatter, exactReferenceAvailable(), exactReferenceLabel(), fallbackIdentity(), isFounderGroup(), MembershipRecord(), parsedTimestamp() (+13 more)

### Community 62 - "economyText"
Cohesion: 0.09
Nodes (36): GET(), isAuthorized(), maxDuration, runtime, register(), createEconomyRedeemCode(), createStaffCustomCrate(), economyAmount() (+28 more)

### Community 63 - "purchaseEconomyItem"
Cohesion: 0.12
Nodes (30): createEconomyInventoryItem(), economyCatalogueFloatRange(), economyCharmAttributes(), economyCustomItem(), economyDirectPurchasePrice(), economyFloat(), economyIsSkinLike(), economyItemSupportsNametag() (+22 more)

### Community 64 - "create-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (13): args, encodeRow(), encodeValue(), fileOutput, gzip, manifest, outputDir, outputFile (+5 more)

### Community 65 - "restore-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (12): args, file, manifest, mismatches, objects, relative, root, rowCounts (+4 more)

### Community 66 - "public-staff-directory.ts"
Cohesion: 0.17
Nodes (16): metadata, StaffPage(), ArenaGroupRow, DiscordLinkRow, getPublicStaffDirectory(), NativeGroupRow, readDefinitions(), readDiscordProfileUrls() (+8 more)

### Community 67 - "staff-grant-item-controls.tsx"
Cohesion: 0.05
Nodes (55): marketDiscountCategoryLabels, MarketPage(), MarketPageProps, metadata, positivePage(), adjustmentLabel(), endLabel(), MarketDiscountAnnouncement() (+47 more)

### Community 68 - "vip-perks/route.ts"
Cohesion: 0.18
Nodes (27): actionView(), bool(), number(), POST(), redirect(), value(), adminMutation(), category() (+19 more)

### Community 69 - "skinport-prices.ts"
Cohesion: 0.22
Nodes (16): euroCents(), fetchSkinportRows(), fetchSnapshot(), getSnapshot(), HistoricalPeriod, historicalPeriods, listingPriceFields, listingQuoteFromRow() (+8 more)

### Community 70 - "items/page.tsx"
Cohesion: 0.16
Nodes (20): AdminItemsPage(), AdminItemsPageProps, catalogueArtworkUrl(), cleanLookup(), errorText(), formatDate(), formatDropChance(), formatPrice() (+12 more)

### Community 71 - "session.ts"
Cohesion: 0.14
Nodes (24): POST(), GET(), json(), POST(), privateNoStore, publicSettings(), record(), COOKIE_NAME (+16 more)

### Community 72 - "vip-membership-conversion.ts"
Cohesion: 0.16
Nodes (21): getVipTierConversionRateListings(), assertValidVipTierRate(), convertTimedVipMembership(), convertVipDurationBetweenTierRates(), isEligibleVipTierRateListingCandidate(), isValidVipTierRate(), requireIncreasingTierRate(), requirePositive() (+13 more)

### Community 73 - "data/weapon-customization.test.ts"
Cohesion: 0.09
Nodes (18): charm, db, executor, moduleUrl(), placement, resolve(), row(), apply (+10 more)

### Community 74 - "arena-vip-authority-sync.ts"
Cohesion: 0.19
Nodes (21): authorityMissing(), booleanValue(), compareMembershipPrecedence(), dateValue(), deterministicUuid(), MappedRawVipRow, membershipIsActive(), MembershipRow (+13 more)

### Community 75 - "loadout/route.ts"
Cohesion: 0.29
Nodes (12): advancedSkinPayload(), agentIndexes(), has(), integer(), jsonError(), LoadoutRequest, POST(), selectedTeams() (+4 more)

### Community 76 - "Inventory Crate Opening Integration Design"
Cohesion: 0.14
Nodes (13): Bulk-opening session, Chosen architecture, Component boundaries, Explicit non-goals, Goal, Inventory behavior, Inventory Crate Opening Integration Design, Normal item management (+5 more)

### Community 77 - "repository.ts"
Cohesion: 0.13
Nodes (23): RosterPlayer, acquireConnection(), createServerLinkRepository(), databaseCode(), DatabaseTimeoutError, discardConnection(), epoch(), HeartbeatOrder (+15 more)

### Community 79 - "resolvePortalThemeSurface"
Cohesion: 0.12
Nodes (22): metadata, RootLayout(), CursorGridBackground(), GlobalThemeBackground(), GlobalThemeDocumentEffects(), ProfileThemeAvatarAdornment(), ProfileThemeBackground(), ProfileThemeDocumentEffects() (+14 more)

### Community 80 - "link-repository.ts"
Cohesion: 0.17
Nodes (10): alreadyLinked(), CodeRow, createDiscordLinkRepository(), DiscordLinkError, DiscordLinkErrorCode, hashDiscordLinkCode(), LinkRow, normalizeDiscordLinkCode() (+2 more)

### Community 81 - "Loadout Workspace Design"
Cohesion: 0.15
Nodes (12): 1. Choose a category, 2. Choose a weapon or team, 3. Choose an owned item, Accessibility, Data and component design, Error and empty states, Goal, Interaction model (+4 more)

### Community 82 - "adaptive-player-hover-card.tsx"
Cohesion: 0.33
Nodes (6): AdaptivePlayerHoverCard(), AdaptivePlayerHoverCardProps, CardPosition, Placement, relatedTargetIsInside(), triggerSelector

### Community 83 - "ARENA Portal README"
Cohesion: 0.05
Nodes (39): Preserve the repair on future code deployments, Worker database request isolation, Arena Group Authority Documentation, ARENA Discord bot, Automatic deployment on FreakHosting, HTTP contract, Linking and roles, Setup (+31 more)

### Community 84 - "redeem-code-admin.tsx"
Cohesion: 0.19
Nodes (13): adminAction(), newIdempotencyKey(), RedeemCodeAdmin(), addReward(), confirmCampaignAction(), createCode(), performAction(), toggleCode() (+5 more)

### Community 85 - "chat-colors.ts"
Cohesion: 0.27
Nodes (8): TagColorFields(), ChatColor, chatColorPreview(), chatColors, normalizeChatColor(), supported, tokens, identityChatColor()

### Community 88 - "notifications/route.ts"
Cohesion: 0.25
Nodes (14): POST(), runtime, POST(), runtime, GET(), runtime, authorizeDiscordBot(), botJson() (+6 more)

### Community 89 - "getIdentityAdminSnapshot"
Cohesion: 0.21
Nodes (17): ensureIdentityCatalogue(), getIdentityCatalogueStatus(), asBoolean(), asStringArray(), emptyGroup(), getEffectiveIdentityUnsafe(), getIdentityAdminAuthorizationDefinitions(), getIdentityAdminAuthorizationSnapshot() (+9 more)

### Community 90 - "database-pools.ts"
Cohesion: 0.19
Nodes (11): ArenaDatabasePoolRegistry, connectionLimit(), getPool(), globalWithArenaPools, installMysqlUtcSessionInitializer(), MYSQL_UTC_CLIENT_TIMEZONE, MYSQL_UTC_SESSION_SQL, MysqlSessionConnection (+3 more)

### Community 92 - "marketplace-item-preview.tsx"
Cohesion: 0.13
Nodes (20): PaginatedItemGrid(), useItemGridLayout(), CatalogueItemPreview(), fallbackIcon(), imageCandidates(), MarketplaceItemPreview(), MarketplaceItemPreviewProps, marketPreviewUrl() (+12 more)

### Community 99 - "File structure"
Cohesion: 0.22
Nodes (8): File structure, Global Constraints, Inventory Crate Opening Integration Implementation Plan, Task 1: Pure crate-selection and multi-request planning policy, Task 2: Extract the Inventory opening controller and presentation, Task 3: Integrate single-container opening into item management, Task 4: Integrate up-to-50 bulk opening with lock and sale actions, Task 5: Remove the duplicate opener, finish responsive UI, and verify

### Community 100 - "ingest.ts"
Cohesion: 0.13
Nodes (14): dynamic, POST(), bearerMatches(), BodyReadError, digest(), handleHeartbeat(), HeartbeatDependencies, json() (+6 more)

### Community 101 - "thumbnail-client.test.ts"
Cohesion: 0.17
Nodes (20): createWeaponThumbnailClient(), cancelRequest(), cancelUnusedRequest(), clearTimer(), dispose(), invalidateWeaponThumbnail(), notify(), poll() (+12 more)

### Community 102 - "discord-bot/package.json"
Cohesion: 0.13
Nodes (14): dependencies, discord.js, engines, node, name, private, scripts, build (+6 more)

### Community 103 - "thumbnail-renderer.ts"
Cohesion: 0.17
Nodes (13): thumbnailBrowserOptions(), ThumbnailEnvironment, thumbnailPersistentBrowserOptions(), thumbnailAssetCacheDirectory(), ThumbnailEnvironment, thumbnailImageCacheDirectory(), thumbnailModelProfileDirectory(), createWeaponThumbnailRenderer() (+5 more)

### Community 104 - "thumbnail-session.test.ts"
Cohesion: 0.12
Nodes (15): db, hash, imageKey, state, stubs, GET(), runtime, POST() (+7 more)

### Community 105 - "appeals.test.ts"
Cohesion: 0.18
Nodes (11): accountLocks, databasePath, db, directory, input, moduleUrl(), pool, query() (+3 more)

### Community 106 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Global Constraints, Guided Loadout Workspace Implementation Plan, Task 1: Add the pure owned-loadout selection model, Task 2: Rebuild the Loadout manager as a guided visual workflow, Task 3: Add the responsive image-led presentation and page copy, Task 4: Review, verify, and refresh architecture output

### Community 107 - "weapon-customization.ts"
Cohesion: 0.31
Nodes (11): authorizeCharmPlacement(), authorizeStickerPlacement(), CharmPlacement, itemId(), number(), parseWeaponCustomization(), record(), reject() (+3 more)

### Community 108 - "link-service.ts"
Cohesion: 0.41
Nodes (9): POST(), POST(), discordLinkFailure(), discordLinkJson(), readDiscordLinkBody(), DiscordLinkRedemption, issueDiscordLinkCode(), redeemDiscordLinkCode() (+1 more)

### Community 109 - "live-server-panel.tsx"
Cohesion: 0.23
Nodes (17): GET(), fetchJson(), lastUpdate(), LiveServerPanel(), PlayerEnrichmentResponse, statusLabel(), browserPollingEnvironment(), createVisiblePoller() (+9 more)

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

### Community 120 - "staff-showcase.tsx"
Cohesion: 0.15
Nodes (10): groupDescription(), groupIcons, MemberCard(), StaffShowcase(), ResilientRemoteImage(), ResilientRemoteImageProps, proxiedImageUrl(), StaffDirectory (+2 more)

### Community 126 - "sell/route.ts"
Cohesion: 0.22
Nodes (7): state, stubs, isLegacySteamPrice(), metadataFloat(), POST(), cacheMarketplaceVariantQuote(), cacheMarketplaceVariantQuotes()

### Community 127 - "thumbnail-client.ts"
Cohesion: 0.14
Nodes (17): ExactWeaponThumbnail(), CacheStorage, client, createReadyCache(), read(), Entry, invalidateCachedWeaponThumbnail, invalidateWeaponThumbnail (+9 more)

### Community 128 - "identityError"
Cohesion: 0.32
Nodes (16): archiveIdentityGroup(), assignIdentityGroup(), exactArenaMembershipReference(), extendIdentityGroupMembership(), identityError(), IdentityGroupError, lockArenaCustomMembership(), lockArenaGlobalGroupTarget() (+8 more)

### Community 129 - "dependencies"
Cohesion: 0.11
Nodes (19): lucide-react, mysql2, next, dependencies, lucide-react, mysql2, next, playwright (+11 more)

### Community 130 - "Public and player page UI review"
Cohesion: 0.09
Nodes (18): Maintenance, Page coverage, Portal panel UI review, Shared changes, Verification, Player tools UI review, Shared principles, Validation (+10 more)

### Community 131 - "modes/page.tsx"
Cohesion: 0.27
Nodes (9): metadata, ModesPage(), ArenaMode, arenaModes, duelFlow, duelLengths, DuelType, duelTypes (+1 more)

### Community 132 - "protocol.ts"
Cohesion: 0.16
Nodes (17): GET(), boundedInteger(), boundedText(), Heartbeat, milliseconds(), PublicStatus, recordValue(), steamId() (+9 more)

### Community 134 - "bot-service.ts"
Cohesion: 0.25
Nodes (11): configuredGuildId(), discordNotificationRepository(), discordPortalPool(), getDiscordBotSnapshot(), saveDiscordGroupRole(), AuthoritySnapshot, DiscordGroup, ExternalMemberships (+3 more)

### Community 135 - "warm-weapon-thumbnails.mjs"
Cohesion: 0.19
Nodes (9): args, cache, options, renderer, seen, suppliedEnvironment, parseThumbnailWarmupOptions(), selectThumbnailModelRepresentatives() (+1 more)

### Community 136 - "portalRedirectUrl"
Cohesion: 0.46
Nodes (5): GET(), createSteamLoginUrl(), getPortalOrigin(), verifySteamLogin(), portalRedirectUrl()

### Community 137 - "ConfirmSubmitButton"
Cohesion: 0.17
Nodes (7): ConfirmSubmitButton(), ConfirmSubmitButtonProps, PendingDecision, DialogPhase, PortalDialog(), PortalDialogProps, PortalDialogTone

### Community 138 - "profile-theme-entitlements.test.ts"
Cohesion: 0.17
Nodes (7): db, executor, gold, moderator, resolve(), silver, sourceModuleUrl()

### Community 139 - "group-listings/route.ts"
Cohesion: 0.44
Nodes (8): bool(), euroCents(), integer(), POST(), redirect(), value(), verifyAdminActionToken(), GroupListingActor

### Community 140 - "devDependencies"
Cohesion: 0.15
Nodes (13): @opennextjs/cloudflare, devDependencies, @opennextjs/cloudflare, @types/node, @types/react, @types/react-dom, typescript, wrangler (+5 more)

### Community 141 - "theme-runtime-assets.tsx"
Cohesion: 0.13
Nodes (15): RankThemeBackground(), RankThemeGeometry(), RankThemeGeometryProps, ShadowProfileAura(), ShadowThemeBackground(), rainDrops, RainDropStyle, TapGodRainBackground() (+7 more)

### Community 142 - "cs2-catalogue-quarantine-policy.mjs"
Cohesion: 0.23
Nodes (9): definitions, isInvalidCatalogueFinish(), manifestRevision, materials, planCatalogueQuarantine(), actor, apply, args (+1 more)

### Community 143 - "LoadoutEditor"
Cohesion: 0.27
Nodes (11): isSkinCategory(), LoadoutEditor(), changeCategory(), changeWeaponGroup(), resetAdvancedFields(), submit(), numberValue(), savedSkinLabel() (+3 more)

### Community 144 - "updatePlayerSettings"
Cohesion: 0.27
Nodes (10): isTrustedOwnedProfileThemeKey(), economyStorageRequired(), getPlayerSettings(), getPortalSession(), toOwnedProfileTheme(), updatePlayerSettings(), getAuthorizedProfileThemeItemIds(), ProfileThemeEntitlementCandidate (+2 more)

### Community 145 - "createThumbnailCache"
Cohesion: 0.47
Nodes (9): createThumbnailCache(), exists(), nextBatch(), publish(), removeJob(), reserveDisk(), runJob(), runLane() (+1 more)

### Community 146 - "thumbnail-renderer.test.ts"
Cohesion: 0.22
Nodes (6): BrowserCallback, browserTransport, FixtureState, Frame, item, ViewerEvent

### Community 148 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, postcss, sharp, private, version

### Community 149 - "rejection"
Cohesion: 0.39
Nodes (8): ArenaCommandRejection, asArenaInteger(), asArenaRecord(), optionalArenaPositiveInteger(), parseRateSnapshot(), parseRequestPayload(), rejection(), secondsNumber()

### Community 150 - "redeem-code-management.test.mjs"
Cohesion: 0.39
Nodes (7): campaign(), claim(), key(), manage(), moduleUrl(), options, resolve()

### Community 152 - "Live server status setup"
Cohesion: 0.29
Nodes (6): Configuration and rollout order, Live server status setup, Live terminal stats (ServerLink 1.1.0), Observable behavior, Release checks, Rollback

### Community 153 - "cs2-finish-validity.test.ts"
Cohesion: 0.33
Nodes (5): activeDiscountRows, db, executor, moduleUrl(), resolve()

### Community 154 - "generate-brand-icons.mjs"
Cohesion: 0.29
Nodes (5): branding, header, monogram, sizes, source

### Community 155 - "Staff UI and interaction polish"
Cohesion: 0.33
Nodes (5): Outcome, Requirements, Review decisions, Staff UI and interaction polish, Tasks

### Community 156 - "Browser-generated weapon thumbnails"
Cohesion: 0.33
Nodes (5): Behavior, Browser-generated weapon thumbnails, Cache and isolation, Renderer, Validation and limits

### Community 157 - "discord-link/page.tsx"
Cohesion: 0.32
Nodes (5): DiscordLinkForm(), DiscordLinkPage(), metadata, DiscordLink, getDiscordLinkForSteam()

### Community 158 - "getAdminAccess"
Cohesion: 0.13
Nodes (19): catalogueId(), GET(), json(), noStore, GET(), idempotencyKey(), optionalInteger(), positiveInteger() (+11 more)

### Community 159 - "activate.sh"
Cohesion: 0.67
Nodes (5): app_pid(), healthy(), install_launcher(), point_to(), activate.sh script

### Community 160 - "start-hosting.sh"
Cohesion: 0.33
Nodes (5): ARENA_HOSTING_ROOT, HOSTNAME, NODE_ENV, PORT, start-hosting.sh script

### Community 161 - "vip-activation-state.ts"
Cohesion: 0.36
Nodes (5): canonicalVipActivationJson(), VIP_ACTIVATION_TERMINAL_STATES, VipActivationJobState, vipActivationResumeAction, vipSuppressionRequiresReconciliation()

### Community 162 - "CS2 catalogue, custom finishes and drop rewards"
Cohesion: 0.40
Nodes (4): CS2 catalogue, custom finishes and drop rewards, Read-only audit and reversible maintenance, Removing existing unpriced custom weapons, Verification

### Community 163 - "VIP and staff theme progression"
Cohesion: 0.40
Nodes (4): Design, Tasks, Verification and registration, VIP and staff theme progression

### Community 164 - "UI/UX review and improvements"
Cohesion: 0.40
Nodes (4): Changes, Maintenance, UI/UX review and improvements, Validation

### Community 165 - "Q: Why can a selected theme reset while it remains in inventory?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Why can a selected theme reset while it remains in inventory?, Source Nodes

### Community 168 - "deploy.sh"
Cohesion: 0.67
Nodes (3): LC_ALL, retry_transfer(), deploy.sh script

### Community 181 - "staff-membership-inventory.ts"
Cohesion: 0.32
Nodes (7): emptySummary(), getStaffMembershipInventorySummaries(), MembershipInventoryRow, MembershipJobRow, missingTable(), StaffMembershipInventoryProduct, StaffMembershipInventorySummary

### Community 182 - "bot-routes.test.ts"
Cohesion: 0.29
Nodes (4): Handler, resolve(), source(), state

### Community 183 - "market/purchase/route.ts"
Cohesion: 0.29
Nodes (10): isLegacySteamPrice(), optionalFloat(), optionalSeed(), optionalStattrak(), POST(), economyMetadataExplicitlyFalse(), EconomyRepositoryError, isEconomyMarketplacePurchasable() (+2 more)

### Community 184 - "brand-emblem.tsx"
Cohesion: 0.33
Nodes (4): ErrorPageProps, BrandEmblem(), BrandEmblemProps, SiteBrand()

### Community 185 - "notification-repository.ts"
Cohesion: 0.36
Nodes (6): createNotificationRepository(), enqueueDiscordNotification(), NotificationInput, NotificationRow, NotificationSettlement, fixture()

### Community 186 - "discord-bot/hosting/activate.sh"
Cohesion: 0.57
Nodes (6): app_pid(), healthy(), install_launcher(), point_to(), activate.sh script, stop_bot()

### Community 187 - "identity-catalogue-lock.ts"
Cohesion: 0.40
Nodes (4): acquireIdentityCatalogueMutationLock(), CatalogueLockRow, identityCatalogueMutationLockName, releaseIdentityCatalogueMutationLock()

### Community 188 - "account-nav.tsx"
Cohesion: 0.16
Nodes (13): accountLinks, AccountNav(), AccountNavProps, primaryLinks, PrimaryNavigation(), PrimaryNavigationLinks(), isPrimaryNavigationLinkActive(), ProfileTab (+5 more)

### Community 190 - "public-staff-directory.test.mjs"
Cohesion: 0.29
Nodes (3): db, portalDb, portalPool

### Community 191 - "case-notifications.test.ts"
Cohesion: 0.33
Nodes (5): db, executor, input, moduleUrl(), resolve()

### Community 192 - "link-routes.test.ts"
Cohesion: 0.40
Nodes (3): resolve(), source(), state

### Community 195 - "SearchNavigationForm"
Cohesion: 0.60
Nodes (6): SearchNavigationForm(), change(), input(), navigate(), schedule(), submit()

### Community 198 - "profile-dependencies.test.ts"
Cohesion: 0.40
Nodes (4): ProfileDependencyTestGlobal, projectRoot, resolve(), sourceModuleUrl()

### Community 199 - "appeals/route.test.ts"
Cohesion: 0.50
Nodes (3): moduleUrl(), resolve(), state

### Community 200 - "discord-bot/hosting/start-hosting.sh"
Cohesion: 0.50
Nodes (3): ARENA_BOT_HEALTH_DIR, NODE_ENV, start-hosting.sh script

## Knowledge Gaps
- **1192 isolated node(s):** `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope`, `AssignmentsWorkspaceProps`, `AssignmentStatus` (+1187 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1469 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `crate-drop-preview.tsx` (2× useful, score=1.859369071) _(code changed — re-verify)_

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSession` connect `getSession` to `economy/route.ts`, `modes/page.tsx`, `staff-management-page.tsx`, `economyNumber`, `formActionRedirect`, `group-listings/route.ts`, `economyMutationFailure`, `inventories/page.tsx`, `listings/page.tsx`, `vip/page.tsx`, `site.ts`, `discord-link/page.tsx`, `staff/route.ts`, `getAdminAccess`, `player-identities.ts`, `market-pricing.ts`, `groups/route.ts`, `groups/page.tsx`, `app/tickets/page.tsx`, `cs2-item-images.ts`, `public-staff-directory.ts`, `staff-grant-item-controls.tsx`, `vip-perks/route.ts`, `items/page.tsx`, `session.ts`, `loadout/route.ts`, `resolvePortalThemeSurface`, `link-service.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `getGameDatabasePool()` connect `staff-vip-memberships.ts` to `identityError`, `portal-repository.ts`, `public-staff-directory.ts`, `staff-admin-memberships.ts`, `loadRuntimeDatabaseGroups`, `vip-perks/route.ts`, `vip-perks.ts`, `getPlayerDashboard`, `vip-membership-activation-saga.ts`, `arena-group-definition-authority.ts`, `identity-groups.ts`, `vip-tier-catalogue.ts`, `identity-group-listings.ts`, `external-group-management.ts`, `groups/page.tsx`, `identity-catalogue.ts`, `access.ts`, `database-pools.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `getPortalDatabasePool()` connect `vip-membership-activation-saga.ts` to `portal-repository.ts`, `staff-vip-memberships.ts`, `public-staff-directory.ts`, `vip-perks.ts`, `economyNumber`, `thumbnail-session.test.ts`, `vip-membership-conversion.ts`, `vip-tier-catalogue.ts`, `bot-service.ts`, `identity-groups.ts`, `link-service.ts`, `identity-group-listings.ts`, `external-group-management.ts`, `thumbnail-cache.ts`, `staff-membership-inventory.ts`, `getIdentityAdminSnapshot`, `database-pools.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope` to the rest of the system?**
  _1192 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal-repository.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.00946406954990646 - nodes in this community are weakly interconnected._
- **Should `staff-vip-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1080389144905274 - nodes in this community are weakly interconnected._
- **Should `staff-admin-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1427304964539007 - nodes in this community are weakly interconnected._