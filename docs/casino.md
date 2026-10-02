# Portal casino

The native Roulette, Blackjack, Plinko and Crash games use the existing portal Tokens. Stakes and total returns are committed with durable round transitions in the same InnoDB transaction using `portal_token_accounts` and the immutable `portal_token_ledger`.

Apply `db/037_casino.sql` to the portal database after the token economy migration. Development used an isolated loopback `casino_test` fixture. On 2026-10-02, following Denis's explicit request, the complete migration was applied to the configured hosted portal database `s6702_portal`. All six InnoDB casino tables, primary/unique/check constraints, the generated Blackjack guard and singleton clock were verified. The operation record is `D:\ARENA\.artifacts\casino-verification\portal-casino-migration-applied.json`.

Migration 037 includes `portal_casino_reservations`. A fresh install must apply the complete file. An older development install must first disable new stakes and drain every active Blackjack/Crash liability using its old application, then stop that application before applying the updated migration and code. The disposable local fixture can instead be reset. This migration does not backfill old liabilities or repair an already overcommitted wallet. New code fails closed if an active liability lacks its matching reservation; do not treat partially migrated storage as protected.

`CASINO_ENABLED` defaults to `true`; `CASINO_MIN_BET` defaults to `2`; `CASINO_MAX_BET` defaults to `10000`. Values must be safe integers and maximum must be at least minimum. Blackjack stakes are even. Disabling casino prevents new stakes and Blackjack double/split stakes, while existing hit/stand actions, cashouts and automatic settlement remain available. Settings and engine version are saved per round. Blackjack inactivity timeout is 15 minutes and resolves all remaining hands by standing; it does not issue a refund.

## HTTP contract

All routes require the current Steam session. POST bodies include the existing economy `csrf` token and a fresh `idempotencyKey` matching `[A-Za-z0-9_-]{16,128}`. Retries reuse exactly the same body and key. Success responses have `ok:true`; errors have `ok:false,message`. Every response sends `Cache-Control: private, no-store`.

| Route | Request | Result |
| --- | --- | --- |
| GET `/api/casino/state` | no body | `CasinoBootstrap` fields plus `ok` |
| POST `/api/casino/play` | `game:'roulette'|'plinko', stake, selection` | `balance, round` |
| POST `/api/casino/blackjack` | `action:'start', stake` or `action:'hit'|'stand'|'double'|'split', roundId` | `balance, round` |
| POST `/api/casino/crash/bet` | `roundId, stake, autoCashout?:number|null` | `balance, round` |
| POST `/api/casino/crash/cashout` | `roundId` | `balance, round` |

Roulette selection and Plinko `{rows:8|12|16,risk:'low'|'medium'|'high'}` follow `lib/casino/types.ts`. Round details contain the saved public engine result. Blackjack details always omit the shoe and hide the dealer hole card until settlement. Crash multipliers and targets use integer hundredths (150 = 1.50x); automatic targets are restricted to 101..9999. Plinko paytable entries use basis points (10000 = 1x). All payouts are total returns including returned stakes.

Crash has an eight-second betting window, flight, and five-second cooldown. A shared durable clock advances on requests. Financial decisions use UTC database millisecond time read after obtaining casino, round/bet and wallet locks. Manual cashout is valid strictly before the private crash boundary. Automatic target equality loses; targets reached before the crash settle even after disconnect. There is no financial dependency on a JavaScript timer. On the next request after an idle interval, the previous liabilities settle before a fresh betting window opens. Public crash timestamps reveal the crash time only after the crash; recent outcomes contain completed rounds only.

Canonical `portal_casino_actions` receipts outlive the economy's seven-day receipt pruning. They retain request identity and the original public result; same-key retries never regenerate outcomes or debit again, including while disabled. The original response balance is replayed, so refresh state afterward to obtain today's balance. Do not prune casino receipts as economy cache entries.

## Payout headroom and request recovery

For each wallet, let `R` be the sum of maximum total returns on its active deferred rounds. Both `balance + R` and `lifetimeEarned + R` must stay at or below `Number.MAX_SAFE_INTEGER`. Admission checks the post-stake balance, lifetime earnings and lifetime spending with BigInt bounds before accepting a stake. Roulette checks the selected bet's maximum and Plinko its selected paytable's maximum before any game draw, so acceptance does not depend on winning or losing. Blackjack checks its initial 2.5x natural ceiling before dealing; an active non-natural round reserves 2x its total stake. Split/double replaces that reservation after checking all hands. Crash reserves `floor(stake * 9999 / 100)`, including when auto cashout is set because manual cashout remains possible.

