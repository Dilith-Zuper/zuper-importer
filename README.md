# SRS Product Importer — Zuper

A Next.js wizard that imports the SRS roofing, gutters, and siding catalog from a Supabase database into any Zuper customer account via the Zuper REST API, then generates Good / Better / Best CPQ proposal templates automatically.

**Live:** https://zuper-importer.vercel.app
**GitHub:** https://github.com/Dilith-Zuper/zuper-importer

---

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** — warm off-white (`#FAF9F7`) theme, Zuper orange (`#F97316`) accent, Inter font
- **Zustand** — wizard state across all 9 steps
- **Supabase JS** (server-side only, service role key) — queries `srs_products` + `srs_variants`
- **Zuper REST API** — products, categories, warehouse, measurement tokens, CPQ formulas, custom fields, proposal templates
- **Vercel** — auto-deploys on push to `main`; SSE streaming supported

---

## Environment Variables

```
SUPABASE_URL=https://kbdczzldmyayliwajwma.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
```

Set in `.env.local` for local dev. Already configured in Vercel project settings.

---

## Local Development

```bash
npm install
npm run dev        # starts on localhost:3000 (or next available port)
```

---

## Deployment

GitHub push to `main` auto-deploys via Vercel (linked). Manual deploy:

```bash
vercel --prod --yes
```

Vercel project: `dilith-zupers-projects/zuper-importer` · Account: `dilith-zuper`

---

## Supabase Tables

### `srs_products`

| Column | Notes |
|---|---|
| `product_id` | PK |
| `product_name` | |
| `product_category` | Uppercase raw category (`SHINGLES`, `HIP AND RIDGE`, `GUTTER/ALUMINUM/COIL`, `SIDING`, etc.) |
| `proposal_line_item` | Proper-case display category (`Shingles`, `Hip & Ridge Cap`, `Gutter Sections`, `Siding`, etc.) |
| `product_line` | Product series/family name (`Timberline HDZ`, `Duration`, `Landmark PRO`, `K-Style`, etc.) |
| `manufacturer` | Raw manufacturer name |
| `manufacturer_norm` | Normalized brand (`Gaf`, `Certainteed`, `Owens Corning`, `Berger`, `James Hardie`, etc.) |
| `is_big3_brand` | Boolean — true for GAF, CertainTeed, Owens Corning (roofing only) |
| `is_universal` | True = generic accessory included in every brand selection |
| `exclude_default` | True = skip entirely |
| `family_tier` | `addon` / `good` / `better` / `best` / null — maps to proposal tiers |
| `primary_item` | Boolean — preferred representative product for a product line |
| `product_uom` | Unit of measure (mapped via `lib/uom-map.ts`) |
| `suggested_price` | |
| `product_description` | |
| `product_image_url` | **Never sent to Zuper** — causes "Invalid Image" errors |

### `srs_variants`

| Column | Notes |
|---|---|
| `variant_id` | PK |
| `product_id` | FK → srs_products |
| `color_name` | Color option (deduplicated, capped at 50 per Zuper limit) |
| `variant_image_url` | **Never sent to Zuper** |
| `is_restricted` | Restricted variants are excluded |

---

## Catalog Sizes

| Trade | Products | Notes |
|---|---|---|
| Roofing | 19,807 | Big 3: GAF 522, CertainTeed 495, Owens Corning 116 |
| Gutters | 1,230 | Berger, Englert, US Aluminum, Rainstamp, Quality Edge, + others |
| Siding | 2,438 | James Hardie, CertainTeed, Mastic, Azek, Royal, + others |

**Typical Big 3 roofing upload:** ~1,719 products (1,133 brand-specific + 586 manufacturer-varies universals)

---

## Wizard Flow (9 Steps)

### Step 1 — Connect
- User enters company login name + API key
- `POST /api/connect` → resolves `dc_api_url` and `company_name` from Zuper auth
- Stores `baseUrl`, `apiKey`, `companyName` in Zustand

### Step 2 — Trades
- Multi-select cards: **Roofing** (pre-selected), Gutters, Siding
- Shows product count and sample brands per trade
- Roofing can be deselected; at least one trade must remain selected
- Stores `selectedTrades` in Zustand

### Step 3 — Brands
- Tabbed per selected trade (tabs only shown when multiple trades selected)
- **Roofing tab**: Big 3 pre-selected + toggleable; top 9 secondary as tiles; rest in searchable list
- **Gutters/Siding tabs**: all brands listed by product count, none pre-selected, searchable
- Stores `selectedBrands`, `selectedGutterBrands`, `selectedSidingBrands`

### Step 4 — Product Lines
- Tabbed per selected trade
- **Roofing tab**: non-roofing lines (commercial TPO, solar, insulation, etc.) deselected by default with reason badges; expandable Specialty section with explanatory card + legend
- **Gutters/Siding tabs**: all lines pre-selected, simple toggle pills
- Stores `selectedProductLines`, `selectedGutterProductLines`, `selectedSidingProductLines`

### Step 5 — Preview
- `POST /api/preview` → paginates all matching products across all selected trades, filters by selected product lines
- Shows brand filter tabs + category breakdown
- Stores `filteredProductIds[]` (combined across all trades)

