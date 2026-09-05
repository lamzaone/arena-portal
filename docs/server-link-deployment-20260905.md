# ServerLink deployment — 2026-09-05

Portal Worker version: `547524aa-9500-433c-b9f0-dad3fa672a7f`.
The existing custom domain, Smart Placement, workers.dev URL, request-scoped
database wrapper, and resource bindings are retained. Existing secrets were
preserved; only the dedicated `SERVER_LINK_SECRET` was added.

Migration `027_server_link.sql` was applied to the portal database after saving
a schema-only backup at `D:/ARENA/.backups/server-link-20260905/portal-schema-before.sql`.
The migration creates one new empty snapshot table and changes no existing data.

The initial Windows-generated bundle returned HTTP 500 because its Turbopack
chunk-loader switches were empty. It was rolled back to working version
`8fc56d09-32de-424b-a313-2b5743313358`. The scoped path-normalization build fix
then generated 287 chunk cases per runtime. Local workerd checks passed before
the final deployment. A Webpack alternative was not retained because existing
CSS modules depend on Turbopack's global-selector handling.

Verification of the final deployment:

- Homepage, server status, and player-enrichment endpoints returned HTTP 200.
- Unauthenticated heartbeat POST returned 401.
- Authenticated invalid payload returned 400 without writing a fake snapshot.
- Live mobile browser: no horizontal overflow, page exceptions, or failed static assets.
- Build-workaround and request-scoped database tests: 9 passed.
- Local installed plugin DLL matches the verified Release artifact; shared export check passed.

Local upload sources:

- `D:/ARENA/addons/swiftlys2/plugins/TAPPED.ServerLink/`
- `D:/ARENA/addons/swiftlys2/configs/plugins/TAPPED.ServerLink/`

The private installed config is Git-ignored, contains the matching dedicated
secret, and has `Enabled: true`. The source template remains disabled and secret-free.
The user chose to perform SFTP upload themselves. No remote plugin/config write,
reload, restart, or map change was performed. Temporary SFTP password file was
deleted after stopping the read-only connection work.

The live status is correctly unavailable until a real accepted heartbeat arrives.
Live CS2 map changes, hibernation and player-profile enrichment remain checks to
perform after the user uploads the configured plugin. Do not report these as verified.
