# SRS Product Importer — Zuper

A Next.js wizard that imports the SRS roofing catalog from a Supabase database into any Zuper customer account via the Zuper REST API, then generates Good / Better / Best CPQ proposal templates automatically.

**Live:** https://zuper-importer.vercel.app
**GitHub:** https://github.com/Dilith-Zuper/zuper-importer

---

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** — warm off-white (`#FAF9F7`) theme, Zuper orange (`#F97316`) accent, Inter font
- **Zustand** — wizard state across all 8 steps
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
| `product_category` | Uppercase raw category (`SHINGLES`, `HIP AND RIDGE`, etc.) |
| `proposal_line_item` | Proper-case display category (`Shingles`, `Hip & Ridge Cap`, etc.) |
| `product_line` | Product series/family name (`Timberline HDZ`, `Duration`, `Landmark PRO`) |
| `manufacturer` | Raw manufacturer name |
| `manufacturer_norm` | Normalized brand (`Gaf`, `Certainteed`, `Owens Corning`) |
| `is_big3_brand` | Boolean — true for GAF, CertainTeed, Owens Corning |
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

## Product Counts (as of May 2025)

| Brand | Total | Universal (is_universal) | Brand-specific |
|---|---|---|---|
| GAF | 522 | 111 | 411 |
| CertainTeed | 495 | 44 | 451 |
| Owens Corning | 116 | 30 | 86 |
| Total in DB | 19,807 | 6,873 | 12,934 |

**Typical Big 3 upload:** ~1,719 products (1,133 brand-specific + 586 manufacturer-varies universals)

---

## Product Tiers (`family_tier` → Zuper "Product Tier" custom field)

| DB `family_tier` | Price | Real meaning | Zuper custom field value |
|---|---|---|---|
| `addon` | ~$95 | Economy / entry-level shingles | **Good** |
| `good` | ~$131 | Standard architectural (most popular) | **Better** |
| `better` | ~$159 | Enhanced / upgraded architectural | **Best** |
| `best` | ~$431 | Designer / luxury | **Best** |
| `null` | — | Universal accessories (always included) | **Default** |

**GAF:** addon=Royal Sovereign, good=Timberline HDZ, better=Timberline UHDZ, best=Grand Sequoia/Grand Canyon
**CertainTeed:** addon=Landmark, good=Landmark PRO, better=Belmont, best=Presidential Shake
**OC:** addon=Oakridge/Supreme, good=Duration, best=Woodcrest/Berkshire

---

## Brands That Support G/B/B Proposals (7 brands)

| Brand | Shingle tiers | Hip&Ridge tiers | Starter tiers |
|---|---|---|---|
| CertainTeed | 4 (addon/good/better/best) | 3 | 3 |
| GAF | 4 | 2 | 1 |
| Owens Corning | 3 (no better) | 2 | 2 |
| IKO | 4 | 2 | 1 |
| Atlas | 3 | 2 | 1 |
| Tamko | 3 | 1 | 1 |
| Malarkey | 3 | 1 | 2 |

---

## Wizard Flow (8 Steps)

### Step 1 — Connect
- User enters company login name + API key
- `POST /api/connect` → resolves `dc_api_url` and `company_name` from Zuper auth
- Stores `baseUrl` (`dc_api_url + '/api/'`), `apiKey`, `companyName` in Zustand

### Step 2 — Brands
- `GET /api/brands` → paginates `srs_products`, counts per `manufacturer_norm`
- Big 3 identified via `is_big3_brand = true` column (not string matching)
- Big 3 pre-selected and toggleable; top 9 secondary as tiles; rest in searchable list
- Stores `selectedBrands[]` in Zustand

### Step 3 — Product Lines
- `POST /api/product-lines` → for each selected brand, counts products per `product_line` value
- Shows product lines as toggle pills per brand — all pre-selected by default
- **Smart defaults** from cross-reference with Zuper product master dump: non-roofing lines deselected automatically (`lib/product-line-skips.ts`):
  - GAF: EverGuard (commercial TPO), Timberline Solar/S1, RUBEROID, HydroStop, Drill-Tec, etc.
  - CertainTeed: Restoration Millwork, Kingston Rail, Solstice (solar), Flintlastic, GlasRoc, etc.
  - OC: FOAMULAR (insulation), PINK Next Gen, WEARDECK, Thermafiber, etc.
