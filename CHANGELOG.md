# Changelog

All notable changes to the Zuper Importer wizard are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The 0.x line is pre-stable — breaking changes may land in minor bumps.

## [Unreleased]

### Fixed
- QXO G/B/B proposals failed with "No eligible roofing brands found within selected product lines" for every brand. Two bugs in `app/api/proposal-preview/route.ts` from the v2 generalization (`2073b6d`): (1) the non-SRS select strings hardcoded `product_category`, which doesn't exist on `qxo_products` — PostgREST errored, the error was swallowed, and every query returned null; (2) the roofing filter matched `category_norm IN ('SHINGLES', …)` against QXO's free-text categories ("Architectural shingles"), which can never match. The category column is now aliased per source (`product_category:category_norm` for QXO), QXO filters roofing CPQ membership by `proposal_line_item IN CPQ_COMPONENTS` instead, and all three proposal-preview Supabase queries now log errors instead of silently skipping brands.
- ABC/QXO proposals no longer skip ~7 accessory line items per option. The per-tier accessory differentiation in `app/api/proposal-preview/route.ts` picked accessories by `accessory_tier` from the whole catalog, but only the fixed `ABC_ACCESSORY_PRODUCT_IDS` list is uploaded, so the per-tier picks weren't in Zuper and were skipped by create-proposals. The per-tier query is now constrained to the uploaded accessory set (`.in(productPk, accessoryIds)`), matching the base universal-accessory map. ABC/QXO accessories are now shared across Good/Better/Best (as SRS already is); restoring price tiering needs the accessory catalog expanded to multiple products per slot.

## [v0.6.0] - 2026-06-05

### Added
- **G/B/B proposal templates now work for ABC + QXO (v2).** `app/api/proposal-preview/route.ts` was generalized from SRS-only to source-agnostic. The bail with `__unsupported` is gone for both ABC and QXO; the engine builds full Good/Better/Best packages per brand. Three structural changes:
  - **Table-agnostic queries** — every `srs_products` hardcoding now uses `cfg.tables.products` + `cfg.cols.productPk` + `cfg.cols.brand` + `cfg.cols.category`. Same code path runs for SRS, ABC, and QXO.
  - **`primary_item` substitute** — SRS keeps its curated `primary_item` DB column. ABC and QXO use a new `lib/flagship-lines.ts` helper that intersects `product_line` strings with curated regex patterns per brand (e.g. GAF `timberline (hd|hdz|uhdz|natural shadow)`, CertainTeed `Landmark`, OC `Duration|Oakridge|Trudefinition`). Picked via the wizard's running dev server against the abc_products materialized view.
  - **`accessory_tier`-driven G/B/B differentiation** — for ABC and QXO, the universal accessory map is rebuilt per proposal tier by querying `accessory_tier = good_accessory` / `better_accessory` / `best_accessory` and ordering by suggested_price asc (or desc for Best). Good packages get cheaper accessories, Best packages get premium ones — making the three tiers actually differ on price. SRS keeps its single curated accessory map per the user's v2 decision.
- New `lib/flagship-lines.ts` — `FLAGSHIP_PATTERNS: Record<CatalogSource, Record<brand, RegExp[]>>` plus `isFlagship(source, brand, productLine)`. QXO entries are a v2.1 follow-up once product_line patterns are spot-checked.
- `lib/catalog-source.ts` — new `ACCESSORY_TIER_BY_PROPOSAL` constant maps each proposal tier to its matching accessory_tier value.
- SRS tier-upgrade rules port verbatim to ABC. Audit confirmed `OC Woodstart Cool Starter` matches the `%WoodStart Cool%` ILIKE pattern, and `resolveTierOverrides()` now passes `cfg` so the query runs against the active catalog table. CertainTeed Best Ice & Water — High Temp upgrade fires correctly on ABC (verified end-to-end against the dev server).

