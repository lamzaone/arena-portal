# Profile groups and custom badge symbols

Additional group badges now sit directly below the player name, before server status and account metadata. Compact, color-matched symbols keep the row readable across profile themes and phone widths. The primary group remains attached to the avatar.

The shared catalogue has 42 symbols, including owner, leadership, headquarters, secretary, administrator, senior staff, trial staff, moderator, mentor, helper and player options. Profiles and staff cards use the same renderer.

Founders can choose a preset or upload a custom symbol for each group in **Admin > Groups > Edit identity & badge > Badge presentation**. The same picker is available when creating a custom group. The visual browser previews presets, and selecting one clears a pending image upload. Existing custom symbols are retained unless replaced.

Uploads accept still PNG, WebP and JPG images up to 256 KB and 512 x 512 pixels. A transparent PNG is recommended. The server validates the actual image and converts it to a metadata-free, 128 x 128 PNG. Stored symbols are immutable and deduplicated. Missing custom images fall back to the standard role symbol.

## Deployment

Apply `db/045_custom_group_badge_symbols.sql` to the **portal database** before enabling custom uploads on the hosted site. It adds `portal_group_badge_symbols`; existing group tables keep their current `badge_icon_key` column and assignments. The PNG bytes are stored in this database, so they survive application rebuilds and do not require writable hosting directories. Include this table in portal database backups.

If the table is unavailable, custom uploads return a clear error without changing the group. Preset selection and profile styling work independently of the new table.

Migration 045 was applied to the configured hosted portal database (`s6702_portal`) on 2026-10-18 at 15:47:47 UTC. Verification confirmed all four columns, the primary key, ASCII binary identifier collations and the InnoDB engine. The new table was empty after creation. Existing group records were not modified. Application deployment remains separate.

## Verification

- `npm run test:groups`: 42 passed, including upload normalization, bounded forms, authorization, persistence and public image responses.
- `npm run test:portal-ui`: 137 passed, including responsive profile ordering and picker selection/upload behavior.
- `npm run typecheck`: passed.
- Production release build: passed.
- Independent code review: no actionable findings.