- Multi-product lines shown prominently; single-product accessory lines collapsed under expandable section
- Per-brand search box
- Continue button shows live product count as lines are toggled
- Stores `selectedProductLines: Record<brand, string[]>` in Zustand

### Step 4 — Preview
- `POST /api/preview` → paginates all matching products, filters in-memory by selected `product_line`
- Query: `manufacturer_norm IN (selectedBrands) OR (is_universal=true AND manufacturer_norm ILIKE '%manufacturer varies%')`
- In-memory filter: only products whose `product_line` is in `selectedProductLines[brand]`
- Shows brand filter tabs + category breakdown sorted by roofing importance
- Category sort order: Shingles → Hip & Ridge → Starter → Underlayment → Ice & Water → Vents → Drip Edge → Flashings → Fasteners → Pipes → Decking → Caulk → Gutters → Siding → Commercial → Tools → Other
- Stores `filteredProductIds[]` in Zustand

### Step 5 — Validate (Pre-flight, 6 checks)
- `POST /api/validate` → SSE stream
  1. **Categories** — fetches/creates all required Zuper product categories
  2. **Warehouse** — finds/creates a WAREHOUSE location
  3. **Measurement Tokens** — fuzzy-matches 18 roof tokens; creates missing in "Roof Measurements"
  4. **CPQ Formulas** — checks/creates 25 area measurement formula definitions
  5. **UOMs** — verifies all mapped units of measure exist in Zuper
  6. **Product Tier Field** — finds/creates "Product Tier" RADIO custom field on PRODUCT module (**non-blocking** — upload proceeds even if this fails)
- Returns `categoryMap`, `warehouseUid`, `tokenMap`, `formulaMap`, `productTierFieldUid` to store

### Step 6 — Upload
- `POST /api/upload` → SSE stream
- Fetches products + variants from Supabase in paginated 1,000-row chunks
- Builds Zuper payload per product via `lib/product-builder.ts`:
  - `product_image: ''` and `option_image: ''` — never sends URLs
  - Color options from variants, capped at 50
  - CPQ formula linked via `proposal_line_item → formula_key → uid`
  - `meta_data` includes "Product Tier" RADIO field with mapped value (Good/Better/Best/Default)
- Uploads **100 products concurrently** per batch (`Promise.allSettled`), 3s between batches
- **Captures `product_uid` from each Zuper response** → builds `productIdMap: { srs_product_id → zuper_product_uid }`
- `productIdMap` returned in SSE `done` event and stored in Zustand — used in Step 8 for proposal line items

### Step 7 — Done
- Shows uploaded / skipped / error counts with colored stat cards
- Error CSV download
- **"Build Proposal Templates →"** advances to Step 8
- "Start New Import" resets store

### Step 8 — Proposal Templates (G/B/B CPQ)
Three phases:

**Phase A — Pre-flight** (`POST /api/proposal-preflight`)
- Checks Zuper account for required resources:
  - "Roof Inspection" job category → `categoryUid`
  - "Create Proposal" job status within that category → `statusUid`
  - "Residential Roofing Proposal" layout template → `layoutUid`
- If any not found: shows picker UI listing available options

**Phase B — Package Preview** (`POST /api/proposal-preview`)
- Filters to eligible brands (have shingles in 2+ tiers within selected product lines)
- Assembles Good / Better / Best packages per brand using tier mapping:
  - Good: `addon` shingles + `addon`→`good` hip&ridge/starter + `good` accessories
  - Better: `good` shingles + `good` hip&ridge/starter + `good` accessories
  - Best: `best` shingles + `best`→`good` hip&ridge/starter + `good` accessories
  - Universal: drip edge + coil nails from manufacturer-varies universals
- `primary_item = true` products preferred; falls back to first in tier
- User can edit template name and description per brand

