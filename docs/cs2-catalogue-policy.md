# CS2 catalogue, custom finishes and drop rewards

Known released weapon/paint pairs use `lib/economy/cs2-finishes.json` for their name, wear limits, item type and StatTrak capability. The portal and the game plugin embed the same file. Refresh with `node scripts/sync-cs2-finishes.mjs`; review the generated diff after game updates. This is a known-finish source, not proof that an absent material cannot be applied by a custom server.

The configured policy includes custom server finishes. An unknown pair such as Glock-18 / paint 44 remains available to staff. Public listing, purchase and random rewards require a positive current price explicitly saved by the staff panel (`staff-last-known`, `staff-panel`). Automated provider prices do not authorize custom items. New custom imports start disabled; setting that staff price enables them. Known released finishes remain listed through temporary pricing outages. Renderer coverage is independent of this policy.

The server and portal recheck eligibility before awarding items. Custom purchases and sales use the configured staff price, with existing discount and sellback rules. Existing inventory IDs, seeds, floats, counters, attributes and accounting history are retained. Canonical names repair quote identities for known pairs without inventing prices.

Drops use cryptographic random seeds from 0 through 1000. Their floats are sampled across the finish's legal minimum and maximum, ignoring retained fixed or narrow loot-entry samples. The known paint kit's wear limits also apply to custom weapon combinations. This does not claim to reproduce Valve's undocumented float probability distribution. Unsupported StatTrak variants are not generated for known finishes. Marketplace purchases preserve the selected seed and float; seed-matched price evidence must match that seed.

## Read-only audit and reversible maintenance

From `arena-portal`, load the intended environment explicitly:

```powershell
node --env-file=.env.local scripts/quarantine-invalid-cs2-finishes.mjs --report=../.tmp-weapon-customization-release/catalogue-audit.json
```

The default uses a read-only database transaction. It reports unpriced custom rows, enabled loot references, retained owned-item counts and legacy Broken Fang glove classification errors. Output files are created exclusively, so an existing report is not overwritten.

The retained WeaponSkins source has 22 pairs absent from the known released catalogue, including Glock Case Hardened and AWP Full Stop. A review of Valve's tracked `items_game.txt` found no collection/client-loot binding for these combinations. Their paint materials may still work on a custom server; absence is not a permanent rejection rule. The old importer also classified Broken Fang definition 4725 as a weapon skin; it now classifies that definition as gloves.

The following maintenance commands are prepared for a separately approved rollout; they have not been run against the configured database:

```powershell
node --env-file=.env.local scripts/quarantine-invalid-cs2-finishes.mjs --apply --actor=STAFF_STEAM_ID
node --env-file=.env.local scripts/quarantine-invalid-cs2-finishes.mjs --restore=QUARANTINE_RUN_ID --actor=STAFF_STEAM_ID
```

Apply disables only unpriced custom catalogue and loot rows. It corrects the four legacy Broken Fang catalogue types and the corresponding owned-item types without changing any other instance field. One transaction records before-states in `portal_economy_admin_audit`, alongside run markers on changed catalogue/loot rows. Restore checks markers and identities, restores enabled flags and types, and records its own audit. Owned inventory is never deleted; no balance or price is changed. Redeployment is necessary for the runtime protections, and any maintenance should be reviewed against a fresh audit.

Source for schema review: https://github.com/SteamDatabase/GameTracking-CS2/blob/master/game/csgo/pak01_dir/scripts/items/items_game.txt

## Verification

On 2026-09-06 the user explicitly authorized removal of existing unpriced custom weapons. Run `c72ae794-8bb7-4e09-ba8b-e87b44b22946` revoked 197 available crate rewards across 24 owners. Seven custom weapons with positive recorded prices were protected, regardless of source. No attachments, loadout slots, pending trades, sale locks, balances or non-weapon items changed. An independent read verified all 197 revoked rows and audit events. Before-states and verification results are retained in the workspace's ignored `.tmp-weapon-customization-release` directory. The broader catalogue quarantine and glove-type repair described above were not applied.

```powershell
node --experimental-transform-types --test lib/data/cs2-finish-validity.test.ts
node --test scripts/cs2-catalogue-quarantine-policy.test.mjs
dotnet test ../TAPPED.Inventory.Tests/TAPPED.Inventory.Tests.csproj --no-restore
```

Portal integration tests execute real repository SQL in isolated SQLite, adapting MySQL syntax. They cover pagination, unpriced custom exclusion, positive staff-price custom purchase/sale, selected seed persistence, legal randomized drops and rollback. Native MySQL transaction/concurrency tests require `TAPPED_INVENTORY_TEST_DB`; without it those tests are explicitly skipped.
# Removing existing unpriced custom weapons

`scripts/remove-unpriced-custom-weapons.mjs` implements the separately authorized
removal of existing owned guns and knives. It defaults to a read-only audit:

```powershell
node --env-file=.env.local scripts/remove-unpriced-custom-weapons.mjs
node --test scripts/remove-unpriced-custom-weapons-policy.test.mjs
```

The audit prints its snapshot path under the ignored
`.tmp-weapon-customization-release` directory. Review that concrete report, then
apply only its bounded item IDs:

```powershell
node --env-file=.env.local scripts/remove-unpriced-custom-weapons.mjs --apply --audit=../.tmp-weapon-customization-release/unpriced-custom-weapons-audit-RUN_ID.json
```

Removal excludes known released pairs, gloves (including legacy definition 4725
misclassified as a skin), nonexistent weapon definitions, consumed/revoked items,
and every item with a positive current catalogue EUR or token price. Any positive
stored variant price also protects the item, including expired evidence. This is
deliberately more conservative than the manual-price requirement for new custom
sales. Existing purchase/drop history and token balances are retained.

Apply locks and rechecks the audited ownership, identity, current prices and
variant prices. Newly priced or changed items are skipped. A new pending trade,
sale lock, non-available state, sticker or charm aborts the entire transaction;
attachments and counterparties are never silently changed. The audited September
6 batch has none of these blockers, so no attachment return or trade cancellation
is required. The script clears affected loadout slots, revokes inventory rows,
and queues an owner refresh and notification. It writes a durable local snapshot
before modifying rows and immutable per-item before/after events with a nullable
system actor. No staff Steam identity is fabricated, and no inventory row or
accounting history is deleted. Restoration can be reviewed from those full
snapshots; automatic restoration is intentionally not part of this command.
