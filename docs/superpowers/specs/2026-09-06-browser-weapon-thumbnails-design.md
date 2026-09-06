# Browser-generated weapon thumbnails

**Superseded:** The user requested normal previews again. The browser renderer
and its proxy/cache routes were removed; this document records the prior design.

## Behavior

Market and inventory cards display normal catalogue artwork immediately. Existing
server snapshots and locally saved images are checked in parallel. Missing exact
images enter one sequential browser renderer after a short grace period for the
server cache lookup. The card switches only after the matching image loads.

The normalized identity includes weapon, finish, float, seed, mesh generation,
StatTrak (false is distinct from zero), name, all sticker transforms and charm.
Changing that identity mounts a new subscription; old responses cannot replace
the new selection. Unknown catalogue float/seed values keep normal artwork.
The desktop grid remains five columns by four rows.

## Renderer

The installed SkinHub SDK documents a mirror/proxy origin in its README under
“Pointing at your own instance.” Its standard embed does not export images.
This integration caches the public frame and resources and injects an export
bridge before the frame starts. It remains dependent on SkinHub's public viewer,
materials and runtime structure; it is not an independent CS2 shader engine.

The frame's item query lives in its URL fragment. The bridge adapts the cached
Next Flight document's `FrameViewer` search prop, keeps isolated in-memory
preferences, requests WebGL with a preserved drawing buffer, and exports the
completed canvas as a transparent 640×360 WebP. DOM controls are not part of the
canvas image. Float/seed changes reuse the loaded viewer; model, StatTrak/name or
attachment changes recreate it to avoid retaining the previous framing/state.

The parent checks the viewer's full item identity and readiness. The bridge also
waits for the canvas fade to finish and rejects blank images. Failed resource
loads reject the snapshot, preserving catalogue art rather than saving a partial
weapon. Rendering pauses after capture, and the idle viewer is removed after
30 seconds. Navigation aborts jobs with no remaining subscribers.

## Cache and isolation

- Shared hosting stores public viewer assets in `cache/weapon-viewer-resources`
  under `ARENA_HOSTING_ROOT`, or `.cache/weapon-viewer-resources` locally. It has
  a 1 GiB budget, four concurrent upstream downloads, a bounded queue, 64 MiB
  maximum resource size, atomic publication and stale-on-error reuse. Resources
  expire after one day and the template after six hours.
- The parent's browser CacheStorage stores model/texture data for one day, up
  to 256 MiB/256 entries. Opaque frames request these bytes by message because
  browser HTTP caches may partition resources between sandbox instances.
- Finished WebPs stay in the visitor's browser, up to 128 images/64 MiB for seven
  days. Memory holds at most 64 identities and revokes unused blob URLs on eviction.
  These client images are never uploaded into the shared authoritative cache.
- The frame uses `sandbox="allow-scripts"` and an HTTP CSP sandbox, with no
  same-origin privilege. It cannot access portal cookies, storage or the parent
  DOM. CSP confines resource requests to the asset routes and blocks forms.
- Asset messages require the exact frame window and opaque origin. Only fixed
  local asset URLs are accepted. The backend permits fixed SkinHub hosts and
  public asset directories, omits credentials and rejects redirects and HTML
  error pages. Executable asset responses also have a sandbox CSP for navigation.

Storage is optional. Eviction/private-mode failures fall back to normal fetching
and in-memory images. Provider outages and unsupported devices retain normal
artwork and any existing server snapshot. Server inventory prewarming is opt-in
through `WEAPON_THUMBNAIL_PREWARM_ENABLED=true`; browsing never queues server renders.

## Validation and limits

Real Chromium/GPU checks cover AK-47 Case Hardened at seeds 661/2 and floats
0.02/0.65, warm-versus-fresh pixel comparison, StatTrak zero, a name, a rotated
sticker and charm, removal of all attachments, Karambit, custom Glock-18 Case
Hardened and M4A1-S. Warm/fresh images and attachment removal matched exactly in
the tested runs. This verifies agreement with the integrated SkinHub rendering
path, not pixel-for-pixel equivalence to Valve's inventory lighting.

On the development Windows GPU with backend assets already cached, initial
browser renders took around 4–5 seconds; a new seed/float in the warm renderer
took around 0.25 seconds. Different models and attachments took around 2–4
seconds. Fully cold assets, slower GPUs and networks can take longer. The fast
page path is the immediately visible catalogue art and cached static images;
there is no one-to-two-second guarantee for all new exact renders.

The twenty-card Chromium fixture using the built Next routes showed normal art in
291 ms, completed all twenty new exact images in 11.47 seconds, and restored all
twenty saved images after reload in 260 ms. Only one renderer existed, and it was
paused after capture. Changing seed after reload fetched no additional model or
texture files. This is a local component/renderer benchmark with fixture inventory
and catalogue-image responses, not a measurement of the complete tapped.ro page
and production database. A separate provider-outage/shared-image fixture retained
normal artwork, handled failed saved images and rejected late old-seed responses.

Unit tests exercise queue deduplication, cancellation, stale subscribers, failures,
object-URL disposal, fixed-path validation, bounded downloads/cache eviction and
stale asset reuse. Browser checks additionally exercise sandbox isolation and
the image/asset caches. Run `npm run test:thumbnails`, `npm run typecheck` and
`npm run build:hosting` before release.

Provider updates can change Flight/bootstrap details or introduce asset paths.
Such failures retain normal artwork; update the adapter and bump browser cache
versions when changing the renderer's output or asset compatibility.
