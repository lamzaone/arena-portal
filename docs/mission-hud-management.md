# Mission and HUD staff management

Staff with the existing `canManageEconomy` permission use `/admin/missions` and
`/admin/hud-effects`. Both pages and every API request recheck staff access.
Mutations require the existing session-bound admin CSRF token. No public
configuration write route or executable CSS/script/asset input is accepted.

Apply `046_mission_definitions.sql` (owned by Inventory), then
`047_hud_effect_settings.sql`, to the shared portal database during your normal
deployment. These migrations were not applied to a live database by this task.

## Mission definitions

`POST /api/admin/missions` accepts `action: "publish"`, `csrf`,
`idempotencyKey` (16–128 ASCII letters/digits/underscore/hyphen),
`expectedVersion` (unsigned decimal string; `"0"` for a new definition), and:

```json
{
  "definition": {
    "period": "daily",
    "id": "precision",
    "title": "Precision",
    "metric": "weapon_kills",
    "weapon": "ak47",
    "target": 10,
    "enabled": true,
    "tokens": "18446744073709551615",
    "rewards": [{"catalogueKey": "existing-catalogue-key", "quantity": 2}]
  }
}
```

Response: `{ok:true,result:{version:"1",effectivePeriodStart:"2026-10-22"}}`.
IDs are stable within their period. The editor supports all shared runtime
metrics and weapon identifiers; `playtime_seconds` remains for legacy editing,
and `completions` is monthly only with optional `includesWeekly`.
There may be 16 distinct product rows, each quantity 1–100, total at most 100.
Tokens stay decimal strings through browser/API/storage boundaries.

Publication locks the mission parent, checks the expected version, validates
reward products, appends a version, writes its audit event, and commits the
idempotent response together. The effective date is computed on the server:
next UTC midnight, next Monday, or next month's first day. Existing snapshots
are never rewritten. Server-configured fallback missions are not automatically
imported or silently replaced; management of their same schedule/ID takes over
at the published boundary. Claims revalidate current catalogue availability
and grant all rewards atomically in Inventory.

Immediate disabling uses `action:"disable-immediately"`, `period`, `id`,
`expectedVersion` and the same CSRF/key fields. It is explicit and audited.
Disabling appends an identical definition version at its existing publication
date, advancing the editor version without changing scheduled mission behavior.
Re-enabling publishes for the next boundary, preserving suppression until then
through `disabled_until_period_start`. A stale expected version returns 409.
Identical key retries replay the committed result; changed payloads with the
same key return 409. Audit failure rolls back the mutation.

`GET /api/admin/missions` lists managed current/pending definitions.
`GET /api/admin/missions?q=...` searches the existing catalogue for reward
selection. Responses are private and have `Cache-Control: private, no-store`.

## Native effects read contract

Read `SELECT version, config_json FROM portal_hud_effect_settings WHERE id=1`
through the shared database at the existing throttled refresh. Keep `version`
as an unsigned decimal string. Apply a profile once when that version changes;
animation is client-side, never a server frame loop.

```json
{"styleId":"none","palette":"original","speed":1,"intensity":0.5,"reducedMotion":"respect"}
```

- `styleId`: `none`, `glow`, `gradient`, `shimmer`, `pulse`, `cycle`, `wave`,
  `sparkle`, `steps`. `none` preserves existing player/run styles without a
  global style override. It does not disable player effects.
- `palette`: `original`, `rose`, `gold`, `ice`, `mint`.
- `speed`: exactly `0.25`, `0.5`, `1`, `1.5`, `2` (duration multiplier input).
- `intensity`: exactly `0`, `0.25`, `0.5`, `0.75`, `1` (normalized strength).
- `reducedMotion`: `respect` or `always`; static styling remains intact.

`GET /api/admin/hud-effects` is staff-only. `POST` accepts `csrf`,
`idempotencyKey`, `expectedVersion`, `config` and returns
`{ok:true,result:{version:"1",config:{...}}}`. Only changed configurations
increment the version and create a settings audit event. Unknown keys, arbitrary
paths/CSS/scripts, non-finite values and values outside the finite lists fail.
New texture families require the normal local asset build/Workshop update;
supported profile parameter changes do not require a plugin rebuild.

## Local verification

```powershell
node --experimental-transform-types --test lib/missions/*.test.ts lib/data/mission-management.test.ts
node --test components/economy/mission-management.browser.test.mjs
npm run typecheck
$env:PORTAL_DATABASE_URL=''; $env:GAME_DATABASE_URL=''; npm run build
```

Repository tests use an isolated SQLite transaction adapter, not a live MySQL
server. Browser tests use an isolated fixture server and intercepted APIs,
including mobile/desktop, exact large token amounts, reward quantities,
disable confirmation, theme variable changes and reduced motion settings.
Native CS2 rendering/input and real MySQL lock concurrency still require their
normal server acceptance checks.
