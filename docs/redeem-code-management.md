# Redeem-code management

Open `/admin/redeem` with economy staff access.

- **Restart code** resets its claim count to zero and makes it live. The same code, rewards and global usage limit remain; everyone can claim again, including previous claimants.
- **Remove code** hides it from the campaign list and stops future claims. Its text can be reused when creating another campaign.
- Both actions require confirmation. Previously awarded items/tokens and redemption history are retained.
- Selected reward quantities can be typed directly, with optional plus/minus buttons. Limits remain 1–50 per item, 20 distinct rewards and 100 items total. Item names wrap in the catalogue, selected rewards and saved campaigns.

Restart creates a new campaign ID transactionally and archives the previous campaign. Server claim operation keys include the locked campaign ID, so retaining old reward audit entries does not block a new claim cycle.

Deployment requires the portal application update and the updated `TAPPED.Inventory` plugin loaded by the game server. Migration `db/031_redeem_code_management.sql` adds a nullable archive timestamp and is safe to reapply; portal schema initialization also handles this column. No migration restarts or removes an existing code.

Validation commands:

```powershell
# Optional isolated MariaDB instance; tests create and remove their own unique database.
$env:TAPPED_REDEEM_TEST_DB='mysql://root@127.0.0.1:33319'
npm run test:redeem
npm run test:redeem:browser
npm run build
```

Without `TAPPED_REDEEM_TEST_DB`, the database integration cases are skipped. The browser fixture renders the actual component, dialog and global styles at desktop and mobile widths; navigation and thumbnails are stubbed.
