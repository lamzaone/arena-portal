# Premium Casino Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Deliver premium casino motion, multi-placement Roulette, public Crash participants, multi-ball Plinko and a 100,000-Token limit.

**Architecture:** Extend the existing instant-game engine/JSON results and transactional repository, then build the table interfaces and deterministic physics playback on that reviewed contract. Keep existing financial reservations, receipt/storage recovery and authoritative clock; no new SQL tables, third-party dependency or hosted operation.

**Tech Stack:** Next.js 16, React 19, TypeScript, MySQL/MariaDB InnoDB, native CSS/SVG/Canvas/Web Animations, node:test, existing Playwright/esbuild.

**Spec:** `docs/superpowers/specs/2026-10-02-casino-premium-design.md`

## Global Constraints

- Existing portal Tokens, immutable ledger, durable reservation headroom, safe integer/BigInt totals and canonical request identities.
- Default maximum100000; Roulette limit per whole spin, Plinko1–20 balls at maximum100000 per ball (confirmed by user) with visible batch total.
- Preserve legacy single Roulette/Plinko requests/results, active Blackjack/Crash settings and liability completion, disabled semantics and public-only projections.
- Keep Steam session/CSRF/no-store; no client financial outcomes/times, no private Crash point/time or others' auto targets/wallets/request identities.
- No SQL migration, production dependency/lockfile change, hosted database access/deployment, CS2 change/connection, remote upload, merge/push/publish.
- Only local `mysql://root:casino-local-test@127.0.0.1:33537/casino_test`; tests never load `.env.local`.
- Isolated workspace `D:/ARENA/.worktrees/casino-premium`, baseline1943230; copy verified feature delta to main and build locally with portal/game DB URLs empty. Preserve generated/user edits.
- Premium accessible responsive UI and reduced-motion mode; evidence under `D:/ARENA/.artifacts/casino-premium`.

---

### Task 1: Multi-bet engines, atomic batches, public entrants and limits

**Files:** Modify `lib/casino/types.ts`, `roulette.ts`, `plinko.ts`, `settings.ts`, `games.test.ts`, `lib/data/casino-repository.ts`, its tests/fixture as needed, `.env.example`, `.env.production.example`, `docs/casino.md`; optional focused `lib/casino/participant-identities.ts` with tests. Modify `app/api/casino/play/route.ts` / routes tests only if needed. Do not touch game component implementation.

**Interfaces:** Add `RouletteBet {selection:RouletteSelection,stakeTokens:number}`, `RouletteMultiResult` with shared number/color, total stake/return and per-bet returns; `PlinkoBatchResult` with rows/risk, per-ball stake/count, total stake/return, paytable and `balls:PlinkoResult[]`; `CrashParticipantPublic` with betId, SteamId, displayName, avatarUrl, stakeTokens/status/cashoutMultiplier/payoutTokens. Snapshot produces every current participant. Export `normalizeRouletteBets(stake,bets)`, `rouletteMaximumReturn(bets)`, `playRouletteMulti(stake,bets,randomInt)`, `playPlinkoBatch(stakePerBall,rows,risk,ballCount,randomInt)`; preserve old engine functions/types. Save exact finalized signatures and example JSON to plan scratch `engine-contract.md` for Task2.

- [ ] Write failing pure behavior tests before implementation. One draw must settle several positions, e.g. zero+red returns only the straight stake; duplicate placements normalize and mismatching/overflow totals reject before RNG. Batch paths/returns must be independent and total each individually floored return. Include exact default max settings.

```ts
test('one pocket settles the whole board', () => {
  let draws = 0;
  const result = playRouletteMulti(30, [{selection:{kind:'number',value:0},stakeTokens:10},{selection:{kind:'color',value:'red'},stakeTokens:20}], () => { draws++; return 0; });
  assert.equal(draws,1); assert.equal(result.stakeTokens,30); assert.equal(result.payoutTokens,360);
});
test('two Plinko balls settle their individually rounded returns', () => {
  const result = playPlinkoBatch(3,8,'low',2, () => 0);
  assert.equal(result.stakeTokens,6); assert.equal(result.balls.length,2);
  assert.equal(result.payoutTokens,result.balls.reduce((sum,ball)=>sum+ball.payoutTokens,0));
});
```

