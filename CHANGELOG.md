# Changelog

All notable changes to the Zuper Importer wizard are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The 0.x line is pre-stable — breaking changes may land in minor bumps.

## [Unreleased]

### Added
- **QXO catalog support** as an alternate data source alongside SRS.
  - New **Step 2: Source** screen — pick SRS Distribution or QXO; QXO requires a branch (621 stocking branches, searchable, grouped by region).
  - `catalogSource: 'srs' | 'qxo'` and `selectedQxoBranch` added to the wizard store; switching either clears all downstream selections so cross-contamination can't produce wrong uploads.
  - `lib/catalog-source.ts` — single switching surface for table names, column mappings, and the `getStockedProductKeys()` helper that scopes QXO queries to a branch's inventory.
  - `lib/qxo-accessory-catalog.ts` — 13 universal QXO product_keys (drip edge, underlayment, ice & water, vents, etc.) merged into every upload.
  - `app/api/qxo-branches/route.ts` — fetches branch directory with per-branch stocked-SKU counts.
- Source + branch-aware updates to existing routes: `brands`, `product-lines`, `preview`, `validate`, `upload`, `create-vendor`. For QXO the brand list and product-line list are intersected with the selected branch's stocked products via a chunked `qxo_branch_sku` join.
- `create-vendor` now creates a `QXO Inc` vendor record (Greenwich, CT billing address) when source=qxo instead of `SRS Distribution Inc`.
- Wizard step count grew from 10 to 11 — `Source` is inserted at position 2 and downstream steps shifted by one. Step labels, navigation links, and all `setStep()` call sites updated.

### Changed
- `WizardState.step` type widened to `1..11`; `filteredProductIds`, `UploadError.productId`, and `ProposalLineItem.product_id` accept `number | string` so QXO `product_key` strings flow through unchanged.
- `lib/brands-cache.ts` now keys its in-flight cache on `(catalogSource, branchNum, trade)` so SRS and per-branch QXO results don't collide.

### Known limitations
- QXO **proposal templates (Step 11)** intentionally not yet wired into the G/B/B engine. `proposal-preview` returns an `__unsupported: 'qxo'` marker; Step10Proposals surfaces this and lets CSMs skip. SRS-specific tier-upgrade rules, primary_item ordering, and brand-mapped accessory swaps need adapting before QXO can use the same template flow. CSMs can still upload the catalog + create the QXO vendor.

## [v0.4.1] - 2026-05-18

### Fixed
- Step 9 vendor creation no longer fails when an SRS vendor already exists. The route now looks up the vendor by name first; if found, it reads the existing catalog and POSTs only the new entries to `/vendors/{uid}/catalog`. Supports the workflow of importing roofing first then siding/gutters separately without touching the existing proposal templates.
- Top-level catch in `app/api/create-vendor/route.ts` now mirrors the validate route's pattern — logs to Vercel function logs via `console.error` and defensively wraps emit/close calls.

### Changed
- Step9Vendor UI surfaces whether the vendor was newly created or whether catalog entries were appended to an existing vendor, including a count of entries skipped because they were already present.

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
