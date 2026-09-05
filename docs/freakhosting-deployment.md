# FreakHosting deployment

This page describes manual source uploads. For automatic deployment on Git pushes,
use [the GitHub Actions setup](freakhosting-cicd.md), which builds on GitHub and
uses `bash start-hosting.sh` as the panel startup command.

arena-portal serves its frontend, server-rendered pages, and API routes from one
Next.js Node process. The CS2 plugins stay on the game server and communicate with
the existing databases and portal HTTPS endpoints.

## Upload and build

1. Enable website SSH access in FreakHosting if it is not already available.
   Node dependencies and the production build must be installed/run on Linux.
2. Upload and extract `arena-portal-freakhosting-source.zip` into a private
   directory named `arena-portal` under the website user's home, outside
   `public_html`. Alternatively clone this repository into that directory.
   `package.json` must be directly inside `arena-portal`, not another nested folder.
3. Copy `.env.production.example` to `.env.production` there and fill in its values.
   Do not upload `.env.local`, Windows `node_modules`, `.next`, or `.open-next`.
4. As the website SSH user, select Node 24 and build:

   ```sh
   cd ~/arena-portal
   nvm install 24
   nvm use 24
   npm ci --include=dev
   npm run build:hosting
   chmod 600 .env.production
   ```

If `nvm` is unavailable, Enhance documents running
`/usr/bin/install_nvm_and_node.sh` as the website user and logging out/back in.
Ask FreakHosting to enable SSH/build access if it is unavailable on your account.
The upload archive contains source: extracting it alone does not install or build
the application. A build killed for memory requires a higher build allowance or
a compatible Linux build environment; don't upload Windows native dependencies.

`--include=dev` is required for TypeScript and build tooling even in production.
`build:hosting` turns off economy refresh only while compiling; runtime uses the
value in `.env.production`. Set public variables before building, since Next.js
embeds `NEXT_PUBLIC_*` values into the build. The generic `npm run deploy` alias
has been removed; the old target remains explicitly available through
`npm run release:cloudflare`.

## Production configuration

- Use `SITE_URL=https://tapped.ro` for the final deployment and enable HTTPS.
  Steam sign-in returns to this configured origin.
- Copy the actual existing `GAME_DATABASE_URL` and `PORTAL_DATABASE_URL`.
  Keep the current databases for this host move; don't replace them with empty
  databases from the new web hosting account or rerun migrations automatically.
  Both database hosts must allow the web application's outbound IP.
  If the database hosts differ from the web host, `localhost` is not their address.
- Preserve `SESSION_SECRET`, the plugin's matching `SERVER_LINK_SECRET`, the
  existing Steam/CSFloat keys, and the configured bridge enablement value.
  Secret values are supplied on the host, not committed or included in the ZIP.
- Start with `DATABASE_CONNECTION_LIMIT=5` (up to five connections per database
  per process). Keep the documented table-scoped database permissions in README.
- Keep `ECONOMY_PRICE_REFRESH_ENABLED=true` in Automatic mode. If an external cron
  already calls `/api/cron/economy-prices`, choose one scheduling method; disable
  the in-process worker when keeping the external scheduler.
- Existing bootstrapped identity groups are database-authoritative. Optional
  `D:/ARENA/...` identity seed paths from a development environment do not exist on
  this host and should not be copied into its configuration.

The database needs the schema required by this checkout, including ServerLink
migrations 027 and 028. Verify the existing deployment's migration record; this
hosting preparation does not apply SQL or change plugin configuration.

## Enhance panel settings

Under **Websites > your website > Advanced > Node.js > Deploy app**, configure:

| Setting | Value |
| --- | --- |
| Node version | 24 |
| Working directory | `arena-portal` (relative to the website user's home) |
| Startup command | `npm run start:hosting` |
| Mode | Automatic |
| Enable proxy | Enabled |
| Proxy path | Entire website; leave the path empty |
| Proxy port | `3000` |

The startup command listens on `0.0.0.0:3000`. If you need another port, use
`PORT=3001 npm run start:hosting` and change the proxy port to 3001 as well.
Do not put `PORT` in `.env.production`; Next.js selects its listen port before
loading that file. Use the primary domain for the app; redirect aliases to it.

Automatic mode starts and restarts the process. After an update, switch to Manual
and back to Automatic to restart it. Logs appear in the website user's home as
`persistent_app_<ID>.log`. A restored website backup requires the Node app to be
deployed again. No PM2 or Docker setup is needed for this deployment.

## Verify and move the domain

Before changing public DNS, start the app and check from website SSH:

```sh
curl --fail http://127.0.0.1:3000/api/health
```

Expected: HTTP 200 and `{"status":"ok"}`. This checks the process, not the database.
Use a preview domain if the host provides one, or a local hosts-file override to
test `tapped.ro` against the new web IP with valid TLS. Check the home page,
ranking/profile data, assets and `/api/server-status`, plus logs for database
connection errors. Normal public Steam sign-in continues to use the current
`SITE_URL` until the domain is moved.

For the final cutover:

1. Configure `tapped.ro` as the primary domain on FreakHosting and obtain a valid
   certificate using the host's supported issuance flow.
2. If `tapped.ro` is still a Cloudflare Worker Custom Domain, disable its automatic
   production deployments and detach that Custom Domain before adding the new
   DNS record. Its generated record cannot coexist with the new destination.
   Keep the old deployment available for rollback.
3. At the current DNS provider, point the domain to the web IP supplied by
   FreakHosting; update/remove obsolete A/AAAA records. A nameserver transfer is
   not required. If proxying through Cloudflare, use Full (strict) with a valid
   origin certificate.
4. Verify public HTTPS, Steam login, inventory/market, staff authorization, live
   terminal, and fresh ServerLink heartbeats. With the same domain and shared
   secret, the plugin continues posting to the same URL.

If checks fail, restore the previous DNS/domain attachment. Host deployment and
DNS changes are separate from preparing this repository.

For subsequent updates, stop the app using Manual mode, upload the new source
while preserving `.env.production`, run `npm ci --include=dev` and
`npm run build:hosting`, then return to Automatic and repeat the checks. This
in-place update has downtime; retain a previous release for rollback.

## References

- [FreakHosting web panel](https://help.freakhosting.com/portals/web-panel/web-panel-overview-and-dashboard)
- [Enhance Node.js settings and process management](https://enhance.com/docs/website-tools/nodejs)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