- [ ] Run the pure game suite to observe absent-feature/behavior failure, then implement bounded input validation, exact maximum Roulette return across all37 outcomes and bounded Plinko maximum batch return with BigInt; game draw occurs only after prospective destination headroom admission. Legacy APIs still return legacy shapes. Normalize duplicate selections to one canonical position; cap raw arrays and unique supported positions.
- [ ] Write failing repository regressions for atomic whole-board/batch ledger sum, replay after economy pruning, conflicting key, insufficient total wallet funds and injected failure rollback, whole-spin max/per-ball max/count bounds and unsafe configured aggregate before RNG. Crash tests create several actual actors, exercise betting/flying/cashed-out/lost snapshots and assert all public participants while shoe/private point/time/targets/other balances/keys remain absent. Include disabled liabilities and existing66 tests.

```ts
const result = await playCasinoInstant({steamId:player,game:'plinko',stake:10,selection:{rows:8,risk:'low',ballCount:5},idempotencyKey:'plinko-batch-test-key'});
assert.equal(result.round.stakeTokens,50);
assert.equal((result.round.details as PlinkoBatchResult).balls.length,5);
assert.deepEqual(await playCasinoInstant({steamId:player,game:'plinko',stake:10,selection:{rows:8,risk:'low',ballCount:5},idempotencyKey:'plinko-batch-test-key'}),result);
```

- [ ] Update the repository to admit/debit/persist actual batch totals atomically with total return, saving all approved paths/bets in one round. Add participants projection and fast cached identity enrichment outside financial locks using the existing Steam service, bounded cache/batched background warmup and immediate Steam-ID fallback. Tests stub only profile boundary; no upstream/game/hosted DB. No new schema. Keep existing wallet helpers/reservations intact.
- [ ] Set default/env examples max100000, update docs with exact requests/limits and unchanged published game distribution. Finalize engine contract; run real local casino tests0skip, typecheck and HTTP guard suite. Commit scoped files and write `task-1-report.md` with red/green evidence, exact APIs/JSON and compatibility/financial invariants. Reviewer uses task brief/report/commit diff.

### Task 2: Premium table UI, motion, physics playback and browser evidence

**Files:** Modify `components/casino/{roulette-game,plinko-game,crash-game,blackjack-game,casino-lobby,client,slots-game}.tsx` as needed, `app/casino/casino.css`, browser test, package scripts only for new focused physics tests; create focused `roulette-table.tsx`, `roulette-wheel.tsx`, `plinko-board.tsx`, `crash-participants.tsx`, `lib/casino/plinko-physics.ts` and its meaningful tests as needed. Keep components focused; no unrelated stylesheet/repository changes or dependency/lockfile changes.

**Interfaces:** Consume Task1 finalized engine contract rather than infer field names. Preserve GameClient stable idempotent mutation path; optionally return a confirmed round/null from mutate if necessary, without weakening durable multi-tab/401/403 recovery. Physics is pure deterministic approved-path playback: `buildPlinkoTrajectory(path:readonly(0|1)[],variation?:number):PlinkoTrajectory`, `samplePlinkoTrajectory(trajectory,elapsedMs):PlinkoFrame` (x/y/bin/landed plus impact data). Geometry is shared between drawing and trajectory to avoid endpoint mismatch. Financial result remains server path/bin. Existing history and recovered receipts of both old/new shapes render correctly.

