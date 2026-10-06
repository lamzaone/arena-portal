# Economy price coverage

Checked on 2026-10-06 against Skinport's public EUR feeds. The attached
[phase price audit](economy-phase-prices-2026-10-06.csv) contains the base prices
before the portal's existing float adjustment and sellback multiplier.

Of 729 supported Doppler/Gamma Doppler phase, exterior and StatTrak combinations,
669 had a matching quote: 451 historical medians and 218 listing/suggested prices.
307 of 352 StatTrak combinations were priced. The remaining 60 combinations
(45 StatTrak and 15 normal) had no verified phase-specific public quote at the
time of the check. Blank CSV prices mean no quote; they do not mean zero value.
Prices change, so this file is evidence of coverage on this date rather than a
permanent price list.

The resolver uses the same phase, exterior and StatTrak identity throughout:

1. Skinport historical median (30 days, then 90 days, then 7 days).
2. Skinport listing median, mean or suggested price.
3. Skinport out-of-stock average when recent sales exist, otherwise suggested price.
4. Existing approved snapshots and other supported providers, subject to the
   resolver's variant safeguards.

Missing rare phases remain unavailable when no verified quote or approved
variant price exists. The resolver does not substitute a different phase or a
normal knife's price for a StatTrak knife. Existing staff price controls retain
an explicit normal-item override; StatTrak requires a matching provider or
variant-cache quote.

Configure `CSFLOAT_API_KEY` on the portal host to enable special-pattern listing
lookups during pricing. Listings must match the weapon, paint kit, StatTrak
status and paint seed. An exact float match is preferred; a listing with the
same seed and exterior can provide a clearly labelled, float-adjusted estimate.
These seed-specific quotes are excluded from the reusable exterior price cache.
Without the key, ordinary phase/exterior prices still work, but they do not
establish a blue-gem, Fade or other seed premium.

Automatic catalogue display prices are already float-adjusted and do not carry
an exterior identity. They are not reused as another item's base price. Matching
variant caches keep the unadjusted base and its market name/version; the selected
float adjustment is applied once. A cache with an outdated phase identity is
ignored until a price refresh replaces it.

After deploying the portal, use the existing staff price refresh in
`/admin/items` to warm all legal exteriors and their StatTrak variants. The
automatic refresh uses the same warmer. Existing stored prices are not rewritten
by this local code change. The Glock Gamma Doppler phase correction also lives
in the shared manifest embedded in the Inventory plugin; upload the staged
`addons/swiftlys2/plugins/TAPPED.Inventory` files with the portal update.

Sources: [Skinport history](https://docs.skinport.com/sales/history),
[items](https://docs.skinport.com/items),
[out-of-stock sales](https://docs.skinport.com/sales/out-of-stock), and
[CSFloat API](https://docs.csfloat.com/).
