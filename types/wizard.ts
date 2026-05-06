export type Trade = 'roofing' | 'gutters' | 'siding'

export interface ProposalLineItem {
  product_id: number
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
  productId: number
  productName: string
  message: string
}

export interface ValidationResult {
  check: 'categories' | 'warehouse' | 'tokens' | 'formulas' | 'uoms' | 'tier_field' | 'service_categories'
  status: 'pending' | 'running' | 'pass' | 'fail'
  detail: string
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  // Step 1 — Connect
  companyLoginName: string
  apiKey: string
  baseUrl: string
  companyName: string
  // Step 2 — Trades
  selectedTrades: Trade[]
  // Step 3 — Brands (per trade)
  selectedBrands: string[]                         // roofing
  selectedGutterBrands: string[]
  selectedSidingBrands: string[]
  // Step 4 — Product Lines (per trade)
  selectedProductLines: Record<string, string[]>   // roofing: { brand → lines }
  selectedGutterProductLines: Record<string, string[]>
  selectedSidingProductLines: Record<string, string[]>
  // Step 5 — Preview
  filteredProductIds: number[]
  productCounts: { total: number; byCategory: Record<string, number> }
  // Step 6 — Validate
  validationResults: ValidationResult[]
  categoryMap: Record<string, string>
  warehouseUid: string
  tokenMap: Record<string, TokenInfo>
  formulaMap: Record<string, string>
  productTierFieldUid: string
  serviceCategoryMap: Record<string, string>  // category_key → zuper category_uid
  // Step 7 — Upload
  uploadSummary: { uploaded: number; skipped: number; errors: UploadError[] }
  productIdMap: Record<string, string>
  serviceIdMap: Record<string, string>  // service.id → zuper product_uid
  // Step 9 — Proposal Templates
  proposalPackages: Record<string, BrandPackage>
  gutterProposalItems: ProposalLineItem[]
  sidingProposalItems: ProposalLineItem[]
}
