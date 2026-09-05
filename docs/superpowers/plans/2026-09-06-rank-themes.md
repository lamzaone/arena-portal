# VIP and staff theme progression

Extend the existing trusted theme registry and inventory equip flow. Preserve the staged Staff UI work. Prepare and verify catalogue registration before adding the requested unlisted items. Do not deploy the site.

## Design

| Key | Group key | Color | Surface coverage | Effect level |
| --- | --- | --- | --- | --- |
| vip_silver | vipcore.silver | #c8d0df | Profile | 1: brushed metal, avatar frame |
| vip_gold | vipcore.gold | #ffd34d | Profile | 2: gilded lines, slow shimmer |
| vip_diamond | vipcore.diamond | #58b8ff | All four surfaces | 3: facets, illuminated cards, ambient light |
| vip_ultimate | vipcore.ultimate | #b46cff | All four surfaces | 4: aurora, orbit details, drifting motes |
| staff | admins_core.trial_staff | #b9bfd0 | Profile | 1: steel shield, structured grid |
| moderator | admins_core.guardian | #6ce5bd | Profile | 2: mint edge lighting, scan highlight |
| administrator | admins_core.enforcer | #ffb56a | All four surfaces | 3: amber beams, illuminated cards |
| senior_administrator | admins_core.overseer | #b192ff | All four surfaces | 4: violet orbit details and motes |
| owner | admins_core.director | #e60000 | All four surfaces | 5: crimson halo, layered crown, richest motion |

Colors and current display names verified with a read-only query of portal_identity_groups. User confirmed Owner is the endpoint; no Founder theme.

User clarification: create themes as unlisted items; the user will configure group rewards. Do not create or change any reward associations, memberships, or rank permissions. Keep catalogue items enabled for Staff administration but hidden from Market and public purchase. Existing inventory equip and manually configured group reward reconciliation handle ownership. Low tiers fall back to default for global, smallProfile, and playerContainer. Public player containers always belong to the represented player.

Use CSS gradients and source-controlled SVG previews, native components and existing semantic theme tokens. No added runtime dependency. Text remains readable; extra animation is decorative, slow, transform/opacity based, and disabled for reduced motion/forced colors.

## Tasks

- [x] Add behavioral registry coverage for the exact surface split, fallback, serialized manifest, preview availability, unique keys, and progression.
- [x] Add serializable rank catalogue and manifests in lib/themes; register all themes and trusted adornment/background renderers.
- [x] Build app/themes/ranks.css and local SVG previews with coherent but distinct treatments and accessible motion. Import before accessibility rules.
- [x] Add an idempotent migration for unlisted catalogue items and profile themes only; verify lifecycle integration and document registration.
- [x] Make theme selection describe coverage and visual features clearly using trusted metadata.
- [x] Verify typecheck, appropriate tests, production build, and browser coverage at mobile/desktop, including mixed player ownership, profile header fallback, reduced motion, forced colors, and color contrast.
- [x] Update theme documentation and review the combined change.

## Verification and registration

- Production build passes with 73 generated pages and no temporary preview route.
- Full npm test suite passes; two existing database integration cases skip without their dedicated test URLs. Theme tests: 5 registry and 10 entitlement cases.
- Actual shared-component fixtures: nine profiles and five global Staff themes at 375 and 1440px, no horizontal overflow and zero axe WCAG A/AA findings. Dialog cancellation/confirmation, notification display, settings selection, nine preview URLs, compact fallback boundaries, hover/selected ownership, reduced motion and forced colors checked. Fixtures removed before build.
- Theme token contrast checked against the brightest surfaces: supporting text minimum 5.98:1.
- Migration executed twice on isolated temporary tables cloned from the configured MySQL schema; verified idempotency and JSON types.
- Registered the requested nine unlisted catalogue items in the configured Portal database, IDs 1172634–1172642. Verified enabled/equippable definitions, unlisted metadata, correct surface arrays, preview files, and zero reward assignments. No site deployment.
- Added dist to TypeScript exclusions because generated deployment copies were being compiled against live source aliases.
