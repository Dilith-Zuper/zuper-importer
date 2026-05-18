# Changelog

All notable changes to the Zuper Importer wizard are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The 0.x line is pre-stable — breaking changes may land in minor bumps.

## [Unreleased]

## [v0.4.0] - 2026-05-18

### Added
- Select-all / Deselect-all toggle on Step 3 Gutters and Siding brand tabs. Operates on the full brand list regardless of any active search filter.
- Step 4 Preview now offers two back-navigation links — back to product lines (step 4) and back to brand selection (step 3). The previous single button was mislabeled and only went to product lines.
- `toZuperCategoryName()` in `lib/category-norm.ts` — maps SRS category strings to Zuper-safe names (e.g. `TOOLS/SAFETY` → `Tools & Safety`, `GUTTER/ALUMINUM/COIL` → `Gutter, Aluminum & Coil`).

### Fixed
- Validation 400 Bad Request when specialty (non-pre-selected) product lines were included. Zuper rejected SRS category names containing forward slashes; the new sanitizer strips them and the lookup falls back to the raw SRS name for backward compatibility with accounts created by earlier wizard runs.
- Validate route silently returned an empty SSE stream when productIds grew past ~1500 entries. Supabase encodes `.in()` arrays into the URL; ~4000 IDs produced a 25 KB URL that exceeded PostgREST limits and killed the function before any catch could fire. Product fetch is now chunked into batches of 500 and only selects the `product_category` column.
- ChecklistItem detail line wraps (not truncates) on failed status so CSMs see the full Zuper response, not just the trailing fragment.

### Changed
- Validate route top-level catch hardened — `console.error` flushes to Vercel function logs and the enqueue/close calls are wrapped in try blocks since the runtime may tear down the controller before the catch fires.

## [v0.3.0] - 2026-05-14

### Added
- Idempotent upload — re-runs PUT existing Zuper products instead of POSTing duplicates; SSE stream emits `created` and `updated` counts.
- Pricing fallback at upload time — category-tier median applied to products with `suggested_price = null`, tagged `meta_data.label = 'Price Source'` so CSMs can identify estimated prices in Zuper.
- Brand-specific tier-upgrade rules (`lib/tier-upgrade-rules.ts`) — CertainTeed Best swaps to HT Ice & Water; OC Better/Best swaps to WoodStart Cool starter.
- Universal accessory catalog gaps filled — Bay Cities Counter Flashing (75999) and Stinger Plastic Cap NailPac (79219).
- Slope tokens and 8 slope-band formulas wired to service line items — proposals auto-calculate quantities from `Low Slope` / `Standard Slope` / `Steep Slope` / `Very Steep Slope` measurement tokens.
- SKU fetcher cross-link on Step 1 Connect.
- Zustand store persisted to localStorage (apiKey excluded for security).

### Changed
- Brands and product-lines APIs paginate with bounded concurrency (`mapWithLimit(5, ...)` in `lib/limit.ts`) — eliminates Supabase 1000-row silent cap.
- Color option_uid GETs batched after each upload batch (10 concurrent) — was a per-product N+1, ~30% faster on color-heavy catalogs.
- TTL cache for Zuper formula lookups (5-min, keyed by apiKey) — eliminates redundant pagination between Validate and Create-Proposals steps.

### Fixed
- Step3Brands and Step4ProductLines now render an error card with retry button instead of hanging on fetch failure.

## [Pre-history]

Earlier development (initial scaffold through 2026-05-13) covered the 9-step wizard, vendor catalog upload, CPQ proposal template creation, SSE upload stream, brand and product-line filtering, fuzzy brand search, and the full `DESIGN.md` design language. See `git log --before=2026-05-14` for granular commit history.
