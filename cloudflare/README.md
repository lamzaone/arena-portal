# Worker database request isolation

The production repair deployed on 2026-09-05 wraps the existing OpenNext Worker
with `request-database-scope.mjs`. MySQL pools belong to one request, remain alive
through streamed rendering, and close after completion, cancellation, or failure.
This avoids reusing sockets from a previous Cloudflare request. A failed database
session lookup previously looked like a logged-out user even with a valid cookie.

## Preserve the repair on future code deployments

Install dependencies with `npm ci`. In Cloudflare Workers Builds, set:

- Build command: `npm run build:cloudflare`
- Deploy command: `npm run deploy:cloudflare`
- Root directory: the directory containing this application's `package.json`
  (`/` when the repository contains only the portal).

`npm run build` remains the standard Next.js build. It produces `.next`, not
the `.open-next/assets` and `.open-next/worker.js` required by Wrangler.
`build:cloudflare` runs OpenNext, which invokes the Next.js build and then adapts
its output for Workers. `deploy:cloudflare` deploys that output and populates
the configured R2 cache. To build and deploy locally, use `npm run deploy`.

After generating `.open-next/worker.js` using `npm run build:cloudflare`, use
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
