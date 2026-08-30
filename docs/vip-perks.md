# VIP perk entitlement contract

Apply `db/019_vip_perks.sql` to the same portal database named by
`PORTAL_DATABASE_URL`. The migration intentionally creates no Token-priced
offers. A Founder must review the seeded standalone VIPCore configurations and
publish each duration/price combination from `/admin/groups/perks`.

`GAME_VIP_SERVER_ID` selects the VIPCore runtime whose feature registrations
authorize shop offers. It defaults to server `1` when omitted. Configure the
same server ID in the portal and VIPCore when another game-server scope should
own the shop.

## Effective entitlement rules

- A perk is identified by the exact feature key registered with VIPCore, such
  as `vip.health`.
- Direct staff grants have configuration priority over Token-shop grants;
  direct grants have priority over custom-group grants.
- A custom-group perk is effective only while both its perk grant and the
  player's `portal_identity_group_memberships` row are active. Its effective
  expiration is the earlier of those two expirations.
- Multiple sources are additive for time. A permanent active source makes the
  effective perk permanent. Buying the same perk extends its latest effective
  expiration, including active custom-group coverage.
- Portal-managed perks never manufacture a VIPCore membership, Admins.Core
  rank, portal permission, or Founder authority.

## Token purchase guarantees

`POST /api/economy/vip-perks/purchase` uses the existing session-bound economy
CSRF token and a per-command idempotency key. In one database transaction it:

1. reserves and locks `portal_economy_operations`;
2. re-reads and locks the enabled perk offer and current price;
3. locks the buyer's `portal_token_accounts` row;
4. updates the wallet and writes the append-only `portal_token_ledger` line;
5. writes the timed player grant and purchase history; and
6. stores the replayable completed result.

Any failure rolls back the wallet, ledger, grant, purchase, and operation
together.

Token-shop grants cannot be revoked through the generic staff grant action.
They remain immutable until an audited refund workflow can reverse the Token
ledger entry and entitlement together. Staff and custom-group grants still use
explicit, confirmed revocation.

Founder mutations bind each admin idempotency key to a hash of the actor,
action, target, and normalized request payload. Replaying the exact request is
safe; reusing the key with different input returns an idempotency conflict.

## Runtime connection

VIPCore should read these tables through Swiftly's `portal` database
connection—the connection pointing to `PORTAL_DATABASE_URL`, not its normal
VIP membership database. A missing migration or unavailable portal connection
must fail closed for standalone perks without disabling normal VIP memberships.

VIPCore also heartbeats its currently registered feature keys for the selected
game server. Publishing and purchasing an offer requires a matching heartbeat
no older than two minutes. An enabled offer whose heartbeat is missing or stale
is shown as **Runtime unavailable** and stays out of the player storefront.
