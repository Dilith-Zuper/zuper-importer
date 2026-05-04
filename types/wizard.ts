export interface TokenInfo {
  measurement_token_uid: string
  measurement_category_uid: string
}

export interface UploadError {
  productId: number
  productName: string
  message: string
}

export interface ValidationResult {
  check: 'categories' | 'warehouse' | 'tokens' | 'formulas' | 'uoms' | 'tier_field'
  status: 'pending' | 'running' | 'pass' | 'fail'
  detail: string
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7
  // Step 1 — Connect
  companyLoginName: string
  apiKey: string
  baseUrl: string   // dc_api_url + '/api/' — always ends with /api/
  companyName: string
  // Step 2 — Brands
  selectedBrands: string[]
  // Step 3 — Product Lines
  selectedProductLines: Record<string, string[]>  // { brand → [line, ...] }
  // Step 4 — Preview
  filteredProductIds: number[]
  productCounts: { total: number; byCategory: Record<string, number> }
  // Step 5 — Validate
  validationResults: ValidationResult[]
  categoryMap: Record<string, string>   // srs_category → zuper category_uid
  warehouseUid: string
  tokenMap: Record<string, TokenInfo>   // token_name → { uid, category_uid }
  formulaMap: Record<string, string>    // formula_key → formula_uid
  productTierFieldUid: string           // custom field UID for "Product Tier" RADIO
  // Step 6 — Upload
  uploadSummary: { uploaded: number; skipped: number; errors: UploadError[] }
}
