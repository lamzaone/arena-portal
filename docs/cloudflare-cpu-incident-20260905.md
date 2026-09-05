# Cloudflare CPU incident — 2026-09-05

Status: cause of the reported 1102 confirmed; remediation pending confirmation
of the Workers subscription. No subscription or production runtime settings
were changed during this investigation.

## Matching request

Cloudflare Workers observability matched the user's Ray ID:

| Field | Value |
| --- | --- |
| Ray ID | `a36474de2d404b1e` |
| Time | `2026-09-05 10:12:36.210 UTC` |
| Worker | `arena-portal` |
| Version | `9d97cd89-7c86-497c-b7c8-832551f11523` |
| Request | `GET /inventory` |
| Status | `503` |
| Outcome | `exceededCpu` |
| CPU time | `16 ms` |
| Wall time | `38 ms` |

The same query window, September 5 from 09:45 to 10:18 UTC, contained 23
`exceededCpu` invocation records. Affected paths included `/`, `/inventory`,
`/loadout`, `/market`, `/players/...`, `/admin/groups`, `/api/server-status`,
and `/api/image`. Both ordinary page requests and Next.js RSC navigation
requests failed. Several invocations terminated at 10 ms; others consumed
more CPU before termination. Cloudflare documents limited flexibility for
occasional CPU overruns, so a successful request above 10 ms does not establish
that the account has Workers Paid.

## Configuration and interpretation

The deployed version and Worker settings use the `standard` usage model and
do not report a custom CPU limit. `standard` alone does not identify the
subscription tier. The connected API can read Worker configuration and logs,
but the account subscriptions endpoint rejected the read with an authentication
error. The 10 ms failures strongly suggest Workers Free, pending account-owner
confirmation.

Cloudflare documents 10 ms of CPU per HTTP request on Workers Free and a
30,000 ms default on Workers Paid. Network/database waiting is excluded from
CPU time. The matching request therefore establishes CPU exhaustion; changing
SQL connection timeouts would not address this particular failure.

There were also isolated network-loss and hung-request log messages in the
window. Their cause has not been established. Recheck them after resolving
the CPU allowance rather than assuming every page error has the same cause.

## Remediation and verification

1. Confirm the account's Workers subscription. If Free, enable Workers Paid
   through account billing with the owner's approval of the recurring charge.
   Current published pricing starts at USD 5/month plus applicable usage.
2. Check the Worker's effective CPU limit after the plan change. The Paid
   default of 30,000 ms provides substantially more headroom than the observed
   failed requests; no maximum-limit increase is indicated by this evidence.
3. Test signed-in `/inventory` with a reload and with in-app navigation, then
   exercise player profiles, market, loadout, and the live server panel.
4. Query new invocation logs for `exceededCpu`, `exceededMemory`, and application
   errors. A successful response without authenticated inventory data is not
   sufficient verification. Diagnose any remaining errors separately.

Sources: [CPU and memory limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
