# Render deployment

The portal deploys to Render as a full Node.js web service. Keep the existing
Cloudflare Worker and DNS records live until the Render service passes its
`onrender.com` smoke checks. Keep the Worker deployment intact during the DNS
cutover so it remains available for rollback.

## Create the service

1. Push this repository, including `render.yaml`, to GitHub.
2. In Render, choose **New > Blueprint** and connect
   `lamzaone/arena-portal`.
3. Confirm the `arena-portal` web service uses the Free instance in Frankfurt.
4. Supply every environment variable that Render prompts for. Copy values from
   the current secret source; secret values cannot be recovered from Cloudflare
   after upload.

Required prompted values:

- `SESSION_SECRET`
- `SERVER_LINK_SECRET`
- `GAME_DATABASE_URL`
- `PORTAL_DATABASE_URL`
- `STEAM_WEB_API_KEY`
- `PORTAL_BRIDGE_ENABLED` (`true` only when TAPPED.PortalBridge is installed)
- `ECONOMY_PRICE_REFRESH_SECRET`
- `CSFLOAT_API_KEY` (leave empty when no key is used)

Do not paste `.env.local` into source control. Both MySQL hosts must accept
connections from Render's Frankfurt outbound ranges. After creating the
service, open **Connect > Outbound** in Render and copy every listed CIDR range
into the database firewall allowlist. These ranges are shared by services in
the region, so database usernames and passwords remain the authentication
boundary. Do not open MySQL to all internet addresses when the database host
supports CIDR allowlists.

The build command temporarily disables the in-process economy refresh while
Next.js compiles. The service environment enables it again for the running Node
process. Render checks `/api/health`, which deliberately performs no database or
external API calls.

## Verify before DNS cutover

Wait for the deployment to become Live, then use the assigned `onrender.com`
URL to check:

- `GET /api/health` returns HTTP 200 and `{"status":"ok"}`.
- The landing page renders and `/api/server-status` returns a valid snapshot.
- Ranking and a player profile contain database data.
- Render logs contain no MySQL connection, missing-variable, or restart loop
  errors.

Steam sign-in redirects to `SITE_URL=https://tapped.ro`, so authenticated
inventory testing belongs immediately after the DNS cutover. Do not change the
production value to the temporary Render hostname.

## Move `tapped.ro`

`tapped.ro` is currently a Cloudflare Worker Custom Domain declared in
`wrangler.jsonc`. Cloudflare owns its generated DNS record, so a Render CNAME
cannot coexist with that attachment.

1. Add `tapped.ro` as a custom domain in the Render service settings, but do
   not request final verification yet.
2. Disable or disconnect automatic production deployments for the
   `arena-portal` Cloudflare Worker. A later Wrangler deployment with the
   current `routes` entry would otherwise reattach the Worker Custom Domain.
3. In **Workers & Pages > arena-portal > Settings > Domains & Routes**, remove
   the `tapped.ro` Custom Domain. Keep the Worker and its deployment intact for
   rollback.
4. In Cloudflare DNS, create a CNAME named `@`
   whose target is the service's `onrender.com` hostname.
5. Remove any apex `AAAA` record. Render currently accepts IPv4 traffic only.
6. Set the new CNAME to **DNS only** while Render verifies the domain and issues
   its TLS certificate. Keep Cloudflare SSL/TLS mode set to **Full**.
7. Return to Render and verify the custom domain. After Render reports the
   certificate as valid, test `https://tapped.ro` and
   optionally enable Cloudflare proxying again.

After the Render cutover is accepted, remove the `tapped.ro` custom-domain
entry from `wrangler.jsonc` before enabling any future Cloudflare Worker builds.
Keeping the dormant Worker is sufficient for rollback; it does not need the
domain attached while Render is serving production.

After cutover, test Steam sign-in, inventory reload and in-app navigation,
loadout, market, player hover cards, and the live terminal. Confirm new
ServerLink heartbeats appear in Render logs and that the panel updates within
the configured heartbeat interval.

## Roll back

If authenticated or database-backed checks fail, delete the Render CNAME and
reattach `tapped.ro` under the Cloudflare Worker's **Domains & Routes**. Restore
the `wrangler.jsonc` custom-domain entry if it was already removed, then
re-enable Cloudflare automatic deployments if desired. The Worker deployment
remains available because this migration does not delete or replace it. DNS
caches can take several minutes to reflect either change.

References: [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app),
[Render Free limitations](https://render.com/docs/free), and
[Cloudflare DNS configuration for Render](https://render.com/docs/configure-cloudflare-dns),
[Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses),
and [Cloudflare Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