### Changed
- **Step 11 (proposal templates) re-enabled for ABC + QXO.** v1 had hidden the step upfront (10-circle indicator, "Start New Import" terminal CTA) because the engine bailed with `__unsupported`. Now that `proposal-preview` works for all three sources, the SRS-only gates in `WizardShell.tsx`, `Step7Done.tsx`, and `Step9Vendor.tsx` are removed — the indicator is back to 11 circles for everyone, "Skip to Proposal Templates" shows on Step 7 Done, and "Build Proposal Templates →" is the post-vendor-catalog CTA on Step 9 Vendor regardless of source.
- **Upload route Phase 1 sped up by ~60-70%** for accounts with prior products and uploads in the 2K+ product range. Three pacing changes in `app/api/upload/route.ts`:
  1. **Parallel idempotency scan** — the pre-upload "fetch all existing Zuper products" scan now fans out at concurrency 8 (was sequential, 1 page at a time). For an account saturated with prior test products, this collapses ~80s of serial waiting into ~10s. Emits `{type:'idempotency_scan_progress', pageNumber, totalPages}` events.
  2. **Inter-batch pause reduced from 3000ms → 500ms** via a new `BATCH_PAUSE_MS` constant. For a 20-batch upload that saves 50 seconds of pure idle time. `fetchWithRetry` already handles 429 backoff per-request, so the conservative global sleep was just dead weight.
  3. **Color option GETs deferred** to a single end-of-Phase-1 pass at concurrency 15 (was per-batch at concurrency 10, blocking the next batch). Stops shingle-heavy batches from stalling subsequent ones. Emits `{type:'color_gets_start', count}` when the pass begins.
- Added per-phase timing instrumentation. The final SSE event now includes `{type:'timing', phases: {fetch_supabase, idempotency_scan, phase1_uploads, color_gets, phase2_services}}` (milliseconds) so we can verify the wins and catch any future regression without instrumenting again.

### Fixed
- ABC/QXO proposal templates now include material, gutter, and siding line items — not just services. The upload route keyed `productIdMap` by the digit-only form of ABC `PFam_…` / QXO `product_key` ids (`app/api/upload/route.ts`), but `proposal-preview` stamped the full text PK onto each line item, so every non-service item failed the `productIdMap[String(item.product_id)]` lookup in `app/api/create-proposals/route.ts` and was silently skipped (`continue`). The create route now resolves the id with a digit-stripped fallback (`resolveZuperProduct`) and reports a per-brand skipped-item count in its SSE `done` event instead of dropping items silently. SRS (numeric ids throughout) was unaffected.
- Proposal template names now carry a ` - <SOURCE>` suffix (SRS / ABC / QXO) so the same brand can have a template per catalog source without tripping Zuper's duplicate-template-name guard. Previously an ABC run in an account that already had SRS templates failed every brand with "Duplicate template name is found". `components/wizard/Step10Proposals.tsx` appends `catalogSource.toUpperCase()` to the default `template_name`.
- ABC Big 3 detection no longer leaks non-Big3 brands (Carlisle, BiTec, Westlake Royal, etc.) into the auto-selected tile row on Step 3. ABC's materialized view aggregates `is_big3_brand` via `BOOL_OR` over all items in a family, so a Carlisle family with even one Big-3-flagged item would mark the whole family `is_big3_brand=true` while `MIN(manufacturer_norm)` returned "Carlisle" as the display name. `app/api/brands/route.ts` now uses the canonical `QXO_BIG3` set (Gaf / Certainteed / Owens Corning) for ABC, same as QXO; only SRS uses the column lookup.
- ABC products with empty `family_name` no longer fail upload with "Product Name is Mandatory". `app/api/upload/route.ts` now filters them out before the upload loop and reports the count via a `{type:'skip'}` SSE event, tallied into `uploadSummary.skipped`. The empty-name rows are catalog-data noise from the ABC API ingest — they were never real products.
- ABC products in unmapped raw categories (insulation, ceiling panels, acoustic batt, etc.) no longer fail with "Product Category is Mandatory". `app/api/upload/route.ts` coalesces a null/empty `product_category` to `'OTHER'`, and `app/api/validate/route.ts` always seeds an `OTHER` Zuper category for QXO + ABC uploads so `categoryMap['OTHER']` resolves before the upload starts. v1.1 follow-up: expand `enrich-abc-category-norm.py`'s `CATEGORY_MAP` so these products land in semantic categories instead of "Other".
- Error CSV download on Step 7 Done now works in Safari + Firefox. `components/wizard/Step7Done.tsx` appends the anchor to the DOM before `.click()`, sanitizes empty product names to `(unnamed product)`, strips newlines from messages, prepends a UTF-8 BOM so Excel renders em-dashes correctly, and wraps the whole flow in a try/catch with `console.error` so any future failure surfaces in DevTools instead of silently doing nothing.
- Step 9 vendor preview is now source-aware. `components/wizard/Step9Vendor.tsx` reads the catalog source from the wizard store and renders the matching vendor name + phone + address (SRS Distribution Inc / QXO Inc / ABC Supply Co Inc). The actual vendor creation was already source-correct via `app/api/create-vendor/route.ts` — only the preview card was hardcoded to SRS.

