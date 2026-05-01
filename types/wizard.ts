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
  check: 'categories' | 'warehouse' | 'tokens' | 'formulas' | 'uoms'
  status: 'pending' | 'running' | 'pass' | 'fail'
  detail: string
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6
  // Step 1
  companyLoginName: string
  apiKey: string
  baseUrl: string   // dc_api_url + '/api/' — always ends with /api/
  companyName: string
  // Step 2
  selectedBrands: string[]
  // Step 3
  filteredProductIds: number[]
  productCounts: { total: number; byCategory: Record<string, number> }
  // Step 4
  validationResults: ValidationResult[]
  categoryMap: Record<string, string>   // srs_category → zuper category_uid
  warehouseUid: string
  tokenMap: Record<string, TokenInfo>   // token_name → { uid, category_uid }
  formulaMap: Record<string, string>    // formula_key → formula_uid
  // Step 5
  uploadSummary: { uploaded: number; skipped: number; errors: UploadError[] }
}
