# Portal workspace upgrade

**Goal:** Preserve portal capabilities while centralizing access control, improving staff workflows, and adding recruitment and profile moderation.

**Architecture:** Reuse the existing Next.js server components, authenticated form handlers, Arena membership authority, and theme tokens. Group workspaces select a type and definition, then show that group's membership ledger alongside its configuration. New durable records use additive portal migrations.

**Constraints:** Local implementation and verification only. Preserve permission, immunity, CSRF, scope, exact membership reference, and expiry checks. Do not contact or upload to the CS2 server. Build and stage any changed runtime plugin under `D:/ARENA/addons/swiftlys2/plugins`.

- [x] Centralize Admin, VIP, and Custom definitions and member actions. Preserve legacy URLs. Add inline group tags and a custom tags/permissions/perks workspace.
- [x] Add recruitment settings, application storage, staff review, and compact themed staff cards.
- [x] Add case filters and priorities, with active punishments above player case history.
- [x] Expose secure marketplace batch refresh and repair inventory cards/search.
- [x] Separate bans and communications in navigation and routes.
- [x] Add permission-aware profile moderation, exact group management entry points, and available gameplay statistics. Extend and stage the server bridge for new actions.
- [x] Run behavioral tests, typecheck, production build, browser checks, and a code review; document migrations and staged runtime artifacts.
