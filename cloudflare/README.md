# Worker database request isolation

The production repair deployed on 2026-09-05 wraps the existing OpenNext Worker
with `request-database-scope.mjs`. MySQL pools belong to one request, remain alive
through streamed rendering, and close after completion, cancellation, or failure.
This avoids reusing sockets from a previous Cloudflare request. A failed database
session lookup previously looked like a logged-out user even with a valid cookie.

## Preserve the repair on future code deployments

After generating `.open-next/worker.js` using the existing OpenNext build, use
the repository's `wrangler.jsonc`: its `main` is `cloudflare/worker.mjs`, not
`.open-next/worker.js`. Preserve the existing asset, R2, image, self-service,
secret, and Access bindings. Do not upload `.env.local` to production: it has
local URLs and obsolete settings.

`lib/data/database-pools.ts` sets `disableEval: true` for Workers-safe result
parsing. The live database URL secrets also include `disableEval=true`; credentials
were not rotated. No session secret, cookie lifetime, or auth permissions changed.

Run `npm run test:worker-database` to test overlapping requests, streaming, cleanup,
and cookie-preserving redirects. Run `npm run typecheck` for the application.
Live smoke checks must inspect non-empty database data, not only HTTP status codes.
An actual Steam sign-in must still be checked in the user's browser.

Production request-scope version: `2041770f-7465-4429-8b6f-4c97c612dae3`.
Prior version: `097b05ea-4a2a-4ae9-94d2-8eab7eff2a9d` (parser fix only; shared pools).
The production repair reused the deployed bundle and kept all 19 resource/secret
bindings and existing static assets. Local source changes have not been pushed.
