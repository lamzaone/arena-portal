# Graph Report - arena-portal  (2026-09-12)

## Corpus Check
- 476 files · ~915,848 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4247 nodes · 11262 edges · 190 communities (153 shown, 35 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 75 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1576410a`
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
- economy-item-card.tsx
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
- redeem-code-admin.tsx
- registry.ts
- market/page.tsx
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
- navigation-progress.tsx
- groups/route.ts
- source-aware-vip-memberships.tsx
- player-profile-page.tsx
- postEconomyAction
- progressive-form-runtime.tsx
- thumbnail-cache.ts
- purge-legacy-state.mjs
- reset-player-economy-state.mjs
- groups/page.tsx
- trade-manager.tsx
- weapon-thumbnail.ts
- vip-membership-conversion.ts
- identity-group-badge.tsx
- groups-controls.tsx
- cs2-item-images.ts
- source-aware-admin-memberships.tsx
- price-refresh.ts
- purchaseEconomyItem
- create-logical-snapshot.mjs
- restore-logical-snapshot.mjs
- inventories/page.tsx
- staff-inventory-panel.tsx
- reconcileIdentityGroupRewards
- skinport-prices.ts
- items/page.tsx
- thumbnail-client.test.ts
- market-preview.ts
- data/weapon-customization.test.ts
- arena-vip-authority-sync.ts
- loadout/route.ts
- Inventory Crate Opening Integration Design
- repository.ts
- ingest.test.ts
- resolvePortalThemeSurface
- link-repository.ts
- Loadout Workspace Design
- adaptive-player-hover-card.tsx
- ARENA Portal README
- server-status.ts
- chat-colors.ts
- Consolidation Design Plans
- VIP Entitlement Contracts
- notifications/route.ts
- copy-to-clipboard-button.tsx
- market/preview/route.ts
- Portal Theme Authoring Guide
- item-grid.tsx
- request-database-scope.test.mjs
- TAPPD Weapon Case Image
- Diamond VIP Badge
- Gold VIP Badge
- Silver VIP Badge
- Ultimate VIP Badge
- File structure
- ingest.ts
- createWeaponThumbnailClient
- discord-bot/package.json
- thumbnail-renderer.ts
- thumbnail-session.test.ts
- thumbnail-cache.test.ts
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
- access.ts
- arena-scope-resolution.d.mts
- next.config.ts
- next-env.d.ts
- TransportTests
- sell/route.ts
- thumbnail-client.ts
- identityError
- dependencies
- Public and player page UI review
- getEconomyMarketVariantPrices
- protocol.ts
- DeploymentTests
- bot-service.ts
- warm-weapon-thumbnails.mjs
- ConfirmSubmitButton
- profile-theme-entitlements.test.ts
- devDependencies
- theme-runtime-assets.tsx
- cs2-catalogue-quarantine-policy.mjs
- settings/route.ts
- updatePlayerSettings
- createThumbnailCache
- thumbnail-renderer.test.ts
- client-polling.test.ts
- package.json
- marketplace-item-preview.tsx
- vip-activation-state.ts
- repository.test.ts
- Live server status setup
- cs2-finish-validity.test.ts
- generate-brand-icons.mjs
- Staff UI and interaction polish
- Browser-generated weapon thumbnails
- market-pricing.test.ts
- getAdminAccess
- activate.sh
- start-hosting.sh
- preview/route.test.ts
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
- bot-routes.test.ts
- market/purchase/route.ts
- notification-repository.ts
- registry.test.ts
- loadout/preview/route.ts
- primary-navigation.tsx
- case-notifications.test.ts
- link-routes.test.ts
- check.mjs
- 2026-09-12-discord-bridge.md
- resilient-remote-image.tsx

## God Nodes (most connected - your core abstractions)
1. `economyError()` - 116 edges
2. `getSession` - 100 edges
3. `economyNumber()` - 60 edges
4. `getPortalPool()` - 59 edges
5. `economySteamId()` - 51 edges
6. `runEconomyMutation()` - 51 edges
7. `POST()` - 46 edges
8. `getGameDatabasePool()` - 44 edges
9. `economyText()` - 43 edges
10. `scripts` - 42 edges

## Surprising Connections (you probably didn't know these)
- `submit()` --indirect_call--> `category()`  [INFERRED]
  components/loadout-editor.tsx → lib/data/vip-perks.ts
- `Portal Theme System` --references--> `Beta Tester Theme SVG`  [INFERRED]
  docs/theme-system.md → public/images/economy/profile-themes/beta-tester.svg
- `Portal Theme System` --references--> `Tap God Theme SVG`  [INFERRED]
  docs/theme-system.md → public/images/economy/profile-themes/tap-god.svg
- `VIP Perk Entitlement Contract` --references--> `Standard VIP Badge`  [INFERRED]
  docs/vip-perks.md → public/images/economy/vip/standard.png
- `POST()` --indirect_call--> `getSessionIdentity()`  [INFERRED]
  app/api/economy/thumbnails/route.ts → lib/auth/session-identity.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **VIP and Identity Management** — docs_vip_perks, db_arena_readme, readme [EXTRACTED 0.90]

## Communities (190 total, 35 thin omitted)

### Community 0 - "portal-repository.ts"
Cohesion: 0.01
Nodes (230): ActivateVipMembershipItemInput, ActivateVipMembershipItemResult, AddStaffCustomCrateLootEntryInput, AddStaffCustomCrateLootEntryResult, AdminAuthorization, AdminAuthorizationRow, AdminListRow, AppealBan (+222 more)

### Community 1 - "staff-vip-memberships.ts"
Cohesion: 0.11
Nodes (61): activeNativeGroupNames(), ArenaVipScopeRow, ArenaVipSubscriptionMutationRow, ArenaVipSuppressionRow, ArenaVipTargetRow, asBoolean(), asDate(), configuredVipServerId() (+53 more)

### Community 2 - "staff-admin-memberships.ts"
Cohesion: 0.13
Nodes (48): adminMembershipError(), ArenaAdminDefinitionRow, arenaAuthorityMissing(), asBoolean(), asDate(), assignmentDurationMinutes(), assignStaffAdminMembership(), detachNativeAdminGroup() (+40 more)

### Community 3 - "economy/route.ts"
Cohesion: 0.09
Nodes (56): actionIdempotencyKey(), artworkContentTypes, catalogueMarketVersion(), crateActionErrorKey(), discountExclusions(), discountPercentageBps(), discountUtcDate(), ensureActorCanTarget() (+48 more)

### Community 4 - "economyError"
Cohesion: 0.12
Nodes (76): applyTokenDelta(), attachEconomyCharm(), attachEconomySticker(), attachEconomyStickerRecord(), awardEconomyDrop(), cancelEconomyTrade(), clearEconomyLoadoutSlot(), clearEconomyLoadoutSlots() (+68 more)

### Community 5 - "staff-management-page.tsx"
Cohesion: 0.05
Nodes (52): AppealBanSource(), CaseMessages(), errorText(), getPageNumber(), getSanctionEvents(), isSteamId(), noticeText(), ProfileMention() (+44 more)

### Community 6 - "vip-perks.ts"
Cohesion: 0.07
Nodes (72): actionView(), bool(), number(), POST(), redirect(), value(), VipPerkShop(), VipPerkShopProps (+64 more)

### Community 7 - "economyNumber"
Cohesion: 0.06
Nodes (83): applyEconomyCatalogueDiscounts(), createEconomyRedeemCode(), economyBoolean(), EconomyCatalogueFilter, EconomyCataloguePage, economyCatalogueSearchFilter(), economyCatalogueSearchTerms(), economyCount() (+75 more)

### Community 8 - "migrate-arena-group-authority.mjs"
Cohesion: 0.08
Nodes (64): configuredArenaServerScopeLink(), acquireMigrationLock(), addDistinct(), applyArenaPlan(), applyPortalPlan(), asBoolean(), asIntegerString(), assertBridgeRow() (+56 more)

### Community 9 - "getPlayerDashboard"
Cohesion: 0.09
Nodes (54): activeVipRows(), authoritativeVipCoreRowsForSteamId(), emptyHitboxStats(), getActiveNativeVipSuppressedSteamIds(), getAdminPool(), getAppealBans(), getAuthoritativeExternalIdentityMemberships(), getExternalIdentityGroupMembershipIndex() (+46 more)

### Community 10 - "formActionRedirect"
Cohesion: 0.07
Nodes (58): allowedImageTypes, getScreenshot(), parseCaseId(), POST(), redirect(), bool(), euroCents(), integer() (+50 more)

### Community 11 - "arena-group-definition-authority.ts"
Cohesion: 0.07
Nodes (69): actorValue(), AdminGroupRow, adminNativeRowId(), AdminServerRow, ArenaGroupDefinitionAuthorityError, ArenaGroupRow, ArenaGroupScopeRow, ArenaRuntimeAuthorityRenameHint (+61 more)

### Community 12 - "identity-groups.ts"
Cohesion: 0.06
Nodes (58): identityExternalBadgeLookupKey(), ensureIdentityCatalogue(), getIdentityCatalogueStatus(), ArenaAuthorityMembership, ArenaAuthorityMembershipRow, ArenaAuthorityMembershipSnapshot, arenaGroupType(), ArenaIdentityGroupTargetRow (+50 more)

### Community 13 - "loadout-manager.tsx"
Cohesion: 0.07
Nodes (47): EconomyLoadoutManager(), chooseTeamTarget(), chooseWeaponDefinition(), runAction(), EconomyLoadoutManagerProps, equippedTeamLabels(), fallbackSlotPreview(), LOADOUT_CATEGORIES (+39 more)

### Community 14 - "inventory-manager.tsx"
Cohesion: 0.06
Nodes (52): itemIsVipMembership(), itemSupportsLoadout(), canBulkSellItem(), compareItems(), gridColumnCount(), inventoryItemToggleId(), InventoryManager(), closeInventoryItem() (+44 more)

### Community 15 - "identity-group-listings.ts"
Cohesion: 0.10
Nodes (49): acquireIdentityCatalogueMutationLock(), CatalogueLockRow, identityCatalogueMutationLockName, releaseIdentityCatalogueMutationLock(), ArenaCatalogueTarget, ArenaCatalogueTargetRow, arenaGroupType(), ArenaVipScopeRow (+41 more)

### Community 16 - "economyMutationFailure"
Cohesion: 0.20
Nodes (35): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+27 more)

### Community 17 - "economy-item-card.tsx"
Cohesion: 0.11
Nodes (22): EconomyEmptyState(), EconomyItemCardProps, EconomyItemStatTrak(), EconomyItemView, EconomyWalletView, formatTokens(), adjustmentLabel(), endLabel() (+14 more)

### Community 18 - "external-group-management.ts"
Cohesion: 0.13
Nodes (45): AdminAssignmentRow, AdminGroupRow, appliesToServer(), assertRuntimeCreateNameAvailable(), booleanValue(), cancelPreparedRename(), completeRenameAndRefreshPortal(), createRuntimeAdminsCoreGroup() (+37 more)

### Community 19 - "listings/page.tsx"
Cohesion: 0.06
Nodes (42): durationLabel(), errors, euroInput(), GroupListingsPage(), ListingForm(), notices, positiveInteger(), selectedView() (+34 more)

### Community 20 - "scripts"
Cohesion: 0.05
Nodes (42): scripts, build, build:cloudflare, build:hosting, build:release, deploy:cloudflare, dev, discord:build (+34 more)

### Community 21 - "vip/page.tsx"
Cohesion: 0.11
Nodes (34): artworkForGroup(), conversionRate(), exactDuration(), getPageNumber(), liveConversionPreview(), liveVipRateScheduleIsValid(), loadMembershipListings(), matchesGroup() (+26 more)

### Community 22 - "migrate-vip-scope.mjs"
Cohesion: 0.09
Nodes (35): acquireNamedLock(), apply(), applyGamePlan(), applyPortalPlan(), buildPlan(), commerceMetadataPatchValues(), detachSourceSubscription(), dryRun() (+27 more)

### Community 23 - "site.ts"
Cohesion: 0.08
Nodes (28): ErrorPageProps, metadata, ModesPage(), HomePage(), metadata, robots(), sitemap(), BrandEmblem() (+20 more)

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
Cohesion: 0.17
Nodes (26): readConfig(), logError(), main(), handleLink(), buildNotification(), deliverNotifications(), resolveAdminRoles(), createPortalClient() (+18 more)

### Community 29 - "player-identities.ts"
Cohesion: 0.07
Nodes (42): GET(), json(), noStore, GET(), json(), pageNumber(), privateNoStore, RouteContext (+34 more)

### Community 30 - "staff/route.ts"
Cohesion: 0.11
Nodes (31): fallbackVipGroups, vipGroupIdentity(), visibleVipGroups(), adminMembershipReference(), adminMembershipSource(), arenaMembershipUuid(), assignmentDurationMinutes(), exactStoredAdminGroup() (+23 more)

### Community 31 - "redeem-code-admin.tsx"
Cohesion: 0.09
Nodes (19): DiscordLinkForm(), adminAction(), newIdempotencyKey(), RedeemCodeAdmin(), createCode(), toggleCode(), RedeemCodeAdminProps, SelectedReward (+11 more)

### Community 32 - "registry.ts"
Cohesion: 0.12
Nodes (19): betaTesterTheme, defaultTheme, RankThemeKey, RankThemeOptions, rankThemes, portalThemes, ResolvedPortalThemeSurface, tapGodTheme (+11 more)

### Community 33 - "market/page.tsx"
Cohesion: 0.17
Nodes (17): catalogueId(), GET(), json(), noStore, marketDiscountCategoryLabels, MarketPage(), MarketPageProps, metadata (+9 more)

### Community 34 - "economy-view-model.ts"
Cohesion: 0.18
Nodes (30): asArray(), authoritativeCrateRarity(), economyCatalogueItems(), economyCrates(), EconomyCrateView, economyItems(), economyLoadout(), EconomyLoadoutView (+22 more)

### Community 35 - "profile-themes.ts"
Cohesion: 0.13
Nodes (22): InventoryVisibility, OwnedTheme, ProfileSettingsForm(), ProfileSettingsFormProps, ProfileSettingsValue, SettingsResponse, ProfileThemeSurfaceBadge(), ProfileThemeSurfaceBadgeProps (+14 more)

### Community 36 - "loadRuntimeDatabaseGroups"
Cohesion: 0.14
Nodes (30): addPermission(), adminsConfigCandidates(), appliesToConfiguredServer(), asObject(), boundedInteger(), cleanCapabilityKey(), cleanGroupName(), cleanPermissionKey() (+22 more)

### Community 37 - "market-pricing.ts"
Cohesion: 0.12
Nodes (30): economyMarketplaceQuoteKey(), economyValidateResolvedMarketplaceQuote(), getExternalMarketPrices(), addCandidate(), adjustedMarketplaceEuroCents(), boundedFloat(), boundedSeed(), deriveMarketplacePriceIdentity() (+22 more)

### Community 38 - "getSession"
Cohesion: 0.08
Nodes (47): POST(), GET(), RouteContext, DashboardPage(), DashboardPageProps, DiscordLinkPage(), metadata, InventoryPage() (+39 more)

### Community 39 - "inventory-crate-opening.tsx"
Cohesion: 0.10
Nodes (38): CrateDropPreview(), CrateDropPreviewReady(), DISPLAYED_RARITY_RANKS, EconomyCrateDrop, EconomyCrateDropState, economyCrateDropStateFromResponse(), normalizedText(), responseMessage() (+30 more)

### Community 40 - "loadout-editor.tsx"
Cohesion: 0.10
Nodes (27): categories, EditorCategory, fallbackIcon(), isSkinCategory(), LoadoutEditor(), changeCategory(), changeWeaponGroup(), resetAdvancedFields() (+19 more)

### Community 41 - "vip-membership-activation-saga.ts"
Cohesion: 0.09
Nodes (61): getPortalDatabasePool(), activateVipMembershipItemWithSaga(), ActivationManualReviewError, ActivationRequestPayload, applyArenaVipCommand(), ArenaCommandRejection, ArenaCommandRow, ArenaGroupRow (+53 more)

### Community 42 - "vip-tier-catalogue.ts"
Cohesion: 0.14
Nodes (28): boolean(), configuredVipServerId(), displayNumber(), fallbackTierSkeletons, finiteNumber(), formatUtilities(), GameVipGroupRow, genericDetail() (+20 more)

### Community 43 - "external-market-prices.ts"
Cohesion: 0.11
Nodes (30): CsfloatExactListingLookup, csfloatQuotes(), exactListingCache, exactListingCacheKey(), ExactListingCacheValue, exactListingRequests, exchangeRateFromPayload(), ExchangeRateSnapshot (+22 more)

### Community 44 - "compilerOptions"
Cohesion: 0.07
Nodes (29): dist, dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 45 - "navigation-progress.tsx"
Cohesion: 0.16
Nodes (16): interactiveSelector, StaffInventoryPlayerRow(), handleClick(), navigate(), StaffInventoryPlayerRowProps, ProfileTab, ProfileTabs(), activateTab() (+8 more)

### Community 46 - "groups/route.ts"
Cohesion: 0.22
Nodes (38): bool(), number(), optionalNumber(), POST(), redirect(), returnTab(), text(), addIdentityGroupReward() (+30 more)

### Community 47 - "source-aware-vip-memberships.tsx"
Cohesion: 0.13
Nodes (23): consolidationChoices(), dateTimeFormatter, exactReferenceLabel(), ExtensionForm(), fallbackIdentity(), hasExactMutationReference(), MembershipRecord(), parsedTimestamp() (+15 more)

### Community 48 - "player-profile-page.tsx"
Cohesion: 0.13
Nodes (23): formatPlaytime(), avatarInitial(), countFormatter, formatCount(), Hitbox, hitboxes, hitIntensity(), HitMap() (+15 more)

### Community 49 - "postEconomyAction"
Cohesion: 0.11
Nodes (25): createEconomyIdempotencyKey(), EconomyActionRequestError, postEconomyAction(), itemSupportsCharm(), bulkSellItems(), runAction(), Props, WeaponCustomizerDialog() (+17 more)

### Community 50 - "progressive-form-runtime.tsx"
Cohesion: 0.15
Nodes (21): appendQuery(), AUTH_ENTRY_PATHS, dispatchFormEvent(), NATIVE_FORM_VALUES, ProgressiveFormRuntime(), handleSubmit(), onSubmit(), settleAfterNavigation() (+13 more)

### Community 51 - "thumbnail-cache.ts"
Cohesion: 0.17
Nodes (14): Job, Options, QueuedJob, ThumbnailTicket, createInventoryThumbnailPrewarmer(), scan(), Dependencies, ownedThumbnailPrewarmEnabled() (+6 more)

### Community 52 - "purge-legacy-state.mjs"
Cohesion: 0.16
Nodes (20): acquireLock(), arenaProtectedState(), args, captureDeleteTriggers(), checksum(), count(), dropDeleteTriggers(), portableTriggerSql() (+12 more)

### Community 53 - "reset-player-economy-state.mjs"
Cohesion: 0.11
Nodes (16): args, captureDeleteTriggers(), checksum(), count(), portableTriggerSql(), protectedTables, quoteIdentifier(), report (+8 more)

### Community 54 - "groups/page.tsx"
Cohesion: 0.10
Nodes (30): errorMessages, formatSyncedAt(), GroupAdminTab, groupAdminTabs, GroupCard(), GroupsPage(), GroupsPageProps, groupType() (+22 more)

### Community 55 - "trade-manager.tsx"
Cohesion: 0.10
Nodes (25): EconomyTradeItemView, EconomyTradeView, itemIsTradable(), integer(), isRecord(), nullableNumber(), parsePartnerInventory(), parsePartnerItem() (+17 more)

### Community 56 - "weapon-thumbnail.ts"
Cohesion: 0.18
Nodes (12): POST(), runtime, Dependencies, item, thumbnailStatusResponse(), normalizeWeaponThumbnail(), number(), record() (+4 more)

### Community 57 - "vip-membership-conversion.ts"
Cohesion: 0.16
Nodes (21): getVipTierConversionRateListings(), assertValidVipTierRate(), convertTimedVipMembership(), convertVipDurationBetweenTierRates(), isEligibleVipTierRateListingCandidate(), isValidVipTierRate(), requireIncreasingTierRate(), requirePositive() (+13 more)

### Community 58 - "identity-group-badge.tsx"
Cohesion: 0.14
Nodes (13): icons, IdentityGroupBadge(), identityGroupBadgeIconOptions, IdentityGroupBadgeList(), IdentityGroupBadgeListProps, IdentityGroupBadgeProps, IDENTITY_GROUP_BADGE_ICON_OPTIONS, IdentityGroupBadgeIconKey (+5 more)

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
Cohesion: 0.14
Nodes (26): createEconomyInventoryItem(), economyCatalogueFloatRange(), economyDirectPurchasePrice(), economyFloat(), economyIsSkinLike(), economyItemSupportsNametag(), economyItemSupportsStattrak(), economyMarketplaceFallbackMetadata() (+18 more)

### Community 64 - "create-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (13): args, encodeRow(), encodeValue(), fileOutput, gzip, manifest, outputDir, outputFile (+5 more)

### Community 65 - "restore-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (12): args, file, manifest, mismatches, objects, relative, root, rowCounts (+4 more)

### Community 66 - "inventories/page.tsx"
Cohesion: 0.10
Nodes (29): AdminInventoriesPage(), AdminInventoriesPageProps, feedback(), formatTokens(), inventoriesHref(), inventoryMutationAction(), inventoryStates, positivePage() (+21 more)

### Community 67 - "staff-inventory-panel.tsx"
Cohesion: 0.03
Nodes (85): CatalogueSearchField(), CatalogueSearchFieldProps, CatalogueSearchItem, CatalogueSearchResponse, isRecord(), parseItems(), CatalogueSearchResponse, DiscountCatalogueOption (+77 more)

### Community 68 - "reconcileIdentityGroupRewards"
Cohesion: 0.18
Nodes (20): applyIdentityGroupMembershipRewards(), asRecord(), awardRewardsForGroup(), enqueueIdentityRewardRefresh(), getEffectiveGroupRows(), identitySteamId(), loadAccountBoundRewardAwards(), reactivateAccountBoundRewardsForGroup() (+12 more)

### Community 69 - "skinport-prices.ts"
Cohesion: 0.22
Nodes (17): euroCents(), fetchSkinportRows(), fetchSnapshot(), getSkinportHistoricalPrices(), getSnapshot(), HistoricalPeriod, historicalPeriods, listingPriceFields (+9 more)

### Community 70 - "items/page.tsx"
Cohesion: 0.10
Nodes (31): AdminItemsPage(), AdminItemsPageProps, catalogueArtworkUrl(), cleanLookup(), errorText(), formatDate(), formatDropChance(), formatPrice() (+23 more)

### Community 71 - "thumbnail-client.test.ts"
Cohesion: 0.22
Nodes (8): advance(), CacheStorage, flush(), ready(), Request, setup(), src(), warm()

### Community 72 - "market-preview.ts"
Cohesion: 0.15
Nodes (16): LoadoutAgent, LoadoutCatalogue, LoadoutCategory, LoadoutItem, LoadoutPaintkit, CachedPreview, fetchMarketImage(), findItem() (+8 more)

### Community 73 - "data/weapon-customization.test.ts"
Cohesion: 0.09
Nodes (18): charm, db, executor, moduleUrl(), placement, resolve(), row(), apply (+10 more)

### Community 74 - "arena-vip-authority-sync.ts"
Cohesion: 0.19
Nodes (21): authorityMissing(), booleanValue(), compareMembershipPrecedence(), dateValue(), deterministicUuid(), MappedRawVipRow, membershipIsActive(), MembershipRow (+13 more)

### Community 75 - "loadout/route.ts"
Cohesion: 0.27
Nodes (13): advancedSkinPayload(), agentIndexes(), has(), integer(), jsonError(), LoadoutRequest, POST(), selectedTeams() (+5 more)

### Community 76 - "Inventory Crate Opening Integration Design"
Cohesion: 0.14
Nodes (13): Bulk-opening session, Chosen architecture, Component boundaries, Explicit non-goals, Goal, Inventory behavior, Inventory Crate Opening Integration Design, Normal item management (+5 more)

### Community 77 - "repository.ts"
Cohesion: 0.13
Nodes (23): RosterPlayer, acquireConnection(), createServerLinkRepository(), databaseCode(), DatabaseTimeoutError, discardConnection(), epoch(), HeartbeatOrder (+15 more)

### Community 79 - "resolvePortalThemeSurface"
Cohesion: 0.14
Nodes (18): metadata, RootLayout(), CursorGridBackground(), GlobalThemeBackground(), GlobalThemeDocumentEffects(), ProfileThemeAvatarAdornment(), ProfileThemeBackground(), ProfileThemeDocumentEffects() (+10 more)

### Community 80 - "link-repository.ts"
Cohesion: 0.16
Nodes (11): alreadyLinked(), CodeRow, createDiscordLinkRepository(), DiscordLinkError, DiscordLinkErrorCode, DiscordLinkRedemption, hashDiscordLinkCode(), LinkRow (+3 more)

### Community 81 - "Loadout Workspace Design"
Cohesion: 0.15
Nodes (12): 1. Choose a category, 2. Choose a weapon or team, 3. Choose an owned item, Accessibility, Data and component design, Error and empty states, Goal, Interaction model (+4 more)

### Community 82 - "adaptive-player-hover-card.tsx"
Cohesion: 0.33
Nodes (6): AdaptivePlayerHoverCard(), AdaptivePlayerHoverCardProps, CardPosition, Placement, relatedTargetIsInside(), triggerSelector

### Community 83 - "ARENA Portal README"
Cohesion: 0.05
Nodes (37): Preserve the repair on future code deployments, Worker database request isolation, Arena Group Authority Documentation, ARENA Discord bot, HTTP contract, Linking and roles, Setup, Staff alerts (+29 more)

### Community 84 - "server-status.ts"
Cohesion: 0.31
Nodes (8): GET(), milliseconds(), PublicStatus, toPublicStatus(), unknownPublicStatus(), getStoredHeartbeat(), getServerStatus(), ServerStatus

### Community 85 - "chat-colors.ts"
Cohesion: 0.27
Nodes (8): TagColorFields(), ChatColor, chatColorPreview(), chatColors, normalizeChatColor(), supported, tokens, identityChatColor()

### Community 88 - "notifications/route.ts"
Cohesion: 0.29
Nodes (12): POST(), runtime, POST(), runtime, GET(), runtime, authorizeDiscordBot(), botJson() (+4 more)

### Community 89 - "copy-to-clipboard-button.tsx"
Cohesion: 0.40
Nodes (5): CopyState, CopyToClipboardButton(), handleCopy(), CopyToClipboardButtonProps, writeToClipboard()

### Community 90 - "market/preview/route.ts"
Cohesion: 0.22
Nodes (14): asCatalogueId(), asFloat(), catalogueArtworkUrl(), GET(), metadataText(), officialImageUrl(), previewMarketNames(), uniqueImageUrls() (+6 more)

### Community 92 - "item-grid.tsx"
Cohesion: 0.11
Nodes (20): context, state, stubs, GET(), json(), pageNumber(), privateNoStore, RouteContext (+12 more)

### Community 99 - "File structure"
Cohesion: 0.22
Nodes (8): File structure, Global Constraints, Inventory Crate Opening Integration Implementation Plan, Task 1: Pure crate-selection and multi-request planning policy, Task 2: Extract the Inventory opening controller and presentation, Task 3: Integrate single-container opening into item management, Task 4: Integrate up-to-50 bulk opening with lock and sale actions, Task 5: Remove the duplicate opener, finish responsive UI, and verify

### Community 100 - "ingest.ts"
Cohesion: 0.23
Nodes (12): dynamic, POST(), bearerMatches(), BodyReadError, digest(), handleHeartbeat(), HeartbeatDependencies, json() (+4 more)

### Community 101 - "createWeaponThumbnailClient"
Cohesion: 0.41
Nodes (12): createWeaponThumbnailClient(), cancelRequest(), cancelUnusedRequest(), clearTimer(), dispose(), invalidateWeaponThumbnail(), notify(), poll() (+4 more)

### Community 102 - "discord-bot/package.json"
Cohesion: 0.13
Nodes (14): dependencies, discord.js, engines, node, name, private, scripts, build (+6 more)

### Community 103 - "thumbnail-renderer.ts"
Cohesion: 0.17
Nodes (13): thumbnailBrowserOptions(), ThumbnailEnvironment, thumbnailPersistentBrowserOptions(), thumbnailAssetCacheDirectory(), ThumbnailEnvironment, thumbnailImageCacheDirectory(), thumbnailModelProfileDirectory(), createWeaponThumbnailRenderer() (+5 more)

### Community 104 - "thumbnail-session.test.ts"
Cohesion: 0.20
Nodes (5): db, hash, imageKey, state, stubs

### Community 105 - "thumbnail-cache.test.ts"
Cohesion: 0.40
Nodes (3): fixture(), item, requireSeparator()

### Community 106 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Global Constraints, Guided Loadout Workspace Implementation Plan, Task 1: Add the pure owned-loadout selection model, Task 2: Rebuild the Loadout manager as a guided visual workflow, Task 3: Add the responsive image-led presentation and page copy, Task 4: Review, verify, and refresh architecture output

### Community 107 - "weapon-customization.ts"
Cohesion: 0.31
Nodes (11): authorizeCharmPlacement(), authorizeStickerPlacement(), CharmPlacement, itemId(), number(), parseWeaponCustomization(), record(), reject() (+3 more)

### Community 108 - "link-service.ts"
Cohesion: 0.38
Nodes (10): POST(), POST(), verifyProfileActionToken(), discordLinkFailure(), discordLinkJson(), readDiscordLinkBody(), getDiscordLinkForSteam(), issueDiscordLinkCode() (+2 more)

### Community 109 - "live-server-panel.tsx"
Cohesion: 0.22
Nodes (18): GET(), fetchJson(), lastUpdate(), LiveServerPanel(), PlayerEnrichmentResponse, statusLabel(), getPlayerIdentityGroupBadges(), browserPollingEnvironment() (+10 more)

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

### Community 120 - "access.ts"
Cohesion: 0.06
Nodes (41): groupDescription(), groupIcons, MemberCard(), StaffShowcase(), AdminGroupConfig, currentGroups, getAdminAccessUncached(), getConfiguredGroups() (+33 more)

### Community 126 - "sell/route.ts"
Cohesion: 0.21
Nodes (21): isLegacySteamPrice(), metadataFloat(), POST(), catalogueIdFromSearch(), floatFromSearch(), GET(), legacySteamPrice(), seedFromSearch() (+13 more)

### Community 127 - "thumbnail-client.ts"
Cohesion: 0.14
Nodes (17): ExactWeaponThumbnail(), CacheStorage, client, createReadyCache(), read(), Entry, invalidateCachedWeaponThumbnail, invalidateWeaponThumbnail (+9 more)

### Community 128 - "identityError"
Cohesion: 0.28
Nodes (18): archiveIdentityGroup(), assignIdentityGroup(), exactArenaMembershipReference(), extendIdentityGroupMembership(), identityError(), identityExpiry(), IdentityGroupError, identityInteger() (+10 more)

### Community 129 - "dependencies"
Cohesion: 0.11
Nodes (19): lucide-react, mysql2, next, dependencies, lucide-react, mysql2, next, playwright (+11 more)

### Community 130 - "Public and player page UI review"
Cohesion: 0.09
Nodes (18): Maintenance, Page coverage, Portal panel UI review, Shared changes, Verification, Player tools UI review, Shared principles, Validation (+10 more)

### Community 131 - "getEconomyMarketVariantPrices"
Cohesion: 0.40
Nodes (6): economyMarketVariantPriceKey(), economyMarketVariantPublicWear(), economyMarketVariantStorageWear(), getEconomyMarketVariantPrice(), getEconomyMarketVariantPrices(), toEconomyMarketVariantPrice()

### Community 132 - "protocol.ts"
Cohesion: 0.27
Nodes (9): boundedInteger(), boundedText(), Heartbeat, recordValue(), steamId(), NOW, utcInstant(), uuid() (+1 more)

### Community 134 - "bot-service.ts"
Cohesion: 0.25
Nodes (11): configuredGuildId(), discordNotificationRepository(), discordPortalPool(), getDiscordBotSnapshot(), saveDiscordGroupRole(), AuthoritySnapshot, DiscordGroup, ExternalMemberships (+3 more)

### Community 135 - "warm-weapon-thumbnails.mjs"
Cohesion: 0.19
Nodes (9): args, cache, options, renderer, seen, suppliedEnvironment, parseThumbnailWarmupOptions(), selectThumbnailModelRepresentatives() (+1 more)

### Community 137 - "ConfirmSubmitButton"
Cohesion: 0.17
Nodes (7): ConfirmSubmitButton(), ConfirmSubmitButtonProps, PendingDecision, DialogPhase, PortalDialog(), PortalDialogProps, PortalDialogTone

### Community 138 - "profile-theme-entitlements.test.ts"
Cohesion: 0.13
Nodes (9): ProfileThemeEntitlementCandidate, ProfileThemeInventoryRow, db, executor, gold, moderator, resolve(), silver (+1 more)

### Community 140 - "devDependencies"
Cohesion: 0.15
Nodes (13): @opennextjs/cloudflare, devDependencies, @opennextjs/cloudflare, @types/node, @types/react, @types/react-dom, typescript, wrangler (+5 more)

### Community 141 - "theme-runtime-assets.tsx"
Cohesion: 0.20
Nodes (9): RankThemeBackground(), rainDrops, RainDropStyle, TapGodRainBackground(), ThemeBackground(), themeBackgrounds, ThemeIconProps, themeIcons (+1 more)

### Community 142 - "cs2-catalogue-quarantine-policy.mjs"
Cohesion: 0.23
Nodes (9): definitions, isInvalidCatalogueFinish(), manifestRevision, materials, planCatalogueQuarantine(), actor, apply, args (+1 more)

### Community 143 - "settings/route.ts"
Cohesion: 0.43
Nodes (6): json(), POST(), privateNoStore, publicSettings(), record(), PlayerSettings

### Community 144 - "updatePlayerSettings"
Cohesion: 0.53
Nodes (6): isTrustedOwnedProfileThemeKey(), economyStorageRequired(), getPlayerSettings(), getPortalSession(), updatePlayerSettings(), getAuthorizedProfileThemeItemIds()

### Community 145 - "createThumbnailCache"
Cohesion: 0.47
Nodes (9): createThumbnailCache(), exists(), nextBatch(), publish(), removeJob(), reserveDisk(), runJob(), runLane() (+1 more)

### Community 146 - "thumbnail-renderer.test.ts"
Cohesion: 0.22
Nodes (6): BrowserCallback, browserTransport, FixtureState, Frame, item, ViewerEvent

### Community 148 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, postcss, sharp, private, version

### Community 149 - "marketplace-item-preview.tsx"
Cohesion: 0.17
Nodes (16): CatalogueItemPreview(), fallbackIcon(), imageCandidates(), MarketplaceItemPreview(), MarketplaceItemPreviewProps, marketPreviewUrl(), previewImageUrlsFromResponse(), PreviewState (+8 more)

### Community 150 - "vip-activation-state.ts"
Cohesion: 0.38
Nodes (4): VIP_ACTIVATION_TERMINAL_STATES, VipActivationJobState, vipActivationResumeAction, vipSuppressionRequiresReconciliation()

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

### Community 157 - "market-pricing.test.ts"
Cohesion: 0.33
Nodes (4): exact, input, state, stubs

### Community 158 - "getAdminAccess"
Cohesion: 0.29
Nodes (11): GET(), idempotencyKey(), optionalInteger(), positiveInteger(), POST(), record(), stringField(), AttachmentRouteProps (+3 more)

### Community 159 - "activate.sh"
Cohesion: 0.67
Nodes (5): app_pid(), healthy(), install_launcher(), point_to(), activate.sh script

### Community 160 - "start-hosting.sh"
Cohesion: 0.33
Nodes (5): ARENA_HOSTING_ROOT, HOSTNAME, NODE_ENV, PORT, start-hosting.sh script

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

### Community 182 - "bot-routes.test.ts"
Cohesion: 0.29
Nodes (4): Handler, resolve(), source(), state

### Community 183 - "market/purchase/route.ts"
Cohesion: 0.17
Nodes (10): state, stubs, isLegacySteamPrice(), optionalFloat(), optionalSeed(), optionalStattrak(), POST(), EconomyRepositoryError (+2 more)

### Community 185 - "notification-repository.ts"
Cohesion: 0.36
Nodes (6): createNotificationRepository(), enqueueDiscordNotification(), NotificationInput, NotificationRow, NotificationSettlement, fixture()

### Community 186 - "registry.test.ts"
Cohesion: 0.40
Nodes (3): allSurfaces, profileOnly, surfaces

### Community 187 - "loadout/preview/route.ts"
Cohesion: 0.52
Nodes (6): asInteger(), asWear(), GET(), previewResponse(), getLoadoutCatalogue(), getCs2CatalogueImage()

### Community 188 - "primary-navigation.tsx"
Cohesion: 0.43
Nodes (4): primaryLinks, PrimaryNavigation(), PrimaryNavigationLinks(), isPrimaryNavigationLinkActive()

### Community 191 - "case-notifications.test.ts"
Cohesion: 0.40
Nodes (5): db, executor, input, moduleUrl(), resolve()

### Community 192 - "link-routes.test.ts"
Cohesion: 0.40
Nodes (3): resolve(), source(), state

### Community 197 - "resilient-remote-image.tsx"
Cohesion: 0.60
Nodes (3): ResilientRemoteImage(), ResilientRemoteImageProps, proxiedImageUrl()

## Knowledge Gaps
- **1163 isolated node(s):** `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope`, `AssignmentsWorkspaceProps`, `AssignmentStatus` (+1158 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1424 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `crate-drop-preview.tsx` (2× useful, score=1.859369071) _(code changed — re-verify)_

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSession` connect `getSession` to `economy/route.ts`, `staff-management-page.tsx`, `vip-perks.ts`, `formActionRedirect`, `settings/route.ts`, `economyMutationFailure`, `listings/page.tsx`, `vip/page.tsx`, `site.ts`, `player-identities.ts`, `staff/route.ts`, `getAdminAccess`, `market/page.tsx`, `groups/route.ts`, `groups/page.tsx`, `loadout/preview/route.ts`, `inventories/page.tsx`, `items/page.tsx`, `loadout/route.ts`, `resolvePortalThemeSurface`, `item-grid.tsx`, `link-service.ts`, `sell/route.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `getGameDatabasePool()` connect `access.ts` to `identityError`, `portal-repository.ts`, `staff-admin-memberships.ts`, `staff-vip-memberships.ts`, `loadRuntimeDatabaseGroups`, `vip-perks.ts`, `getPlayerDashboard`, `vip-membership-activation-saga.ts`, `arena-group-definition-authority.ts`, `identity-groups.ts`, `vip-tier-catalogue.ts`, `identity-group-listings.ts`, `external-group-management.ts`, `groups/page.tsx`, `identity-catalogue.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `getPortalDatabasePool()` connect `vip-membership-activation-saga.ts` to `portal-repository.ts`, `staff-vip-memberships.ts`, `vip-perks.ts`, `economyNumber`, `bot-service.ts`, `vip-tier-catalogue.ts`, `arena-group-definition-authority.ts`, `identity-groups.ts`, `link-service.ts`, `identity-group-listings.ts`, `external-group-management.ts`, `thumbnail-cache.ts`, `groups/page.tsx`, `access.ts`, `vip-membership-conversion.ts`, `market/preview/route.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope` to the rest of the system?**
  _1163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal-repository.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.00929243170622481 - nodes in this community are weakly interconnected._
- **Should `staff-vip-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10787942887361185 - nodes in this community are weakly interconnected._
- **Should `staff-admin-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13387755102040816 - nodes in this community are weakly interconnected._