- [ ] Use frontend-design skill and read existing tokens/fonts. Write behavior-first browser regressions for several chip placements/undo/clear/one spin body+total, exact winning number after normal-motion wheel stop, public multi-actor Crash state transitions, five simultaneous balls plus another batch while falling, batch-cost/affordability, disabled state/reduced motion and every-game375px width. Extend existing recovery tests to place chips without losing their two-tab/current-CSRF/Blackjack assertions. Observe red before component changes.
- [ ] Write pure physics regressions before implementation: all row counts and all-left/all-right/alternating paths land at approved bins; finite positions, gravity accelerates freefall, collisions reverse appropriate velocity, peg-contact distance and segment continuity, frame sampling and staggered concurrent trajectories independent.

```ts
test('approved edge path lands continuously in its exact bin', () => {
  const trajectory = buildPlinkoTrajectory(Array(16).fill(0));
  const final = samplePlinkoTrajectory(trajectory,trajectory.durationMs);
  assert.equal(final.bin,0); assert.equal(final.landed,true);
  for(let t=0;t<trajectory.durationMs;t+=8) {
    const a=samplePlinkoTrajectory(trajectory,t), b=samplePlinkoTrajectory(trajectory,t+8);
    assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
    assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<20);
  }
});
```

- [ ] Implement gravity/contact-ricochet trajectories and a smooth Canvas/SVG frame loop with trails/peg flashes/bin pulses. Render1–20 accepted balls at once with small staggering; support additional accepted batches while earlier falls remain visible, bound active animation work and disable incompatible board changes until active animations finish. Deduplicate animation by round identity; history/replay must not debit or invent ball outcomes. Frame cleanup, hidden-tab/reduced-motion fast-forward and accessibility are required.
- [ ] Build the classic 0–36/outside chip grid and denomination rack, accumulated amounts, undo/clear/total and coherent repeat placements; validate aggregate affordability and max before POST. Desktop landscape table and mobile readable/touch layout must preserve the same selections. Animate precise pocket alignment with wheel/ball counterrotation and eased landing; prevent duplicate spins during local wheel reveal without stranding uncertain requests. Highlight every winning placement.
- [ ] Add all-player Crash table with names/avatar fallback/stake/status/actual return, own controls only, precise multiplier/countdown motion and graph/settlement transitions. Upgrade shared lobby/table/chip/card polish and Blackjack deals/reveals while preserving portal themes and game rules. Keep product copy about the games, not provider/code internals; unavailable slots remain unavailable.
- [ ] Run physics/casino/typecheck and browser checks with normal/reduced motion desktop/mobile. Save clear screenshot sets and short wheel/multi-ball motion recordings in `.artifacts/casino-premium`; visually inspect. Update docs only with actual behavior/evidence. Commit scoped files and write `task-2-report.md` with red/green, screenshots/recordings, animation lifetime and existing recovery evidence.

### Task 3: Integration review, production builds and local delivery

**Files:** Only concrete review fixes and documentation. Scratch ledger/reports and artifacts are untracked.

- [ ] Review all changes against spec using fresh whole-branch reviewer: financial batch totals/max/headroom/RNG/replay, active compatibility, Crash public-only all participants, physics-to-server bins, animation lifecycle/reduced motion and concurrent durable storage. Delegate one final fix wave for concrete findings, then one scoped review; controller does no production fixes.
- [ ] Run full npm test with explicit disposable local URL, typecheck and real browser/physics verification. Build hosting production with PORTAL_DATABASE_URL/GAME_DATABASE_URL empty so no hosted connection occurs; no redundant suites absent changes/failures.
- [ ] Recheck mainHEAD1943230 and user changes. Copy exact feature delta only, verify source hashes, preserve graph/generated/user changes. Build main locally and verify built casino routes/source hashes. Never merge/push/deploy/hosted SQL/CS2.
- [ ] Record actual evidence and delivery in ledger/docs, stop owned local test DB gracefully. Preserve feature branch/worktree for recovery; archive workflow evidence without retrying previously rejected recursive cleanup. Report actual supported functionality,100k interpretation and local build/verification, keeping provider slots separate.
