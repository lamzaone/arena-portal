# Git push to FreakHosting

The workflow in `.github/workflows/freakhosting.yml` tests and builds on GitHub's
Linux runner. Pull requests produce a checked artifact; pushes to `main` also
upload and activate that artifact when deployment is enabled. You do not run npm
or build the site through the hosting terminal for each update.

This requires external SSH access with public-key authentication to the same
website account used by Enhance. A web-panel terminal alone does not establish
that GitHub can connect. The host must provide Linux x86-64/glibc (Ubuntu 22.04 or
newer is the build target), Bash, tar, curl, flock and same-user `/proc` access.
FreakHosting's Automatic mode supplies Node 24 to the application launcher.

Weapon model assets persist under `~/arena-portal/cache/weapon-thumbnail-assets` using a dedicated Chromium profile. Override with `WEAPON_THUMBNAIL_ASSET_CACHE_DIR`; separate concurrent portal processes need separate roots. Before startup, `npm run thumbnails:warm -- --models --profile=server` preloads all supported mesh generations without database access. The server profile must not be open during this offline preload. Ordinary inventory/catalogue warm commands use a separate profile and share the finished image cache.

Weapon thumbnails also require Chromium's Linux system libraries. CI includes
the matching headless browser in the runtime bundle; a host-provided Chromium
can be selected with `WEAPON_THUMBNAIL_BROWSER_PATH`. Generated WebP files live
in `~/arena-portal/cache/weapon-thumbnails`, outside release cleanup. Set
`WEAPON_THUMBNAIL_CACHE_DIR` to override that path. Before opening the updated
market, warm inventory images from the active release (the command only reads
the database):

```bash
cd ~/arena-portal/current
ARENA_HOSTING_ROOT="$HOME/arena-portal" PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" \
  node --env-file="$HOME/arena-portal/.env.production" --experimental-strip-types scripts/warm-weapon-thumbnails.mjs --inventory
```

Repeat with `--catalogue` for sample finish previews. Re-running either command
reuses completed images. Configure `CSFLOAT_API_KEY` to query listings matching
the selected seed and float; the UI labels unmatched fallback prices as estimates.

## One-time hosting setup

1. In your existing website home, retain `arena-portal` outside `public_html`.
   Create/fill `~/arena-portal/.env.production` from `.env.production.example`.
   Reuse the existing database URLs and integration secrets. This file stays on
   the host, outside release archives. Set its permissions to 600.
2. Authorize a dedicated SSH public key for this website user, through the panel's
   SSH key management or `~/.ssh/authorized_keys`. Keep its matching private key
   for the GitHub secret below. No root account or VPS is required.
3. Confirm the external hostname, SSH port and account username from FreakHosting.
   The shell prompt's `enhance-romania-node` name may be an internal hostname.
   Confirm the server host-key fingerprint using the provider or an already
   trusted SSH connection; save the matching `known_hosts` entry.
4. Before the first automated release, put the existing Node app in Manual mode.
   Initial switching from a source deployment has a short maintenance window.

## GitHub configuration

In `lamzaone/arena-portal`, open **Settings > Secrets and variables > Actions**.
Add these repository **secrets**:

| Secret | Value |
| --- | --- |
| `FREAKHOSTING_SSH_HOST` | External SSH hostname or IPv4 address |
| `FREAKHOSTING_SSH_PORT` | SSH port, or leave unset for 22 |
| `FREAKHOSTING_SSH_USER` | Website SSH user, e.g. `tapped_r1` |
| `FREAKHOSTING_SSH_KEY` | Dedicated private key, including BEGIN/END lines; usable without an interactive passphrase |
| `FREAKHOSTING_KNOWN_HOSTS` | Verified OpenSSH host-key line(s); nondefault ports use `[hostname]:port` |

Then add the repository **variable** `FREAKHOSTING_DEPLOY_ENABLED` with value
`true`. Without it the workflow only tests/builds and saves an artifact; it does
not contact the host. Optional public variables `SITE_URL`,
`NEXT_PUBLIC_SERVER_NAME` and `NEXT_PUBLIC_SERVER_CONNECT_URL` override the
defaults for `https://tapped.ro` and `ARENA.TAPPED.RO`. Keep `SITE_URL` consistent
with the runtime environment, and rebuild when changing public variables.

Production application secrets are not needed by the GitHub build. Database
migrations and DNS changes are not performed by this workflow.

## First run

1. Commit and push the prepared repository to `main`, including `.github` and
   `scripts/hosting`. In GitHub **Actions > FreakHosting**, watch the run.
   You can also use **Run workflow** on `main` after adding the secrets.
2. The first upload prints **First release staged**. It has installed the runtime
   and launcher but does not claim the application is live.
3. In the FreakHosting Node.js panel, set:

   | Field | Value |
   | --- | --- |
   | Node | 24 |
   | Working directory | `arena-portal` |
   | Startup command | `bash start-hosting.sh` |
   | Mode | Automatic (Production) |
   | Proxy | Enabled; path empty; port `3000` |

4. Start the app and check `https://tapped.ro/api/health` after the domain is
   pointed to FreakHosting. Before DNS cutover, check
   `curl --fail http://127.0.0.1:3000/api/health` from the website terminal and use
   the preview/hosts-file checks in [the deployment guide](freakhosting-deployment.md).
   Also verify Steam sign-in, database-backed pages and ServerLink heartbeats.

From then on, **push to main → test → build → upload → restart → health check**.
There is no manual build or panel restart for routine deployments. This supplies
automatic production deployment; it does not add Vercel preview domains or
guarantee zero downtime. A brief interruption can occur while Enhance restarts.

## Release layout and rollback

```text
~/arena-portal/
  .env.production             private runtime configuration
  start-hosting.sh            stable Enhance startup command
  app.pid                    current application PID
  current -> releases/<id>    atomic pointer to active release
  releases/<id>/             compiled app and Linux runtime dependencies
  shared/economy-custom/     staff-uploaded catalogue artwork
```

Only the portal PID owned by this website user and running in the expected
release is signalled. Enhance's Automatic mode restarts it using the new release.
The deploy step checks both the process's release directory and local health
endpoint. If the new process fails, it switches back, restarts and checks the
previous version, then marks the workflow failed. The health endpoint deliberately
does not verify databases or external services.

Successful updates keep the active and immediate previous release. Older release
directories and their matching archives are removed. Failed attempts are retained
for investigation until the next successful update cleans them. A succession of
failed uploads can still require cleanup if the account runs short of storage.
Uploads under `public/images/economy/custom` are shared across releases. Existing
files from the old source deployment are imported without overwriting newer
shared images. Back up both `.env.production` and `shared`, as well as databases.

If the deploy step cannot find the tracked app PID, it stops without switching
the active release. Check Automatic mode, the startup command, and
`~/persistent_app_<ID>.log`. The initial launcher is installed once; changes to
the launcher itself require replacing `~/arena-portal/start-hosting.sh` from the
new release and one panel restart.

## References

- [Enhance automatic Node process management](https://enhance.com/docs/website-tools/nodejs)
- [Next.js standalone runtime output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [GitHub workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
