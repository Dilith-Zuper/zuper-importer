export type Trade = 'roofing' | 'gutters' | 'siding'

export type CatalogSource = 'srs' | 'qxo' | 'abc'

export interface QxoBranch {
  branchNum: number
  name: string
  city: string | null
  state: string | null
  regionName: string | null
  stockedSkuCount?: number
}

export interface ProposalLineItem {
  // SRS uses integer product_id; QXO uses string product_key. Routes accept both.
  product_id: number | string
  product_name: string
  proposal_line_item: string
  formula_key: string | null
  suggested_price: number | null
  family_tier: string | null
}

export interface BrandPackage {
  good: ProposalLineItem[]
  better: ProposalLineItem[]
  best: ProposalLineItem[]
}

export interface TokenInfo {
  measurement_token_uid: string
  measurement_category_uid: string
}

export interface UploadError {
  productId: number | string
  productName: string
  message: string
}

export interface ValidationResult {
  check: 'categories' | 'warehouse' | 'tokens' | 'formulas' | 'uoms' | 'tier_field' | 'service_categories'
  status: 'pending' | 'running' | 'pass' | 'fail'
  detail: string
}

export interface ColorCatalogEntry {
  color_name: string
  variant_code: string
  option_uid: string
  purchase_price: number | null
}

// ── Remap options flow (match existing Zuper products → SRS, write options) ──
export type AppMode = 'home' | 'import' | 'remap'

export type RemapConfidence = 'exact' | 'strong' | 'weak' | 'none'

export interface RemapCandidate {
  srsId: number
  srsName: string
  srsCategory: string
  srsBrand: string
  score: number
  hasOptions: boolean
  colors: string[]
  sizes: string[]
  optionsPreview: string
}

export interface RemapRow {
  zuperUid: string
  zuperName: string
  zuperProductId: string | null
  confidence: RemapConfidence
  /** Matched by stamped SRS product_id rather than fuzzy scoring. */
  fastPath: boolean
  brand: string | null
  /** Best candidate first, up to 3. Empty only if the catalog was empty. */
  candidates: RemapCandidate[]
}

export interface RemapSelection {
  zuperUid: string
  srsId: number
  srsCategory: string
}

export interface RemapSummary {
  updated: number
  failed: number
  errors: { zuperUid: string; productName: string; message: string }[]
}

export interface WizardState {
  // Top-level mode — landing page routes to the import wizard or the remap flow.
  mode: AppMode
  // Steps: 1 Connect · 2 Source · 3 Trades · 4 Brands · 5 Lines · 6 Preview ·
  //        7 Validate · 8 Upload · 9 Done · 10 Vendor · 11 Templates
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  // Step 1 — Connect (shared by both modes)
  companyLoginName: string
  apiKey: string
  baseUrl: string
  companyName: string
  // Remap flow — 1 Connect · 2 Match · 3 Review · 4 Done
  remapStep: 1 | 2 | 3 | 4
  remapRows: RemapRow[]
  remapSelections: RemapSelection[]
  remapSummary: RemapSummary | null
  // Step 2 — Source (SRS / QXO + branch picker)
  catalogSource: CatalogSource
  selectedQxoBranch: QxoBranch | null
  // Step 3 — Trades
  selectedTrades: Trade[]
  // Step 4 — Brands (per trade)
  selectedBrands: string[]                         // roofing
  selectedGutterBrands: string[]
  selectedSidingBrands: string[]
  // Step 5 — Product Lines (per trade)
  selectedProductLines: Record<string, string[]>   // roofing: { brand → lines }
  selectedGutterProductLines: Record<string, string[]>
  selectedSidingProductLines: Record<string, string[]>
  // Step 6 — Preview
  // For QXO catalog, filteredProductIds holds string product_keys cast to
  // numeric-looking strings; for SRS, integer product IDs. The upload route
  // handles both shapes.
  filteredProductIds: (number | string)[]
  productCounts: { total: number; byCategory: Record<string, number> }
  // Step 7 — Validate
  validationResults: ValidationResult[]
  categoryMap: Record<string, string>
  warehouseUid: string
  tokenMap: Record<string, TokenInfo>
  formulaMap: Record<string, string>
  productTierFieldUid: string
  serviceCategoryMap: Record<string, string>  // category_key → zuper category_uid
  // Step 8 — Upload
  uploadSummary: { uploaded: number; skipped: number; errors: UploadError[] }
  productIdMap: Record<string, string>
  serviceIdMap: Record<string, string>          // service.id → zuper product_uid
  colorCatalogMap: Record<string, ColorCatalogEntry[]>  // src product id/key → per-color vendor entries
  // Step 11 — Proposal Templates
  proposalPackages: Record<string, BrandPackage>
  gutterProposalItems: ProposalLineItem[]
  sidingProposalItems: ProposalLineItem[]
}