**Phase C — Creation** (`POST /api/create-proposals`, SSE stream)
For each brand package:
1. `POST /invoice_estimate/proposal_template` → `template_uid`
2. `POST /invoice_estimate/proposal_template/{uid}/options?items_type=LINE_ITEMS` → creates Good/Better/Best options, get `option_uid` for each
3. `PUT /invoice_estimate/proposal_template/{uid}` → set CPQ trigger (category + status) + layout + `is_draft: false`
4. For each option: `POST HEADER` line item → get `section_uid`, then `POST ITEM` for each product using `productIdMap` for Zuper product UID and `formulaMap` for CPQ formula (falls back to `FIXED=1` if no formula)

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/connect` | POST | Validate Zuper credentials, return baseUrl + companyName |
| `/api/brands` | GET | Return Big 3, top secondary, other brands with product counts |
| `/api/product-lines` | POST | Return product lines per brand with counts |
| `/api/preview` | POST | Fetch + filter products, return IDs and category breakdown |
| `/api/validate` | POST | SSE — 6 pre-flight checks, find/create Zuper resources |
| `/api/upload` | POST | SSE — build payloads, upload products, return productIdMap |
| `/api/proposal-preflight` | POST | Check job category, status, layout template in Zuper |
| `/api/proposal-preview` | POST | Assemble G/B/B packages from DB for eligible brands |
| `/api/create-proposals` | POST | SSE — create CPQ proposal templates in Zuper |

---

## Key Libraries

| File | Purpose |
|---|---|
| `lib/product-builder.ts` | Builds Zuper product JSON payload from SRS product + variants |
| `lib/category-norm.ts` | Maps uppercase `product_category` → proper-case display names |
| `lib/product-line-skips.ts` | Per-brand prefix lists for non-roofing lines to deselect by default |
| `lib/formula-definitions.ts` | 25 CPQ formula definitions with expression maps + ITEM_TO_FORMULA_KEY |
| `lib/token-definitions.ts` | 18 required roof measurement tokens |
| `lib/uom-map.ts` | SRS UOM codes → Zuper UOM values |
| `lib/zuper-fetch.ts` | `fetchWithRetry`, `zuperHeaders`, `bestZuperMatch`, `chunks`, `sleep` |

---

## Key Technical Decisions

**POST routes + fetch streaming (not EventSource)**
All long-running routes use `POST` with JSON body + `ReadableStream` SSE. `EventSource` is GET-only and silently truncated 1,200+ product IDs in the URL.

**No images sent to Zuper**
`product_image` and `option_image` always `''`. Zuper rejects many SRS image URLs.

**Color options capped at 50**
Zuper enforces a 50-option limit per product.

**Supabase pagination everywhere**
All queries use `.range(from, from + PAGE - 1)`. The default Supabase JS cap is 1,000 rows.

**`is_big3_brand` column for Big 3 detection**
String matching only matched 8 products due to DB storing `'GAF'` vs `'Gaf'`.

**Universal products scoped to manufacturer-varies only**
`is_universal=true` covers 6,873 products. Only `manufacturer_norm ILIKE '%manufacturer varies%'` (586 products) are included to avoid bloat.

**Product line smart defaults from Zuper master dump**
Cross-referenced SRS catalog against Zuper product master dump (us_east + us_west CSVs, 35,195 products). Non-roofing lines deselected by default in Step 3.

**Product Tier custom field is non-blocking**
If Check 6 fails, upload proceeds without setting the tier field. `productTierFieldUid = ''` causes the meta_data entry to be omitted.

**productIdMap captured during upload**
Each successful Zuper upload response includes `data.product_uid`. These are accumulated into `productIdMap: { srs_product_id → zuper_product_uid }` and stored in Zustand for use in Step 8 proposal line items.

**G/B/B proposal option creation**
Options (Good/Better/Best) are created explicitly via `POST /options?items_type=LINE_ITEMS` after the template is created. Line items use `quantity_type: FORMULA` with the pre-set CPQ formula UIDs; falls back to `FIXED=1` if no formula exists for the item.

---

## Known Limitations

- **Vercel free tier** has a 60s function timeout. Parallel batches of 100 typically finish well under this for ~1,700 products. Very large selections or slow Zuper APIs may timeout.
- Products with >50 color variants are silently capped at 50.
- `productIdMap` is populated during upload. If products were imported in a previous session, Step 8 won't have their UIDs — run a fresh import to use the proposal builder.
- If "Residential Roofing Proposal" layout template or "Roof Inspection" job category don't exist in the Zuper account, the user is prompted to pick from available options.
