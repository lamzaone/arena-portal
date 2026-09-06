# Browser weapon thumbnail implementation

**Superseded:** Normal catalogue previews were restored at the user's request.
The browser rendering integration was removed after the implementation below.

**Goal:** Generate missing exact item images on the visitor's GPU, with reusable
cached viewer assets and static images in the grid.

**Architecture:** SkinHub documents a proxy/mirror origin. A local prototype has
successfully exported its WebGL canvas from an opaque sandbox. Serve that frame
and public resources through a restricted cache, install an isolated capture
bridge, and reuse one sequential browser renderer. This remains a SkinHub-based
integration, not an independent CS2 shader implementation.

**Spec:** `../specs/2026-09-06-browser-weapon-thumbnails-design.md`; this tested
proxy route replaces its previously unresolved SDK dependency.

**Constraints:** Shared Node webhosting; no external messages or new services;
preserve exact identity, normal-art fallback and five-column/four-row grid. The
frame gets scripts only, never same-origin privileges. No client snapshot uploads.

- [x] Resource cache and frame route: test fixed-host/path validation, no redirects
  or forwarded credentials, maximum sizes, coalescing, restart reuse, eviction,
  upstream failure fallback, executable-resource response restrictions and CSP.
- [x] Browser bridge and renderer: test opaque origin, canvas export, paused idle
  rendering, message source/request checks, full identity, abort/timeout cleanup,
  float/seed updates and fresh navigation for model/attachment changes.
- [x] Local image cache and queue: test deduplication, sequential rendering,
  cancellation, persistence failure fallback, stale subscribers and URL cleanup.
- [x] Wire owned cards to existing server cache plus browser generation on a miss.
  Keep normal images until an exact image loads; no server render request from
  browsing. Preserve cached server images as a fallback.
- [x] Real-browser accuracy and loading checks, 20-card cache reuse, opaque-frame
  security checks, thumbnail tests, TypeScript and production hosting build.
- [x] Update deployment docs and the design with measured results and limitations.

Validation: 123 thumbnail tests pass; TypeScript and the hosting production build
pass. Real Chromium checks exercise the built proxy/frame routes, one renderer,
GPU pause, twenty static images, persistent asset and image cache hits, rapid
selection changes, desktop/mobile layout and provider-outage/server-cache fallback.