### Added
- **ABC Supply** as a third catalog source alongside SRS and QXO.
  - **Step 2 Source** now offers ABC Supply (34,868 family-grouped products from a 316K-SKU raw catalog). Branch-agnostic in v1 — all products available regardless of location.
  - `lib/catalog-source.ts` — `CatalogSource` widened to `'srs' | 'qxo' | 'abc'`, `ABC` config added pointing at the new `abc_products` + `abc_variants` Postgres views. ABC mirrors SRS's column layout (the views were designed for that), so every `cfg.source === 'srs'` branch in the API routes was generalised to `cfg.source !== 'qxo'`.
  - `lib/abc-accessory-catalog.ts` — 15 ABC `family_id` strings (e.g. `PFam_3358459` for Lomanco LPR Ridge Vent) covering drip edge, underlayment, ice & water, coil nails, plastic cap nails, step flashing, valley, pipe boot, ridge vent, starter strip, caulk, counter/headwall flashing, gutter apron, box vent. Picks curated from `find-abc-accessory-gaps.py` output — prefers Big 3 brands and real `PFam_*` family records over inventory `PLot_*` lots.
  - `app/api/create-vendor/route.ts` creates an `ABC Supply Co Inc` vendor record (1 ABC Parkway, Beloit WI) when source=abc.
  - `store/wizard-store.ts` — `setCatalogSource` now nulls `selectedQxoBranch` whenever the source isn't QXO (covers SRS↔ABC↔QXO transitions cleanly).

### Changed
- API routes generalized to handle three catalogs:
  - `brands/route.ts`, `product-lines/route.ts`, `preview/route.ts`, `validate/route.ts`, `upload/route.ts` — SRS and ABC share the same column layout, query patterns, and category enum; QXO continues to need the branch-stocked filter and free-text category arrays.
  - `upload/route.ts` ABC branch: ABC's family_ids are TEXT (`PFam_*`), so it queries `abc_products` view by string keys but strips non-digits when stamping into the SrsProduct shape (matches the existing QXO pattern). Pricing fallback medians are computed from ABC's own `suggested_price` data.

### Known limitations
- ABC **proposal templates (Step 11)** intentionally not yet wired into the G/B/B engine — same limitation as QXO. `proposal-preview` returns `__unsupported: 'abc'` and Step10Proposals lets CSMs skip. The SRS engine uses `primary_item` ordering and brand-specific tier-upgrade rules (CertainTeed Best → HT Ice & Water, OC Better/Best → WoodStart Cool) that don't apply cleanly to ABC's family-id-keyed schema. CSMs can still upload the catalog, build proposal templates manually in Zuper, and run the vendor catalog step.

## [v0.5.1] - 2026-05-19

### Fixed
- `lib/supabase.ts` no longer throws at module load when env vars are missing. Vercel Preview deploys scope env vars separately from Production; without `SUPABASE_URL` in Preview, Next 14's "Collecting page data" phase crashed with `Failed to collect page data for /api/brands` even though the code was fine. The module now uses placeholder values during build and logs a clear warning at production startup if env vars are still missing — builds are decoupled from runtime Supabase config.

## [v0.5.0] - 2026-05-18

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