### Step 6 — Validate (Pre-flight, 6 checks)
- `POST /api/validate` → SSE stream
  1. Categories, 2. Warehouse, 3. Measurement Tokens, 4. CPQ Formulas, 5. UOMs, 6. Product Tier Field (non-blocking)

### Step 7 — Upload
- `POST /api/upload` → SSE stream
- Uploads all products across all selected trades in batches of 100
- Captures `product_uid` from each response → `productIdMap`
- Color variants uploaded as `option.option_values` with `option_label: "Color"`

### Step 8 — Done
- Shows uploaded / skipped / error counts
- Error CSV download
- "Build Proposal Templates →" advances to Step 9

### Step 9 — Proposal Templates (G/B/B CPQ)

Three phases:

**Phase A — Pre-flight** (`POST /api/proposal-preflight`)
- Checks for "Roof Inspection" job category, "Create Proposal" status, "Residential Roofing Proposal" layout
- Layout is optional (amber state) — CPQ works without it
- Category and status are auto-detected; pickers shown if not found; honest "none exist" messages if account is empty

**Phase B — Package Preview** (`POST /api/proposal-preview`)
- Roofing: builds G/B/B packages per brand using `family_tier`
- Gutters: fetches 6 curated items (Gutter Sections, Downspouts, Elbows, End Caps, Inside Corners, Outside Corners) — same across all tiers
- Siding: fetches one primary product per selected siding brand — same across all tiers
- Preview cards show roofing tiers + gutter section (sky blue) + siding section (violet)

**Phase C — Creation** (`POST /api/create-proposals`, SSE stream)

For each roofing brand template:
1. `POST /invoice_estimate/proposal_template` → `template_uid`
2. `POST /invoice_estimate/proposal_template/{uid}/options?items_type=LINE_ITEMS` → Good/Better/Best option UIDs
3. `PUT /invoice_estimate/proposal_template/{uid}` → set CPQ trigger + layout + `is_draft: false`
4. For each option: POST "Material" HEADER → POST roofing items (formula-based quantities)
5. If gutters selected: POST "Gutter Materials" HEADER → POST gutter items (same in all 3 options)
6. If siding selected: POST "Siding Materials" HEADER → POST siding items (same in all 3 options)

Formula UIDs fetched live from Zuper at route start (`GET /invoice_estimate/cpq/formulas`). If formula rejected, falls back to `FIXED=1`.

---

## Product Tiers (`family_tier` → Zuper "Product Tier" custom field)

| DB `family_tier` | Zuper custom field value |
|---|---|
| `addon` | Good |
| `good` | Better |
| `better` | Best |
| `best` | Best |
| `null` | Default |

**Roofing proposal tier mapping:**
- Good option: `addon` shingles + `addon`→`good` hip&ridge/starter
- Better option: `good` shingles + `good` hip&ridge/starter
- Best option: `best` shingles + `best`→`good` hip&ridge/starter

**Gutters and siding** are `family_tier = better` for 99%+ of products — no meaningful G/B/B differentiation, so the same curated items appear in all three proposal options.

---

## G/B/B Proposal Line Items

