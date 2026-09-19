# Graph Report - arena-portal  (2026-09-19)

## Corpus Check
- 508 files · ~932,780 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4388 nodes · 11575 edges · 205 communities (164 shown, 38 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 76 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dde470a9`
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
- staff-inventory-panel.tsx
- external-group-management.ts
- inventories/page.tsx
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
- postEconomyAction
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
- trade-manager.tsx
- weapon-thumbnail.ts
- extendStaffVipMembership
- tickets/route.ts
- groups-controls.tsx
- cs2-item-images.ts
- source-aware-admin-memberships.tsx
- price-refresh.ts
- cs2-finish-catalogue.ts
- create-logical-snapshot.mjs
- restore-logical-snapshot.mjs
- public-staff-directory.ts
- staff-grant-item-controls.tsx
- reconcileIdentityGroupRewards
- skinport-prices.ts
- items/page.tsx
- app/tickets/page.tsx
- market-preview.ts
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
- server-status.ts
- chat-colors.ts
- Consolidation Design Plans
- VIP Entitlement Contracts
- notifications/route.ts
- ranking/page.tsx
- market/preview/route.ts
- Portal Theme Authoring Guide
- discount-rule-admin.tsx
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
- sellback.ts
- protocol.ts
- DeploymentTests
- bot-service.ts
- warm-weapon-thumbnails.mjs
- callback/route.ts
- ConfirmSubmitButton
- profile-theme-entitlements.test.ts
- group-listings/route.ts
- devDependencies
- theme-runtime-assets.tsx
- cs2-catalogue-quarantine-policy.mjs
- theme-document-effects.tsx
- getPlayerSettings
- createThumbnailCache
- thumbnail-renderer.test.ts
- client-polling.test.ts
- package.json
- normalizeVipGroup
- redeem-code-management.test.mjs
- repository.test.ts
- Live server status setup
- cs2-finish-validity.test.ts
- generate-brand-icons.mjs
- Staff UI and interaction polish
- Browser-generated weapon thumbnails
- market-pricing.test.ts
- access.ts
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
- staff-membership-inventory.ts
- bot-routes.test.ts
- market/purchase/route.ts
- market-discount-announcement.tsx
- notification-repository.ts
- discord-bot/hosting/activate.sh
- loadout/preview/route.ts
- account-nav.tsx
- economyResolvedMarketSalePrice
- public-staff-directory.test.mjs
- case-notifications.test.ts
- link-routes.test.ts
- check.mjs
- 2026-09-12-discord-bridge.md
- SearchNavigationForm
- external-market-prices.test.ts
- resilient-remote-image.tsx
- profile-dependencies.test.ts
- appeals/route.test.ts
- discord-bot/hosting/start-hosting.sh
- lifetime-stats.test.mjs
- discord-bot/hosting/package.sh
- StaffAdminMembershipError

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

## Communities (205 total, 38 thin omitted)

### Community 0 - "portal-repository.ts"
Cohesion: 0.01
Nodes (232): ActivateVipMembershipItemInput, ActivateVipMembershipItemResult, AddStaffCustomCrateLootEntryInput, AddStaffCustomCrateLootEntryResult, AdminAuthorization, AdminAuthorizationRow, AdminListRow, AppealEligibility (+224 more)

### Community 1 - "staff-vip-memberships.ts"
Cohesion: 0.09
Nodes (36): getGameDatabasePool(), ArenaVipScopeRow, ArenaVipSubscriptionMutationRow, ArenaVipSuppressionRow, ArenaVipTargetRow, asBoolean(), asDate(), configuredVipServerId() (+28 more)

### Community 2 - "staff-admin-memberships.ts"
Cohesion: 0.15
Nodes (43): adminMembershipError(), ArenaAdminDefinitionRow, asBoolean(), asDate(), assignmentDurationMinutes(), assignStaffAdminMembership(), detachNativeAdminGroup(), deterministicArenaUuid() (+35 more)

### Community 3 - "economy/route.ts"
Cohesion: 0.08
Nodes (62): actionIdempotencyKey(), artworkContentTypes, catalogueMarketVersion(), crateActionErrorKey(), discountExclusions(), discountPercentageBps(), discountUtcDate(), ensureActorCanTarget() (+54 more)

### Community 4 - "economyError"
Cohesion: 0.11
Nodes (83): applyTokenDelta(), attachEconomyCharm(), attachEconomySticker(), attachEconomyStickerRecord(), awardEconomyDrop(), cancelEconomyTrade(), clearEconomyLoadoutSlot(), clearEconomyLoadoutSlots() (+75 more)

### Community 5 - "staff-management-page.tsx"
Cohesion: 0.05
Nodes (55): AppealBanSource(), CaseMessages(), errorText(), getPageNumber(), getSanctionEvents(), isSteamId(), noticeText(), ProfileMention() (+47 more)

### Community 6 - "vip-perks.ts"
Cohesion: 0.08
Nodes (67): actionView(), bool(), number(), POST(), redirect(), value(), AdminAuditRow, adminMutation() (+59 more)

### Community 7 - "economyNumber"
Cohesion: 0.06
Nodes (94): applyEconomyCatalogueDiscounts(), archiveEconomyRedeemCode(), createEconomyInventoryItem(), createEconomyRedeemCode(), economyBoolean(), EconomyCatalogueFilter, EconomyCataloguePage, economyCatalogueSearchFilter() (+86 more)

### Community 8 - "migrate-arena-group-authority.mjs"
Cohesion: 0.08
Nodes (64): configuredArenaServerScopeLink(), acquireMigrationLock(), addDistinct(), applyArenaPlan(), applyPortalPlan(), asBoolean(), asIntegerString(), assertBridgeRow() (+56 more)

### Community 9 - "getPlayerDashboard"
Cohesion: 0.09
Nodes (53): activeVipRows(), authoritativeVipCoreRowsForSteamId(), emptyHitboxStats(), getActiveNativeVipSuppressedSteamIds(), getAdminPool(), getAuthoritativeExternalIdentityMemberships(), getExternalIdentityGroupMembershipIndex(), getExternalIdentityGroupMemberSteamIds() (+45 more)

### Community 10 - "formActionRedirect"
Cohesion: 0.17
Nodes (21): allowedImageTypes, getScreenshot(), parseCaseId(), POST(), redirect(), POST(), redirect(), validSteamId() (+13 more)

### Community 11 - "arena-group-definition-authority.ts"
Cohesion: 0.07
Nodes (69): actorValue(), AdminGroupRow, adminNativeRowId(), AdminServerRow, ArenaGroupDefinitionAuthorityError, ArenaGroupRow, ArenaGroupScopeRow, ArenaRuntimeAuthorityRenameHint (+61 more)

### Community 12 - "identity-groups.ts"
Cohesion: 0.05
Nodes (62): IDENTITY_GROUP_BADGE_ICON_OPTIONS, identityExternalBadgeLookupKey(), IdentityGroupBadgeIconKey, identityGroupBadgeIconKeys, isIdentityGroupBadgeIconKey(), ensureIdentityCatalogue(), getIdentityCatalogueStatus(), ArenaAuthorityMembership (+54 more)

### Community 13 - "loadout-manager.tsx"
Cohesion: 0.07
Nodes (45): EconomyLoadoutManager(), chooseTeamTarget(), chooseWeaponDefinition(), runAction(), EconomyLoadoutManagerProps, equippedTeamLabels(), fallbackSlotPreview(), LOADOUT_CATEGORIES (+37 more)

### Community 14 - "inventory-manager.tsx"
Cohesion: 0.09
Nodes (38): itemIsVipMembership(), itemSupportsLoadout(), canBulkSellItem(), compareItems(), gridColumnCount(), inventoryItemToggleId(), InventoryManager(), closeInventoryItem() (+30 more)

### Community 15 - "identity-group-listings.ts"
Cohesion: 0.10
Nodes (50): getPortalDatabasePool(), acquireIdentityCatalogueMutationLock(), CatalogueLockRow, identityCatalogueMutationLockName, releaseIdentityCatalogueMutationLock(), ArenaCatalogueTarget, ArenaCatalogueTargetRow, arenaGroupType() (+42 more)

### Community 16 - "economyMutationFailure"
Cohesion: 0.20
Nodes (35): POST(), POST(), POST(), POST(), POST(), POST(), POST(), POST() (+27 more)

### Community 17 - "staff-inventory-panel.tsx"
Cohesion: 0.10
Nodes (21): GrantCatalogueItem, StaffGrantItemForm(), DirectoryContext, formatTokens(), InventoryFilters, inventoryImageUrl(), inventoryStates, Pagination (+13 more)

### Community 18 - "external-group-management.ts"
Cohesion: 0.13
Nodes (45): AdminAssignmentRow, AdminGroupRow, appliesToServer(), assertRuntimeCreateNameAvailable(), booleanValue(), cancelPreparedRename(), completeRenameAndRefreshPortal(), createRuntimeAdminsCoreGroup() (+37 more)

### Community 19 - "inventories/page.tsx"
Cohesion: 0.05
Nodes (61): durationLabel(), errors, euroInput(), GroupListingsPage(), ListingForm(), notices, positiveInteger(), selectedView() (+53 more)

### Community 20 - "scripts"
Cohesion: 0.04
Nodes (47): scripts, build, build:cloudflare, build:hosting, build:release, deploy:cloudflare, dev, discord:build (+39 more)

### Community 21 - "vip/page.tsx"
Cohesion: 0.10
Nodes (32): artworkForGroup(), conversionRate(), exactDuration(), getPageNumber(), liveConversionPreview(), liveVipRateScheduleIsValid(), matchesGroup(), MembershipAccess (+24 more)

### Community 22 - "migrate-vip-scope.mjs"
Cohesion: 0.09
Nodes (35): acquireNamedLock(), apply(), applyGamePlan(), applyPortalPlan(), buildPlan(), commerceMetadataPatchValues(), detachSourceSubscription(), dryRun() (+27 more)

### Community 23 - "site.ts"
Cohesion: 0.08
Nodes (27): ErrorPageProps, metadata, ModesPage(), HomePage(), metadata, robots(), sitemap(), BrandEmblem() (+19 more)

### Community 24 - "identity-catalogue.ts"
Cohesion: 0.06
Nodes (55): AdminDatabaseAssignmentRow, AdminDatabaseGroupRow, applyIdentityGroupRenameIntent(), assertIdentityGroupExternalKeyAvailable(), builtinGamePermissions, cancelIdentityGroupRename(), CatalogueAliasRow, completeIdentityGroupRename() (+47 more)

### Community 25 - "assignments-workspace.tsx"
Cohesion: 0.07
Nodes (40): AdminAssignment, adminScopes(), Assignment, AssignmentRecordCard(), assignmentRecords(), AssignmentStatus, AssignmentsWorkspace(), AssignmentsWorkspaceProps (+32 more)

### Community 26 - "marketplace-browser.tsx"
Cohesion: 0.07
Nodes (60): defaultFloatForItem(), discountPercentLabel(), displayQuotedFloat(), floatInRange(), formatFloat(), isContainerItem(), isFloatSelectable(), isProfileThemeItem() (+52 more)

### Community 27 - "player-search-field.tsx"
Cohesion: 0.14
Nodes (21): isRecord(), isSteamId64(), noLocalPlayers, PLAYER_SEARCH_ENDPOINT, playerIdentity(), PlayerSearchField(), choosePlayer(), clearSelection() (+13 more)

### Community 28 - "index.mjs"
Cohesion: 0.11
Nodes (38): createAutomaticRoleSync(), fingerprint(), commandDefinitions, createCommandHandler(), registerCommands(), readConfig(), startHealthReporter(), logError() (+30 more)

### Community 29 - "player-identities.ts"
Cohesion: 0.07
Nodes (41): context, state, stubs, GET(), json(), pageNumber(), privateNoStore, RouteContext (+33 more)

### Community 30 - "staff/route.ts"
Cohesion: 0.15
Nodes (24): adminMembershipReference(), adminMembershipSource(), arenaMembershipUuid(), assignmentDurationMinutes(), exactStoredAdminGroup(), exactStoredVipGroup(), fallbackVipGroups, optionalVipServerId() (+16 more)

### Community 31 - "redeem-code-admin.tsx"
Cohesion: 0.08
Nodes (28): CatalogueSearchField(), CatalogueSearchFieldProps, CatalogueSearchItem, CatalogueSearchResponse, isRecord(), parseItems(), adminAction(), newIdempotencyKey() (+20 more)

### Community 32 - "registry.ts"
Cohesion: 0.10
Nodes (21): betaTesterTheme, defaultTheme, rankThemeDescriptions, RankThemeKey, RankThemeOptions, rankThemes, portalThemes, ResolvedPortalThemeSurface (+13 more)

### Community 33 - "postEconomyAction"
Cohesion: 0.10
Nodes (21): createEconomyIdempotencyKey(), EconomyActionRequestError, postEconomyAction(), bulkSellItems(), runAction(), RedeemCodeForm(), submit(), RedeemResult (+13 more)

### Community 34 - "economy-view-model.ts"
Cohesion: 0.12
Nodes (36): asArray(), authoritativeCrateRarity(), economyCatalogueItems(), economyCrates(), EconomyCrateView, economyItems(), economyLoadout(), EconomyLoadoutView (+28 more)

### Community 35 - "profile-themes.ts"
Cohesion: 0.13
Nodes (21): InventoryVisibility, OwnedTheme, ProfileSettingsForm(), ProfileSettingsFormProps, ProfileSettingsValue, SettingsResponse, ProfileThemeSurfaceBadge(), ProfileThemeSurfaceBadgeProps (+13 more)

### Community 36 - "loadRuntimeDatabaseGroups"
Cohesion: 0.14
Nodes (30): addPermission(), adminsConfigCandidates(), appliesToConfiguredServer(), asObject(), boundedInteger(), cleanCapabilityKey(), cleanGroupName(), cleanPermissionKey() (+22 more)

### Community 37 - "market-pricing.ts"
Cohesion: 0.14
Nodes (28): economyMarketplaceQuoteKey(), economyValidateResolvedMarketplaceQuote(), addCandidate(), adjustedMarketplaceEuroCents(), boundedFloat(), boundedSeed(), deriveMarketplacePriceIdentity(), getMarketplacePriceQuotes() (+20 more)

### Community 38 - "getSession"
Cohesion: 0.06
Nodes (60): POST(), GET(), RouteContext, json(), POST(), privateNoStore, publicSettings(), record() (+52 more)

### Community 39 - "inventory-crate-opening.tsx"
Cohesion: 0.07
Nodes (50): CrateDropPreview(), CrateDropPreviewReady(), DISPLAYED_RARITY_RANKS, EconomyCrateDrop, EconomyCrateDropState, economyCrateDropStateFromResponse(), normalizedText(), responseMessage() (+42 more)

### Community 40 - "loadout-editor.tsx"
Cohesion: 0.10
Nodes (27): categories, EditorCategory, fallbackIcon(), isSkinCategory(), LoadoutEditor(), changeCategory(), changeWeaponGroup(), resetAdvancedFields() (+19 more)

### Community 41 - "vip-membership-activation-saga.ts"
Cohesion: 0.06
Nodes (84): activateVipMembershipItemWithSaga(), ActivationManualReviewError, ActivationRequestPayload, applyArenaVipCommand(), ArenaCommandRejection, ArenaCommandRow, ArenaGroupRow, ArenaMembershipRow (+76 more)

### Community 42 - "vip-tier-catalogue.ts"
Cohesion: 0.14
Nodes (28): boolean(), configuredVipServerId(), displayNumber(), fallbackTierSkeletons, finiteNumber(), formatUtilities(), GameVipGroupRow, genericDetail() (+20 more)

### Community 43 - "external-market-prices.ts"
Cohesion: 0.14
Nodes (29): CsfloatExactListingLookup, csfloatQuotes(), exactListingCache, exactListingCacheKey(), ExactListingCacheValue, exactListingRequests, exchangeRateFromPayload(), ExchangeRateSnapshot (+21 more)

### Community 44 - "compilerOptions"
Cohesion: 0.07
Nodes (29): dist, dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 45 - "staff-inventory-player-row.tsx"
Cohesion: 0.24
Nodes (10): interactiveSelector, StaffInventoryPlayerRow(), handleClick(), navigate(), StaffInventoryPlayerRowProps, announceNavigationStart(), currentThemeKey(), internalNavigation() (+2 more)

### Community 46 - "groups/route.ts"
Cohesion: 0.21
Nodes (40): bool(), number(), optionalNumber(), POST(), redirect(), returnTab(), text(), addIdentityGroupReward() (+32 more)

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

### Community 55 - "trade-manager.tsx"
Cohesion: 0.12
Nodes (31): EconomyEmptyState(), EconomyItemCard(), EconomyItemCardProps, EconomyItemStatTrak(), EconomyItemView, EconomyTradeItemView, EconomyTradeView, EconomyWalletView (+23 more)

### Community 56 - "weapon-thumbnail.ts"
Cohesion: 0.18
Nodes (13): fixture(), item, requireSeparator(), nativeStickerPlacement(), viewerStickerPlacement(), weaponLegacyModel(), normalizeWeaponThumbnail(), number() (+5 more)

### Community 57 - "extendStaffVipMembership"
Cohesion: 0.27
Nodes (28): activeNativeGroupNames(), consolidateStaffVipMemberships(), editArenaStaffVipMembership(), editStaffVipMembership(), expectedNativeExpirySeconds(), extendStaffVipMembership(), extensionSeconds(), lockExactArenaVipMembership() (+20 more)

### Community 58 - "tickets/route.ts"
Cohesion: 0.18
Nodes (20): hasActiveBan(), parseCaseId(), POST(), redirect(), categories, isClosedTicket(), parseCaseId(), parseListingId() (+12 more)

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
Nodes (17): GET(), isAuthorized(), maxDuration, runtime, register(), EconomyPublicPriceRefreshUpdate, pruneCompletedEconomyOperationReceipts(), recordAutomaticEconomyPublicPrices() (+9 more)

### Community 63 - "cs2-finish-catalogue.ts"
Cohesion: 0.25
Nodes (8): Cs2Finish, cs2FinishValiditySql(), definitionTypes, FinishIdentity, getCs2PaintkitWear(), isCs2CatalogueFinishAvailable(), isValidCs2Finish(), paintMaterials

### Community 64 - "create-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (13): args, encodeRow(), encodeValue(), fileOutput, gzip, manifest, outputDir, outputFile (+5 more)

### Community 65 - "restore-logical-snapshot.mjs"
Cohesion: 0.11
Nodes (12): args, file, manifest, mismatches, objects, relative, root, rowCounts (+4 more)

### Community 66 - "public-staff-directory.ts"
Cohesion: 0.21
Nodes (16): configuredGameServerGuid(), DEFAULT_GAME_SERVER_GUID, isAssignedToConfiguredGameServer(), ArenaGroupRow, DiscordLinkRow, getPublicStaffDirectory(), NativeGroupRow, readDefinitions() (+8 more)

### Community 67 - "staff-grant-item-controls.tsx"
Cohesion: 0.06
Nodes (45): validItemType(), BatchGrantResponse, CatalogueFilter, catalogueFilters, catalogueLine(), CatalogueSearchResponse, customItemTypes, customLine() (+37 more)

### Community 68 - "reconcileIdentityGroupRewards"
Cohesion: 0.18
Nodes (20): applyIdentityGroupMembershipRewards(), asRecord(), awardRewardsForGroup(), enqueueIdentityRewardRefresh(), getEffectiveGroupRows(), identitySteamId(), loadAccountBoundRewardAwards(), reactivateAccountBoundRewardsForGroup() (+12 more)

### Community 69 - "skinport-prices.ts"
Cohesion: 0.22
Nodes (17): euroCents(), fetchSkinportRows(), fetchSnapshot(), getSkinportHistoricalPrices(), getSnapshot(), HistoricalPeriod, historicalPeriods, listingPriceFields (+9 more)

### Community 70 - "items/page.tsx"
Cohesion: 0.12
Nodes (25): AdminItemsPage(), AdminItemsPageProps, catalogueArtworkUrl(), cleanLookup(), errorText(), formatDate(), formatDropChance(), formatPrice() (+17 more)

### Community 71 - "app/tickets/page.tsx"
Cohesion: 0.21
Nodes (13): canReply(), getVipRequest(), listingId(), TicketCase(), TicketsPage(), TicketsPageProps, getIdentityGroupListing(), IdentityGroupListing (+5 more)

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
Cohesion: 0.14
Nodes (21): acquireConnection(), createServerLinkRepository(), databaseCode(), DatabaseTimeoutError, discardConnection(), epoch(), HeartbeatOrder, iso() (+13 more)

### Community 79 - "resolvePortalThemeSurface"
Cohesion: 0.18
Nodes (15): metadata, RootLayout(), GlobalThemeBackground(), GlobalThemeDocumentEffects(), ProfileThemeAvatarAdornment(), ProfileThemeBackground(), ProfileThemeDocumentEffects(), ProfileThemeHeroDecoration() (+7 more)

### Community 80 - "link-repository.ts"
Cohesion: 0.13
Nodes (13): DiscordLinkForm(), alreadyLinked(), CodeRow, createDiscordLinkRepository(), DiscordLink, DiscordLinkError, DiscordLinkErrorCode, DiscordLinkRedemption (+5 more)

### Community 81 - "Loadout Workspace Design"
Cohesion: 0.15
Nodes (12): 1. Choose a category, 2. Choose a weapon or team, 3. Choose an owned item, Accessibility, Data and component design, Error and empty states, Goal, Interaction model (+4 more)

### Community 82 - "adaptive-player-hover-card.tsx"
Cohesion: 0.33
Nodes (6): AdaptivePlayerHoverCard(), AdaptivePlayerHoverCardProps, CardPosition, Placement, relatedTargetIsInside(), triggerSelector

### Community 83 - "ARENA Portal README"
Cohesion: 0.05
Nodes (39): Preserve the repair on future code deployments, Worker database request isolation, Arena Group Authority Documentation, ARENA Discord bot, Automatic deployment on FreakHosting, HTTP contract, Linking and roles, Setup (+31 more)

### Community 84 - "server-status.ts"
Cohesion: 0.39
Nodes (6): GET(), unknownPublicStatus(), getStoredHeartbeat(), portalRepository(), getServerStatus(), ServerStatus

### Community 85 - "chat-colors.ts"
Cohesion: 0.27
Nodes (8): TagColorFields(), ChatColor, chatColorPreview(), chatColors, normalizeChatColor(), supported, tokens, identityChatColor()

### Community 88 - "notifications/route.ts"
Cohesion: 0.25
Nodes (14): POST(), runtime, POST(), runtime, GET(), runtime, authorizeDiscordBot(), botJson() (+6 more)

### Community 89 - "ranking/page.tsx"
Cohesion: 0.17
Nodes (13): getPageNumber(), metadata, rankingLink(), RankingPage(), RankingPageProps, classNames(), DataTable(), DataTableProps (+5 more)

### Community 90 - "market/preview/route.ts"
Cohesion: 0.36
Nodes (10): asCatalogueId(), asFloat(), catalogueArtworkUrl(), GET(), metadataText(), officialImageUrl(), previewMarketNames(), uniqueImageUrls() (+2 more)

### Community 92 - "discount-rule-admin.tsx"
Cohesion: 0.12
Nodes (21): CatalogueSearchResponse, DiscountCatalogueOption, DiscountRuleAdmin(), searchCatalogue(), submitSearch(), DiscountRuleAdminProps, itemTypes, percentageValue() (+13 more)

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
Cohesion: 0.13
Nodes (12): db, hash, imageKey, state, stubs, GET(), runtime, POST() (+4 more)

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
Cohesion: 0.42
Nodes (9): POST(), POST(), discordLinkFailure(), discordLinkJson(), readDiscordLinkBody(), getDiscordLinkForSteam(), issueDiscordLinkCode(), redeemDiscordLinkCode() (+1 more)

### Community 109 - "live-server-panel.tsx"
Cohesion: 0.24
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
Cohesion: 0.13
Nodes (12): groupDescription(), groupIcons, MemberCard(), StaffShowcase(), collator, StaffDirectory, StaffDirectoryDefinition, StaffDirectoryGroup (+4 more)

### Community 126 - "sell/route.ts"
Cohesion: 0.14
Nodes (28): isLegacySteamPrice(), metadataFloat(), POST(), catalogueIdFromSearch(), floatFromSearch(), GET(), legacySteamPrice(), seedFromSearch() (+20 more)

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

### Community 131 - "sellback.ts"
Cohesion: 0.22
Nodes (12): ECONOMY_SELLBACK_BASIS_POINTS, ECONOMY_SELLBACK_MINIMUM_TOKENS, ECONOMY_SELLBACK_PERCENT_LABEL, economySellbackPayoutTokens(), EconomySellbackResolution, economySellbackSaleMessage(), EconomySellbackSaleMessageInput, economySellbackUsesMinimum() (+4 more)

### Community 132 - "protocol.ts"
Cohesion: 0.22
Nodes (12): boundedInteger(), boundedText(), Heartbeat, milliseconds(), recordValue(), RosterPlayer, steamId(), NOW (+4 more)

### Community 134 - "bot-service.ts"
Cohesion: 0.25
Nodes (11): configuredGuildId(), discordNotificationRepository(), discordPortalPool(), getDiscordBotSnapshot(), saveDiscordGroupRole(), AuthoritySnapshot, DiscordGroup, ExternalMemberships (+3 more)

### Community 135 - "warm-weapon-thumbnails.mjs"
Cohesion: 0.19
Nodes (9): args, cache, options, renderer, seen, suppliedEnvironment, parseThumbnailWarmupOptions(), selectThumbnailModelRepresentatives() (+1 more)

### Community 136 - "callback/route.ts"
Cohesion: 0.35
Nodes (8): GET(), GET(), createSessionToken(), createSteamLoginUrl(), getPortalOrigin(), verifySteamLogin(), createPortalSession(), portalRedirectUrl()

### Community 137 - "ConfirmSubmitButton"
Cohesion: 0.17
Nodes (7): ConfirmSubmitButton(), ConfirmSubmitButtonProps, PendingDecision, DialogPhase, PortalDialog(), PortalDialogProps, PortalDialogTone

### Community 138 - "profile-theme-entitlements.test.ts"
Cohesion: 0.17
Nodes (7): db, executor, gold, moderator, resolve(), silver, sourceModuleUrl()

### Community 139 - "group-listings/route.ts"
Cohesion: 0.33
Nodes (9): bool(), euroCents(), integer(), POST(), redirect(), value(), verifyAdminActionToken(), GroupListingActor (+1 more)

### Community 140 - "devDependencies"
Cohesion: 0.15
Nodes (13): @opennextjs/cloudflare, devDependencies, @opennextjs/cloudflare, @types/node, @types/react, @types/react-dom, typescript, wrangler (+5 more)

### Community 141 - "theme-runtime-assets.tsx"
Cohesion: 0.12
Nodes (16): RankThemeBackground(), RankThemeGeometry(), RankThemeGeometryProps, ShadowProfileAura(), ShadowThemeBackground(), rainDrops, RainDropStyle, TapGodRainBackground() (+8 more)

### Community 142 - "cs2-catalogue-quarantine-policy.mjs"
Cohesion: 0.23
Nodes (9): definitions, isInvalidCatalogueFinish(), manifestRevision, materials, planCatalogueQuarantine(), actor, apply, args (+1 more)

### Community 143 - "theme-document-effects.tsx"
Cohesion: 0.25
Nodes (8): CursorGridBackground(), EffectRegistration, registrations, setCursorGrid(), syncDocumentEffects(), ThemeDocumentEffects(), PORTAL_THEME_CHANGE_EVENT, PortalThemeDocumentEffects

### Community 144 - "getPlayerSettings"
Cohesion: 0.31
Nodes (8): isTrustedOwnedProfileThemeKey(), getPlayerSettings(), getPortalSession(), toOwnedProfileTheme(), getAuthorizedProfileThemeItemIds(), ProfileThemeEntitlementCandidate, ProfileThemeInventoryRow, isOwnedPortalThemeKey()

### Community 145 - "createThumbnailCache"
Cohesion: 0.47
Nodes (9): createThumbnailCache(), exists(), nextBatch(), publish(), removeJob(), reserveDisk(), runJob(), runLane() (+1 more)

### Community 146 - "thumbnail-renderer.test.ts"
Cohesion: 0.22
Nodes (6): BrowserCallback, browserTransport, FixtureState, Frame, item, ViewerEvent

### Community 147 - "client-polling.test.ts"
Cohesion: 0.25
Nodes (3): PollingEnvironment, Deferred, VisiblePollerOptions

### Community 148 - "package.json"
Cohesion: 0.22
Nodes (8): engines, node, name, overrides, postcss, sharp, private, version

### Community 149 - "normalizeVipGroup"
Cohesion: 0.39
Nodes (6): fallbackVipGroups, vipGroupIdentity(), visibleVipGroups(), key(), normalizeVipGroup(), StaffVip

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

### Community 157 - "market-pricing.test.ts"
Cohesion: 0.33
Nodes (4): exact, input, state, stubs

### Community 158 - "access.ts"
Cohesion: 0.09
Nodes (32): catalogueId(), GET(), json(), noStore, GET(), idempotencyKey(), optionalInteger(), positiveInteger() (+24 more)

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

### Community 181 - "staff-membership-inventory.ts"
Cohesion: 0.32
Nodes (7): emptySummary(), getStaffMembershipInventorySummaries(), MembershipInventoryRow, MembershipJobRow, missingTable(), StaffMembershipInventoryProduct, StaffMembershipInventorySummary

### Community 182 - "bot-routes.test.ts"
Cohesion: 0.29
Nodes (4): Handler, resolve(), source(), state

### Community 183 - "market/purchase/route.ts"
Cohesion: 0.15
Nodes (12): state, stubs, isLegacySteamPrice(), optionalFloat(), optionalSeed(), optionalStattrak(), POST(), economyMetadataExplicitlyFalse() (+4 more)

### Community 184 - "market-discount-announcement.tsx"
Cohesion: 0.43
Nodes (6): adjustmentLabel(), endLabel(), MarketDiscountAnnouncement(), MarketDiscountAnnouncementItem, MarketDiscountAnnouncementProps, percentageLabel()

### Community 185 - "notification-repository.ts"
Cohesion: 0.36
Nodes (6): createNotificationRepository(), enqueueDiscordNotification(), NotificationInput, NotificationRow, NotificationSettlement, fixture()

### Community 186 - "discord-bot/hosting/activate.sh"
Cohesion: 0.57
Nodes (6): app_pid(), healthy(), install_launcher(), point_to(), activate.sh script, stop_bot()

### Community 187 - "loadout/preview/route.ts"
Cohesion: 0.52
Nodes (6): asInteger(), asWear(), GET(), previewResponse(), getLoadoutCatalogue(), getCs2CatalogueImage()

### Community 188 - "account-nav.tsx"
Cohesion: 0.16
Nodes (13): accountLinks, AccountNav(), AccountNavProps, primaryLinks, PrimaryNavigation(), PrimaryNavigationLinks(), isPrimaryNavigationLinkActive(), ProfileTab (+5 more)

### Community 189 - "economyResolvedMarketSalePrice"
Cohesion: 0.48
Nodes (7): economyMarketplaceFallbackMetadata(), economyMarketplaceQuoteAmount(), economyMarketplaceQuoteText(), economyNullableText(), economyResolvedMarketplacePurchaseQuote(), economyResolvedMarketSalePrice(), economySeed()

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

### Community 197 - "resilient-remote-image.tsx"
Cohesion: 0.60
Nodes (3): ResilientRemoteImage(), ResilientRemoteImageProps, proxiedImageUrl()

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
- **1191 isolated node(s):** `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope`, `AssignmentsWorkspaceProps`, `AssignmentStatus` (+1186 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1467 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `crate-drop-preview.tsx` (2× useful, score=1.859369071) _(code changed — re-verify)_

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSession` connect `getSession` to `economy/route.ts`, `staff-management-page.tsx`, `vip-perks.ts`, `formActionRedirect`, `group-listings/route.ts`, `economyMutationFailure`, `inventories/page.tsx`, `vip/page.tsx`, `site.ts`, `player-identities.ts`, `staff/route.ts`, `access.ts`, `groups/route.ts`, `groups/page.tsx`, `tickets/route.ts`, `loadout/preview/route.ts`, `items/page.tsx`, `app/tickets/page.tsx`, `loadout/route.ts`, `resolvePortalThemeSurface`, `ranking/page.tsx`, `link-service.ts`, `sell/route.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `getGameDatabasePool()` connect `staff-vip-memberships.ts` to `identityError`, `portal-repository.ts`, `public-staff-directory.ts`, `staff-admin-memberships.ts`, `loadRuntimeDatabaseGroups`, `vip-perks.ts`, `getPlayerDashboard`, `vip-membership-activation-saga.ts`, `arena-group-definition-authority.ts`, `identity-groups.ts`, `vip-tier-catalogue.ts`, `identity-group-listings.ts`, `external-group-management.ts`, `groups/page.tsx`, `identity-catalogue.ts`, `extendStaffVipMembership`, `access.ts`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `getPortalDatabasePool()` connect `identity-group-listings.ts` to `portal-repository.ts`, `staff-vip-memberships.ts`, `public-staff-directory.ts`, `vip-perks.ts`, `app/tickets/page.tsx`, `thumbnail-session.test.ts`, `economyNumber`, `vip-membership-activation-saga.ts`, `arena-group-definition-authority.ts`, `identity-groups.ts`, `vip-tier-catalogue.ts`, `bot-service.ts`, `link-service.ts`, `external-group-management.ts`, `thumbnail-cache.ts`, `staff-membership-inventory.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `LegacyAssignmentSearchParams`, `AssignmentWorkspaceView`, `AssignmentVipScope` to the rest of the system?**
  _1191 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal-repository.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.00946406954990646 - nodes in this community are weakly interconnected._
- **Should `staff-vip-memberships.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09309309309309309 - nodes in this community are weakly interconnected._
- **Should `economy/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07886904761904762 - nodes in this community are weakly interconnected._