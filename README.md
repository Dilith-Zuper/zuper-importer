# SRS Product Importer — Zuper

A Next.js wizard that imports the SRS roofing catalog from a Supabase database into any Zuper customer account via the Zuper REST API.

**Live:** https://zuper-importer.vercel.app

---

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** — warm off-white theme, Zuper orange (`#F97316`) accent
- **Zustand** — wizard state (connection, brands, product IDs, validation data)
- **Supabase JS** (server-side only, service key) — queries `srs_products` + `srs_variants`
- **Zuper REST API** — products, categories, warehouse, measurement tokens, CPQ formulas
- **Vercel** — hosting with SSE streaming support

---

## Environment Variables

```
SUPABASE_URL=https://kbdczzldmyayliwajwma.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
```

Set in `.env.local` for local dev. Already configured in Vercel project settings for production.

---

## Local Development

```bash
npm install
npm run dev        # starts on localhost:3000 (or next available port)
```

---

## Deployment

```bash
vercel --prod --yes
```

Vercel project: `dilith-zupers-projects/zuper-importer`
Vercel account: `dilith-zuper`

---

## Supabase Tables

### `srs_products`
Key columns used:
| Column | Notes |
|---|---|
| `product_id` | PK |
| `product_name` | |
| `product_category` | Raw category string |
| `proposal_line_item` | Category used for grouping/display (preferred over product_category) |
| `manufacturer` | Raw manufacturer name |
| `manufacturer_norm` | Normalized brand name (e.g. `Gaf`, `Certainteed`, `Owens Corning`) |
| `is_big3_brand` | Boolean — true for GAF, CertainTeed, Owens Corning |
| `is_universal` | True = included in every brand selection (generic accessories) |
| `exclude_default` | True = skip this product entirely |
| `family_tier` | `good` / `better` / `best` / `addon` / null |
| `product_uom` | Unit of measure (mapped via `lib/uom-map.ts`) |
| `suggested_price` | |
| `product_description` | |
| `product_image_url` | **Not sent to Zuper** (causes "Invalid Image" errors) |

### `srs_variants`
| Column | Notes |
|---|---|
| `variant_id` | PK |
| `product_id` | FK → srs_products |
| `color_name` | Color option (deduplicated, capped at 50) |
| `size_name` | |
| `variant_image_url` | **Not sent to Zuper** |
| `is_restricted` | Restricted variants are excluded |

---

## Product Counts (as of May 2025)

| Brand | Total | Universal | Brand-specific |
|---|---|---|---|
| GAF | 522 | 111 | 411 |
| CertainTeed | 495 | 44 | 451 |
| Owens Corning | 116 | 30 | 86 |
| Total in DB | 19,807 | 6,873 | 12,934 |

**For a Big 3 selection:** ~1,719 products uploaded (1,133 brand-specific + 586 manufacturer-varies universals)

---

## Product Tiers (`family_tier`)

| Tier | Count | Description |
|---|---|---|
| `better` | 748 | Standard mid-range — most of catalog (flashing, decking, shingles) |
| `addon` | 166 | Optional add-ons (many have no proposal_line_item) |
| `good` | 77 | Entry-level / economy (coil nails, starter strips, basic ridge cap) |
| `best` | 9 | Premium (all Lead Flashing) |
| `null` | ~1,000 | Manufacturer-varies universal accessories — no tier assigned |

---

## Wizard Flow

### Step 1 — Connect
- User enters company login name + API key
- `POST /api/connect` → calls Zuper `/api/auth/token` to resolve `dc_api_url` and `company_name`
- On success, stores `baseUrl` (`dc_api_url + '/api/'`), `apiKey`, `companyName` in Zustand

### Step 2 — Brands
- `GET /api/brands` → paginates through `srs_products` (1,000 rows/page) counting products per `manufacturer_norm`
- Big 3 detected via `is_big3_brand = true` column (NOT string matching)
- Big 3 are pre-selected but **toggleable**
- Top 9 secondary brands shown as tiles; others in searchable checkbox list
- Passes `selectedBrands` (array of `manufacturer_norm` values) to store

