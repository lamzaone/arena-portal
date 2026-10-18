# Portal visual refresh implementation plan

**Goal:** Refresh the existing branded portal, expand its Features guide, expose accurate server presence and complete paginated histories, and prevent rapid duplicate actions while updating confirmed results.

**Architecture:** Keep Next App Router, semantic theme tokens and existing data ownership boundaries. Split homepage/Features, profile history/presence, Groups UI and shared action/motion work into independent changes; preserve the current uncommitted work. Run isolated browser fixtures against mocked storage and services, then typecheck and build the local release. No remote uploads or server connections.

- [x] Homepage and Features: reuse the Staff emblem and live server data, add public Discord count lookup with timeout/cache/unavailable states, organize verified systems into navigable sections, redirect legacy Modes links.
- [x] Profiles: public fresh server-roster presence, show-more warnings and moderation, independent server-side warning/ban/communication pagination; preserve profile privacy.
- [x] Groups: refine the existing assignments and full-width editor workspace, navigation, typography, selection context and responsive layouts without removing existing tag/perk management.
- [x] Actions: capture rapid repeated button/submit actions, coalesce identical economy requests for at least 500ms and throughout flight, refresh after mutation navigation commits, and poll authorized queued moderation jobs until confirmation before refreshing.
- [x] Shared visuals: theme-aware ambient lighting, translucent surfaces, artwork-only pointer depth, focus states and reduced-motion/performance guards across public/player/staff pages.
- [x] Verification: test duplicate requests, confirmation ownership and transitions; run relevant existing moderation/group/navigation tests, responsive browser fixtures, typecheck and production release build. Record any remaining limits in the handoff.
