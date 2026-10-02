# Portal casino design

Approved by Denis on 2026-10-02: a casino using the existing portal Tokens, with Roulette, Blackjack, Crash, Plinko, and slots. Latest instruction restores exact commercial titles: Dazzling Hot, Burning Hot, Shining Crown, Sweet Bonanza. EGT may be used if it supports portal Tokens through a proper authorized integration. A free service is preferred.

## Shared economy

All native game stakes and payouts use `portal_token_accounts` and the immutable `portal_token_ledger`. Reuse the economy mutation transaction, wallet locks, and request receipts rather than inventing a wallet. Steam sessions, CSRF tokens, and request hashes protect mutations. Canonical casino round records retain operation identity beyond the seven-day receipt retention. Outcomes are generated on the server with cryptographic randomness. No browser-supplied payout or timestamp is trusted.

Minimum stake is 2 Tokens and the configurable default maximum stake is 10,000 Tokens. All Token values are safe integers. Blackjack stakes must be even to pay 3:2 exactly. Games fail closed when disabled or the casino migration is missing; existing wallet features continue to work. Expose no live hidden cards, shuffle order, or crash point. Round history belongs to the signed-in player.

## Games

Roulette uses a single-zero European wheel. A spin supports one selected bet: straight number (36x total return), red/black, odd/even, low/high (2x), or dozen/column (3x). Zero loses every outside bet. Stakes are removed and total returns credited atomically.

Blackjack uses a freshly cryptographically shuffled six-deck shoe per round. Dealer stands on soft 17 and peeks for blackjack. Natural blackjack pays 3:2 profit; pushes return the stake. Hit, stand, double, and split are supported, including double after split. Maximum four hands; split aces get one card and cannot be resplit. Split 21 is not a natural blackjack. The round persists on refresh. All extra stakes are debited atomically with the action. One active blackjack round per player. An abandoned round stands all unresolved hands after 15 minutes, and is settled on the next access; it never refunds strategically losing hands.

Plinko supports 8, 12, or 16 rows and low/medium/high risk. A server-generated sequence of unbiased left/right choices determines the bin. Fixed, symmetric, published multiplier tables are calculated with binomial weights and an expected return no greater than 97%. Payouts are rounded down to whole Tokens. The browser animates the saved server path.

Crash has shared rounds: an eight-second betting window, a flight, and five-second cooldown. A server-generated crash point has a 1% house edge and a 100x cap. The multiplier grows exponentially from 1x and uses authoritative database time. Manual cash-out is accepted only during flight and strictly before the crash. Optional automatic cash-out settles at its exact target when reached before the crash, including across disconnects. The client only animates a synchronized snapshot. A durable singleton clock and locking advance/settle rounds on requests, supporting both Node and Cloudflare without relying on an in-process timer. Unique round/player bets prevent duplicate bets or cash-outs.

## Provider slots and external prerequisite

Amusnet's official catalogue lists Shining Crown, and Pragmatic Play supplies Sweet Bonanza. Amusnet's official integration page requires account/integration-manager onboarding, portal access, a staging environment, integration testing, and separate production setup/approval. No public free wallet API or credentials supporting these titles with this portal's Tokens was found. Slots Launch's documented free service provides demo iframes, not authenticated wallet settlement.

Do not substitute an unbranded game for an exact requested title, invent callback protocols, or treat demo/postMessage results as wallet evidence. The four native games can be implemented and delivered independently. Until provider operator credentials, exact wallet protocol, game access, and custom token-currency support are supplied, show Slots as unavailable and record the missing prerequisite in docs/casino.md. No Token stake can be accepted for an unavailable slot. Native instant-play requests with game='slots' fail without a wallet debit. This is an external integration dependency, not a claim that slots are complete.

Future authorized wallet integration must authenticate provider callbacks, map sessions to Steam accounts, settle bet/win/rollback transactions idempotently in the existing ledger, recover disconnected rounds, validate monetary/token units, and test the actual provider staging API before enabling wagers. Implement the actual protocol only after it is available.

Sources: https://amusnetgaming.com/online-casino#integration , https://amusnetgaming.com/games/online-casino/shining-crown , https://www.pragmaticplay.com/en/games/sweet-bonanza-slot/ , https://egt-digital.com/single-gaming/gaming-aggregator/ , https://docs.slotslaunch.com/article/16-getting-started . Open-source alternatives reviewed earlier: johakr/html5-slot-machine and schmooky/pixi-reels; latest user instruction requests the exact branded titles instead.
## UI

Add `/casino` to the existing account navigation. Use a casino lobby and native game panels, existing portal theme and account shell, responsive layouts, clear bet fields, Token balance, settlement messages, rules/paytables, and recent personal round history. Include roulette wheel, playing cards, crash graph, and animated Plinko board using SVG/CSS. Honor reduced motion, keyboard focus, and live result announcements. The Slots panel clearly shows current unavailability; it contains no fake play button, token wager field, or developer setup details.

## Verification and delivery

Test payout boundaries, blackjack actions/dealer behavior, zero roulette handling, expected Plinko return, crash timing/automatic cash-out, wallet concurrency, idempotency after receipt pruning, and hidden-state projections. Use a local test database only for integration; never apply migrations to a hosted database. Run TypeScript, the casino tests, relevant regressions, a production hosting build, and a browser smoke test. Copy verified source changes and local hosting artifacts into `D:\ARENA\arena-portal`. No remote deployment or CS2 plugin change is part of this feature.