### Step 3 — Preview
- `POST /api/preview` → paginates to fetch all matching products
- Query: `manufacturer_norm IN (selectedBrands) OR (is_universal=true AND manufacturer_norm ILIKE '%manufacturer varies%')`
- **Does NOT include universal products from other specialty brands** (Bay Cities Metal, Topshield etc. — would add 6,100+ unwanted products)
- Displays brand tabs + category breakdown sorted by roofing importance (Shingles → Ridge → Underlayment → Ice & Water → Vents → Flashing → Fasteners → Gutters → Other)

### Step 4 — Validate (Pre-flight)
- `POST /api/validate` → SSE stream, checks 5 things:
  1. **Categories** — fetches existing Zuper categories; creates missing ones
  2. **Warehouse** — finds/creates a WAREHOUSE location
  3. **Measurement Tokens** — fuzzy-matches 18 required roof measurement tokens; creates missing ones in "Roof Measurements" category
  4. **CPQ Formulas** — checks/creates 25 formula definitions (area measurement formulas)
  5. **UOMs** — verifies all mapped units of measure exist in Zuper
- Returns `categoryMap`, `warehouseUid`, `tokenMap`, `formulaMap` to store

### Step 5 — Upload
- `POST /api/upload` → SSE stream
- Fetches full product + variant data from Supabase in 1,000-row pages
- Builds Zuper product payload via `lib/product-builder.ts`
- Uploads in **batches of 100 products concurrently** (`Promise.allSettled`) with 3s sleep between batches
- Live log + progress bar + stats in UI

### Step 6 — Done
- Shows uploaded / skipped / error counts
- Error CSV download

---

## Key Technical Decisions

### POST routes + fetch streaming (not EventSource)
Validate and upload use `POST` with JSON body + `ReadableStream` SSE response. `EventSource` was previously used but is GET-only, which caused URL length truncation with 1,200+ product IDs.

### No images sent to Zuper
Both `product_image` and `option_image` are always sent as `''`. Zuper rejects many SRS image URLs with "Invalid Image / Attachment" errors (broken URLs, unsupported extensions like `.5a`).

### Color options capped at 50
Zuper enforces a max of 50 options per product. Colors are sliced to 50 before building the payload.

### Supabase pagination
All Supabase queries that could return >1,000 rows use `.range(from, from + PAGE - 1)` pagination. The default JS client cap is 1,000 rows — silently truncating results was the root cause of "only 5 categories found" and "only 900 products uploaded" bugs.

### Brand count uses `is_big3_brand` column
The brands API uses the DB column to identify Big 3, not string matching. Original string matching (`name === 'Gaf'`) only matched 8 products due to case differences.

### Universal products scoped to manufacturer-varies only
`is_universal=true` covers 6,873 products including specialty brands (Bay Cities Metal, Topshield, Berger etc.). The preview/upload only includes universals where `manufacturer_norm ILIKE '%manufacturer varies%'` (586 products) to keep the catalog focused.

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/connect` | POST | Validate Zuper credentials, return baseUrl + companyName |
| `/api/brands` | GET | Return Big 3, top secondary, other brands with counts |
| `/api/preview` | POST | Return all matching product IDs and category breakdown |
| `/api/validate` | POST | SSE stream — run 5 pre-flight checks |
| `/api/upload` | POST | SSE stream — upload products to Zuper |

---

## Category Sort Order (Roofing Importance)

Shingles → Hip & Ridge Cap → Starter Strip → Underlayment (Synthetic / Felt / Self-Adhered) → Ice & Water (Standard / High Temp) → Ridge Vent → Box Vent → Power Vent → Dryer Vent Cap → Drip Edge → Step Flashing → Counter/Headwall Flashing → Chimney Flashing → W-Valley → Lead Flashing → Coil Stock → Coil Nails → Plastic Cap Nails → Fasteners → Pipe Boots → Skylight → Roof Decking → Caulk → Spray Paint → Gutters → Downspouts → Siding → Commercial Membrane → Tools/Safety → Other

---

## Known Limitations

- **Vercel free tier** has a 60s function timeout. Upload of ~1,700 products in parallel batches of 100 typically completes well within this, but very large selections could timeout. Upgrade to Vercel Pro for the full 300s limit if needed.
- Products with >50 color variants are capped at 50 colors — the rest are silently dropped.
- The `family_tier` (Good/Better/Best) field is stored in the DB but not currently used to filter the upload. All tiers are always uploaded.
