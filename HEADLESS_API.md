# Headless API — drive the import from n8n (no UI)

> **Quick start**: import `n8n-headless-import.workflow.json` (repo root) into
> n8n — the 4 nodes below pre-wired, with a dry-run gate and the 422
> proposal-config branch. Fill in the `REPLACE_WITH_*` values in the
> "Import Config" node (move the secrets to n8n credentials for real use).

Four JSON endpoints under `/api/headless/*` orchestrate the entire wizard:
catalog discovery → plan (selection + validation) → import (products/services)
→ finalize (vendor catalog + G/B/B proposal templates). They self-call the
same internal routes the UI uses, consume the SSE streams server-side, and
return plain JSON — so an n8n HTTP Request node per phase is all you need.

## Auth

Every headless endpoint requires the header:

```
x-headless-key: <HEADLESS_API_KEY>
```

`HEADLESS_API_KEY` is a Vercel env var (Production scope). Missing/wrong key
→ `401`. Key not configured on the deployment → `503`.

The Zuper account credentials (`companyLoginName`, `apiKey`) travel in request
bodies, the same way the UI sends them. Store both as n8n credentials.

## The n8n recipe (4 HTTP Request nodes)

All nodes: `POST`, `Content-Type: application/json`, header `x-headless-key`,
timeout ≥ 300s for plan/import/finalize.

### Node 0 (optional) — discovery

`POST /api/headless/catalog`
```json
{ "catalogSource": "srs", "trade": "roofing", "includeLines": false }
```
→ `{ big3: [{name, count}], topSecondary: [...], otherBrands: [...] }`.
Pass `"brands": ["Gaf"]` (or `"includeLines": true`) to also get
`productLines: { "Gaf": [{line, count}, …] }`. For QXO, `branchNum` is
required — list branches via `GET /api/qxo-branches` (public route).

### Node 1 — plan

`POST /api/headless/plan`
```json
{
  "companyLoginName": "acme-roofing",
  "apiKey": "<zuper api key>",
  "catalogSource": "srs",
  "trades": ["roofing"],
  "brands": "big3",
  "extraBrands": ["Tamko"],
  "productLines": "all",
  "dryRun": false
}
```
- `brands`: `"big3"` (resolved per source) or an explicit array. `extraBrands`
  merge into the preset.
- `productLines`: `"all"` or `{ "Gaf": ["Timberline HDZ"], … }`.
- `dryRun: true` → returns the resolved selection + product counts and stops
  **before any Zuper write** — use it to test the flow safely.
- QXO needs `branchNum`.

→ `{ state, failedChecks, warnings }`. **Persist `state`** (n8n: just map it
into the next node's body). It contains the resolved brands/lines/productIds
plus the validation maps (categoryMap, warehouseUid, formulaMap, …).
Validation auto-creates missing categories, warehouse, measurement tokens,
CPQ formulas, and the Product Tier field — idempotent.

### Node 2 — import

`POST /api/headless/import`
```json
{ "apiKey": "<zuper api key>", "state": {{ $json.state }} }
```
→ `{ uploaded, updated, skipped, errors: [...], warnings: [...], timing, state }`.
The returned `state` now includes `productIdMap` / `serviceIdMap` /
`colorCatalogMap` — pass it to finalize. **Idempotent**: a retry updates
existing products instead of duplicating them.

### Node 3 — finalize

`POST /api/headless/finalize`
```json
{
  "apiKey": "<zuper api key>",
  "state": {{ $json.state }},
  "options": { "vendor": true, "proposals": true }
}
```
→ `{ vendor: { vendorUid, catalogEntries, skipped, created },
     proposals: { successful, failed, perBrand, skippedBrands },
     summary }`

- **422 `needs: "proposal_config"`**: proposal preflight couldn't auto-detect
  the job category / status / layout in the account. The response includes
  `categoryOptions` / `statusOptions` / `layoutOptions` — branch in n8n, pick
  the UIDs (or notify a human), then retry with:
  `"options": { "proposalConfig": { "categoryUid": "…", "statusUid": "…", "layoutUid": "…" } }`
- `proposals.skippedBrands` lists brands that didn't qualify for G/B/B (with
  reasons, e.g. fewer than 2 shingle tiers in the selected lines).
- Vendor creation dedupes against an existing vendor (re-run safe). Re-running
  proposals reports per-brand `error` for duplicate template names — treat as
  already-exists.

## Error semantics

| Code | Meaning |
|---|---|
| 401 | bad/missing `x-headless-key` |
| 400 | missing required input (credentials, branchNum for QXO, state) |
| 422 | a decision is needed (`needs: 'proposal_config'`, or zero brands resolved) |
| 502 | Zuper-side validation failed (details in `checks`) |
| 500 | unexpected failure; message comes from the underlying route |

## Sizing

Each phase runs inside one Vercel function invocation (300s cap). Big 3 scale
(few hundred–2K products) fits comfortably. For much larger imports, split
into multiple plan/import runs with explicit `brands` subsets — every phase is
idempotent, so successive runs into the same account are additive.