| Item | Varies by tier? | Formula |
|---|---|---|
| Shingles | Yes | `shingles_squares` |
| Hip & Ridge Cap | Yes | `hip_ridge_cap_bundles` |
| Starter Strip | Yes | `starter_strip_bundles` |
| Underlayment | No | `underlayment_synthetic_rolls` |
| Ice & Water | No | `ice_and_water_shield_rolls` |
| Vent | No | varies |
| Drip Edge | No (universal) | `drip_edge_pieces` |
| Step Flashing | No (universal) | `step_flashing_pieces` |
| W-Valley | No (universal) | `valley_metal_pieces` |
| Counter/Headwall Flashing | No (universal) | `headwall_flashing_pieces` |
| Pipe Boot 3" | No (universal) | FIXED=1 |
| Coil Nails | No (universal) | `coil_nails_boxes` |
| Plastic Cap Nails | No (universal) | `plastic_cap_nails_boxes` |
| Fasteners | No (universal) | FIXED=1 |
| Caulk / Sealant | No (universal) | FIXED=1 |
| **Gutter Sections** | No (if gutters trade selected) | `gutter_sections_pieces` |
| **Downspouts** | No | `downspouts_count` |
| **Gutter Elbows** | No | `gutter_elbows_count` |
| **Gutter End Caps** | No | `gutter_end_caps_count` |
| **Gutter Inside Corners** | No | `gutter_inside_corners_count` |
| **Gutter Outside Corners** | No | `gutter_outside_corners_count` |
| **Siding** | No (if siding trade selected) | `siding_squares` |

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/connect` | POST | Validate Zuper credentials, return baseUrl + companyName |
| `/api/brands` | POST | Return brands for a given trade (`{trade: 'roofing'|'gutters'|'siding'}`) |
| `/api/product-lines` | POST | Return product lines per brand, filtered by trade category |
| `/api/preview` | POST | Fetch + filter products across all selected trades |
| `/api/validate` | POST | SSE — 6 pre-flight checks |
| `/api/upload` | POST | SSE — build payloads, upload products, return productIdMap |
| `/api/proposal-preflight` | POST | Check job category, status, layout template in Zuper |
| `/api/proposal-preview` | POST | Assemble G/B/B packages + gutter/siding curated items |
| `/api/create-proposals` | POST | SSE — create CPQ proposal templates with all trade sections |

---

## Key Libraries

| File | Purpose |
|---|---|
| `lib/product-builder.ts` | Builds Zuper product JSON payload; includes color options as `option.option_values` with `option_label: "Color"` |
| `lib/category-norm.ts` | Maps uppercase `product_category` → proper-case display names |
| `lib/product-line-skips.ts` | Per-brand prefix lists for non-roofing lines to deselect by default |
| `lib/product-line-categories.ts` | Maps skip prefixes to human-readable reason categories (Commercial Roofing, Solar, Insulation, etc.) with Tailwind badge colours |
| `lib/formula-definitions.ts` | 25 CPQ formula definitions with expression maps + ITEM_TO_FORMULA_KEY |
| `lib/token-definitions.ts` | 18 required roof measurement tokens |
| `lib/uom-map.ts` | SRS UOM codes → Zuper UOM values |
| `lib/zuper-fetch.ts` | `fetchWithRetry`, `zuperHeaders`, `bestZuperMatch`, `chunks`, `sleep` |

---

## Key Technical Decisions

**Multi-trade architecture**
Each trade (roofing, gutters, siding) has its own brand + product line selection stored separately in Zustand. All selected product IDs are combined into a single `filteredProductIds` array for upload — one upload pass handles all trades. Proposal templates are created per roofing brand with optional gutter/siding sections appended.

**POST routes + fetch streaming (not EventSource)**
All long-running routes use `POST` with JSON body + `ReadableStream` SSE. `EventSource` is GET-only and silently truncated 1,200+ product IDs in the URL.

**Formula field name: `formula` not `formula_uid`**
Zuper's line item API expects `{ quantity_type: "FORMULA", formula: "<uid>" }`. `formula_uid` is silently rejected. Live formula map is fetched fresh from `GET /invoice_estimate/cpq/formulas` at proposal creation time rather than relying on the cached Zustand value.

**FIXED fallback for formula rejections**
If a formula-type line item is rejected (e.g. formula UID not found in account), the item is automatically retried as `quantity_type: FIXED, quantity: 1`.

**No images sent to Zuper**
`product_image` and `option_image` always `''`. Zuper rejects many SRS image URLs.

**Color options: `option_label: "Color"`**
Products are uploaded with `option.option_label = "Color"` and `option.customer_selection = true` for any product with 1+ color variants. Products with zero colors get `customer_selection: false`.

**Color options capped at 50**
Zuper enforces a 50-option limit per product.

**Supabase pagination everywhere**
All queries use `.range(from, from + PAGE - 1)`. The default Supabase JS cap is 1,000 rows.

**`is_big3_brand` column for Big 3 detection**
String matching only matched 8 products due to DB storing `'GAF'` vs `'Gaf'`.

**Universal products scoped to manufacturer-varies only**
`is_universal=true` covers 6,873 products. Only `manufacturer_norm ILIKE '%manufacturer varies%'` (586 products) are included to avoid bloat.

**Product line smart defaults from Zuper master dump**
Cross-referenced SRS catalog against Zuper product master dump (us_east + us_west CSVs, 35,195 products across 54 accounts). Non-roofing lines deselected by default in Step 4 with reason badges (Commercial Roofing, Solar, Insulation, Interior Products, etc.). Gutters/siding lines are all pre-selected since no skip logic applies.

**Product Tier custom field is non-blocking**
If Check 6 fails, upload proceeds without setting the tier field.

**productIdMap captured during upload**
Each successful Zuper upload response includes `data.product_uid`. Accumulated into `productIdMap: { srs_product_id → zuper_product_uid }` for use in Step 9 proposal line items.

**Gutter/siding proposal sections identical across G/B/B**
99%+ of gutter and siding products have `family_tier = better` with no tier differentiation. The same curated items appear in Good, Better, and Best options. Only the roofing section changes between tiers.

**Section UID extraction**
The HEADER line item POST returns `data` as an array. Section UID is extracted via `Array.isArray(hd) ? hd[0]?.uid : hd?.uid` (with fallbacks for `section_uid` and `line_item_uid` field names).

---

## Known Limitations

- **Vercel free tier** has a 60s function timeout. Parallel batches of 100 typically finish well under this for ~1,700 products. Very large multi-trade selections may approach the limit.
- Products with >50 color variants are silently capped at 50.
- `productIdMap` is populated during upload. If products were imported in a previous session, Step 9 won't have their UIDs — run a fresh import to use the proposal builder.
- Gutters and siding have no G/B/B tier differentiation in the DB — all three proposal options receive identical gutter/siding sections.
- If roofing brands don't have shingles in 2+ tiers within selected product lines, that brand is excluded from proposal template creation.