Reservations persist by round identity. Settlement removes only that round's reservation before paying the owed return, in the same transaction as the wallet, ledger and round changes. Losses release the whole reservation; failures roll everything back. Canonical replay neither reserves nor releases again. Ordinary positive changes through the shared wallet helper must also leave room for `R`; spending cannot consume payout headroom. Missing casino tables preserve ordinary economy behavior, while casino reads and mutations fail closed until the full migration is installed.

Lock order remains casino clock, round/bet rows, sorted wallet locks, then reservations. The shared credit helper uses only the already-held wallet lock and reservation rows, never the casino clock or rounds. Reservation reads use `FOR UPDATE` so they see current commits after waiting for the wallet even under InnoDB repeatable-read. There are no reservation foreign keys that could reverse this order. Database time is sampled after all blocking maintenance locks.

The browser stores each pending request under its own account-scoped `tapped.casino.pending.v2.<account>.<request>` key before sending. Reload enumerates every unresolved identity; storage events synchronize existing tabs. Simultaneous submissions can both be admitted, but neither overwrites the other's record, and successful confirmation deletes only its own identity. Older v1 records remain recoverable without a destructive migration. Recovery preserves the original payload/key with the current CSRF token, retains records after 401/403 or uncertain responses, and reconciles against fresh server state. Inaccessible storage blocks new wagers.

## Requested provider slots remain unavailable

Denis requested the exact titles **Dazzling Hot**, **Burning Hot**, **Shining Crown**, and **Sweet Bonanza**. The UI must preserve these names and clearly show unavailable slots. It must not offer a Token wager, demo iframe, substitute clone or fake play button.

Amusnet publishes official catalogue pages for [20 Dazzling Hot](https://amusnetgaming.com/games/online-casino/20-dazzling-hot), [20 Burning Hot](https://amusnetgaming.com/games/online-casino/20-burning-hot), and [Shining Crown](https://amusnetgaming.com/games/online-casino/shining-crown). The plain requested names can have multiple variants; exact entitled provider game IDs must be confirmed during integration. Pragmatic Play publishes [Sweet Bonanza](https://www.pragmaticplay.com/en/games/sweet-bonanza-slot/).

Amusnet's [integration instructions](https://amusnetgaming.com/online-casino#integration) require account/integration-manager onboarding, portal access, a staging setup, integration tests, and separate production setup/approval. EGT Digital describes its [gaming aggregator](https://egt-digital.com/single-gaming/gaming-aggregator/), but that page does not provide this portal with a freely usable authenticated wallet API. Slots Launch's [getting-started documentation](https://docs.slotslaunch.com/article/16-getting-started) describes demo iframe access, which is not proof of wallet bets or wins.

No public free authorized wallet API and credentials supporting these exact titles with this portal's custom Tokens have been verified. Enabling them requires operator credentials, entitled game IDs, the actual authenticated wallet callback/session protocol, explicit custom Token-currency support and provider staging access. Any later integration must authenticate callbacks, map provider sessions to Steam accounts, settle bet/win/rollback requests idempotently in the existing ledger, recover disconnected rounds, verify monetary units, and pass actual staging integration tests before accepting stakes. No callbacks, external API credentials or demo settlement are implemented here. `game:'slots'` is rejected before an economy operation is created or a wallet is debited.

## Local validation

`npm run test:casino` runs pure engines, HTTP guards and fixture safety checks. Integration cases run only when `CASINO_TEST_DATABASE_URL` explicitly names a loopback MySQL/MariaDB database named `casino_test`; no `.env.local` is read. The fixture resets casino tables, economy operations and wallet data, and truncates the immutable ledger only in that disposable database. Apply `001_portal.sql`, `006_token_economy.sql` and `037_casino.sql` to the fixture before running it. Keep hosted and production databases out of this test URL.

The local tests exercise real InnoDB locking, shared-wallet ledger entries, rollbacks, replay after receipt deletion, stake races, hidden-state projection, Crash equality/automatic settlement and timing after a blocked wallet lock.

Final-fix verification on 2026-10-02 passed `npm test` (including 66 casino checks with zero skips), `npm run typecheck`, and 18 existing catalogue/wallet checks. `npm run test:casino:browser` passed four real-browser fixture tests, including simultaneous two-tab durable recovery, inaccessible storage, legacy v1 recovery, desktop/mobile layouts, 401/403 and renewed CSRF, and settled Blackjack reconciliation after receipts, polling and replay. These browser fixtures exercise the real UI with mocked API/session boundaries; they do not claim an end-to-end hosted Steam login or provider integration. Final production hosting builds passed in both the worktree and main checkout; delivery verified 39 source hashes and all six casino page/API route artifacts.

Screenshots and verification logs are stored locally under `D:\ARENA\.artifacts\casino-ui` and `D:\ARENA\.artifacts\casino-verification`. The hosted database migration is applied; hosting the updated portal application is a separate deployment step.
