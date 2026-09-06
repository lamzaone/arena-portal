# Item grid layout implementation plan

**Goal:** Apply the user's revised five-column, four-row layout to item collections. Desktop pages hold 20 items; narrow containers use fewer columns and at most four rows.

**Architecture:** Share a container-width layout hook and a paginated grid for local collections. Keep server pagination in charge of remote collections, requesting the measured page size. Preserve filters, item selections, quote validation, and inventory actions.

**Tech stack:** Existing React, Next.js, CSS, Node tests, and Playwright.

- [x] Add shared layout calculation, responsive measurement, and client pagination.
- [x] Adapt market and profile inventory server pagination.
- [x] Adapt inventory, loadout, trade, crate contents, and staff item pickers.
- [x] Check narrow and wide layouts, pagination reachability, filtering, and existing market/inventory regressions.

This change is limited to item collection layouts. It does not change drop odds, prices, ownership, or purchase behavior.

Verified with the full portal test suite, six layout/API regressions, and actual-component Playwright checks for market, inventory, profiles, loadouts, trade, crate contents, and staff pickers. Inventory keeps its editor and unsaved sticker placement across resizing; staff returns preserve page size and recover when the final page becomes empty.
