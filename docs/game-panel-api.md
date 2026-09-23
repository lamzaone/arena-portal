# Native Game Panel API

`POST /api/game-panel/v1/{operation}` accepts only the exact operation tokens in
`lib/game-panel/contracts.ts`. Requests are UTF-8 JSON, at most 32 KiB, uncompressed,
over HTTPS. Every response is `Cache-Control: private, no-store`.

The complete operation and DTO table is in
[`2026-09-23-panel-portal-adapter.md`](../../docs/superpowers/plans/2026-09-23-panel-portal-adapter.md#wire-contract).
The executable schemas are `lib/game-panel/validation.ts`. Additions to that plan:

- Inventory, cases and market support `sort`, `category`, and `definitionIndex`.
  Sort values are `newest`, `name`, `rarity`, `float`, `price`. Category values are
  `rifles`, `snipers`, `pistols`, `smgs`, `shotguns`, `lmgs`, `other`.
- `trades.partners`, `trades.inventory`, and `trades.create` require signed
  `arguments.onlineSteamIds`, at most 64 unique connected player SteamIDs. The
  trusted plugin supplies this list from current connections; clients cannot
  supply it. An offline partner cannot be selected or have inventory queried.
- Page sizes are exactly 12, 24 or 48. Token values are canonical decimal strings
  in range 0 through 9007199254740991; numeric JSON Tokens are rejected.

## Authentication

The body is `{actorSteamId, operationId, arguments}`. The actor comes from the
authenticated CS2 connection. Operation IDs are `13digitUnixMs_lowercaseUUIDN`.
Persist the exact UTF-8 body for uncertain mutations. Retry that body and operation
ID with a fresh transport timestamp and request ID.

Headers: `X-Panel-Server-Id`, `X-Panel-Key-Id`, `X-Panel-Actor-Steam-Id`,
`X-Panel-Timestamp` (Unix seconds), `X-Panel-Request-Id` (32 lowercase hexadecimal
characters), `X-Panel-Signature` (64 lowercase HMAC-SHA256 hexadecimal characters).
The canonical text has no trailing newline:

```text
panel-v1
{serverId}
{keyId}
POST
{exactPath}
{sha256ExactBodyBytes}
{actorSteamId}
{timestamp}
{requestId}
```

The synthetic [signing vector](../lib/game-panel/fixtures/signature.json) is used
by the API tests and available to the C# tests. It is not a deployed credential.
Transport timestamps must be within 60 seconds. Forwarding headers do not establish
HTTPS. Browser session cookies never authenticate this endpoint.

Provision `GAME_PANEL_SERVERS_JSON` separately as a hosting secret and provision
the matching secret separately in the CS2 plugin configuration. Never put real
keys in source control, `public`, client bundles or Workshop assets. The format is:

```json
[{"serverId":"arena-test","allowedOperations":["wallet.read"],"keys":[{"keyId":"a","secretBase64":"REPLACE_WITH_BASE64_OF_AT_LEAST_32_RANDOM_BYTES","notBefore":"2026-09-23T00:00:00Z","notAfter":"2026-10-23T00:00:00Z"}]}]
```

At most 16 servers and two keys per server are accepted. IDs use lowercase ASCII
letters, digits, underscores and hyphens, length 1-64. Key dates must be real UTC
ISO timestamps. Rotation may overlap current and previous validity windows; remove
the previous key to revoke it. Configuration and operation permissions are checked
on every request. Missing or malformed configuration fails closed.

## Recovery And Limits

Apply migration `db/035_game_panel_adapter.sql` as a separate deployment step.
It includes the case snapshot column; apply it before deploying the changed portal
opening code. This implementation has not applied it to hosting. Nonces are unique per server, retained ten minutes, and claimed
transactionally with rate counters. Limits per minute: 600/server, 60/actor,
12 mutations/actor. Indexed cleanup removes at most 1000 rows in one batch per request.

Mutation IDs, exact body hashes, actors and servers are bound in durable storage.
The economy key is `gp1_` plus SHA256 of `serverId + "\n" + actorSteamId + "\n" +
operationId`. The same key reaches the existing economy transaction or VIP saga.
Fresh economic work is admitted only through 24 hours after the embedded operation
time, with 60 seconds future skew. Completed results are retained seven days. A
30-second lease coordinates adapter workers; repository idempotency remains the
authority when workers overlap. Canonical receipts are checked before retrying
pricing or ownership work. Journal records do not contain plaintext arguments.

`operations.status` is read-only and scoped to this server and actor. It also
requires permission for the original operation. An unknown recent ID is pending;
an unknown ID older than 24 hours is expired. Status never resumes a transaction.
An identical mutation retry may resume its existing VIP saga; manual-review and
uncertain outcomes retain their original identity. `cases.reconcile` reads immutable
actor-scoped opening snapshots and never opens containers.

Responses use `{data, operationId, error?}`. Authentication failures use a null
operation ID. After request validation, failures retain the accepted operation ID.
`operation_uncertain` means the commit outcome is unknown: query status or retry the
exact saved request, never create another operation ID. Errors include `code`,
`message`, `retryable`, and optional `retryAfterMs`. A successful trade response must
still be interpreted using its returned terminal status.

Inventory sale estimates are advisory; committed results include exact payout and
skipped IDs. Market purchase requires `expectedUnitPriceTokens` for every product.
Bulk opening commits all selected containers atomically, up to ten per operation.

The full 3D placement workbench remains `/inventory`; external linking remains
`/settings`. Evidence uploads are web-only. The standalone native `/cases` plugin
retains its separate authority.

## Local Verification

`npm run test:game-panel` uses synthetic in-process dependencies and no `.env` or
hosting credentials. `npm run typecheck` checks the full portal.
`npm run test:game-panel:mysql` requires `GAME_PANEL_TEST_DATABASE_URL` pointing
explicitly to an existing, disposable local MySQL database named `panel_test_*`.
Only loopback hosts are accepted. It applies only the adapter DDL and verifies nonce
exclusion, transactional counters and conflicting journal admission. Without that
fixture it fails with a clear message, never silently passes. Full economy row-lock
and deployed native behavior remain separate verification gates.
