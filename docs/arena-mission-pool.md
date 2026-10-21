# Arena mission library

`lib/missions/arena-mission-pool.json` contains exactly 100 token-only definitions:
50 daily, 30 weekly and 20 monthly. IDs use `arena_d_`, `arena_w_` and `arena_m_`
prefixes. These IDs stay stable when staff edit their titles, targets or rewards.
The JSON is also consumed by Inventory; tokens are decimal strings, and each
definition carries its own schedule, enabled state and reward array.

Players receive three random missions from each schedule: nine total. Assignments
and frozen rewards persist through reconnects and reloads. Daily resets at
00:00 UTC, weekly on Monday, monthly on the first day. A disabled assignment
keeps its slot until reset; disabling does not reroll it. Staff manage the
library, including multiple item rewards, at `/admin/missions`.

## Difficulty and rewards

| Objective | Daily | Weekly | Monthly |
| --- | --- | --- | --- |
| Kills | 15–60 | 100–250 | 500–1,500 |
| Headshot kills | 5–25 | 35–90 | 150–300 |
| Arena round wins | 5–25 | 40–100 | 200–400 |
| Duel wins | 1–3 | 5–15 | 25–50 |
| Kills without dying | 3–5 | 5–8 | 8–12 |
| Knife kills | 1–3 | 5–10 | 25 |
| Selected weapon kills | 2–15 | 25–60 | 125–250 |
| Active minutes | 15–45 | 120–240 | 600–1,200 |

Daily objectives fit one normal session; weekly objectives span several sessions;
monthly objectives reward extended play. Weapon targets follow the arena's
selectable weapon preferences, with lower targets for less common weapons.
There are exactly nine special objectives: one knife-round, grenade-round and
decoy-round win mission in each schedule. They require one win daily, two or
three weekly, and five to eight monthly. They count authoritative arena results,
including a decoy arena win without a decoy kill.

Rewards rise with the target for the same metric and weapon. The baseline remains
25 tokens for 25 daily kills, and 150 tokens for 250 weekly kills. Daily rewards
range from 15 to 65 tokens, weekly from 65 to 200, monthly from 250 to 900.
The initial catalogue has no item rewards, avoiding unavailable or unpriced
products. The existing staff editor still supports up to 16 different items,
quantities of 1–100, with at most 100 items in a claim.

## Bootstrap the configured portal database

Apply `046_mission_definitions.sql` and the Inventory assignment migration using
the normal database migration process before enabling random assignments. Run
from `arena-portal`:

```powershell
npm run seed:missions
npm run seed:missions -- --apply
```

The default is audit; `--audit` is also accepted. The runner loads the configured
`PORTAL_DATABASE_URL` through `@next/env` without printing credentials. It takes
a database-specific `GET_LOCK`, locks matching mission records in one InnoDB
transaction, and writes their definitions, all versions, DDL and insertion plan
to `../backups/arena-mission-pool-<timestamp>-<uuid>/before.json` before inserting
anything. Audit rolls back its read transaction without changing database rows.

Apply inserts only definitions absent from **both** mission tables. It never
updates, deletes, repairs or replaces existing rows, even disabled entries or
staff edits. New definitions start at version 1 with the **current** UTC period
start, so the initial library is available immediately. Later staff publication
continues to use the next daily/weekly/monthly reset. The seed actor is
`system:arena-seed`.

The runner checks inserted values and preservation of existing rows, saves
`verification.json`, then commits. `result.json` records the committed counts.
Failure to save the before or verification backup rolls back the transaction.
A concurrent staff insert of the same ID causes a duplicate-key rollback;
rerunning preserves that staff definition. Repeated successful runs insert zero
rows. Existing legacy default IDs and player progress are retained.

Editing this JSON and rerunning the seed does not change already seeded missions.
Use `/admin/missions` for ongoing management.

## Local checks

```powershell
npm run test:missions
npm run test:missions:browser
npm run typecheck
# Optional, with TAPPED_MISSION_SEED_TEST_DB set to a loopback disposable server:
npm run test:missions:mysql
```

Catalogue tests enforce counts, unique objectives, schedule budgets, increasing
rewards and a small special-round share. Seed policy tests run without a database.
Transaction tests use an isolated SQLite adapter to exercise audit, insertion,
idempotence, staff preservation, backup failures and rollback; MySQL lock
concurrency needs the separate disposable MySQL acceptance suite. The optional
MariaDB seed test creates and drops a unique database on the explicitly configured
loopback server, checking audit/apply/repeat, staff version and immediate-disable
preservation, and rollback when backups fail. It never loads the hosted database
configuration. Browser tests use a local fixture and intercepted APIs at desktop
and mobile sizes, including each special metric with multiple reward products.
