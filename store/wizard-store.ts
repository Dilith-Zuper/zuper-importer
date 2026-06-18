'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { WizardState, ValidationResult, TokenInfo, UploadError, BrandPackage, Trade, ProposalLineItem, ColorCatalogEntry, CatalogSource, QxoBranch, AppMode, RemapRow, RemapSelection, RemapSummary } from '@/types/wizard'

interface WizardStore extends WizardState {
  setStep: (step: WizardState['step']) => void
  setMode: (mode: AppMode) => void
  goHome: () => void
  setConnection: (companyLoginName: string, apiKey: string, baseUrl: string, companyName: string) => void
  setRemapConnection: (companyLoginName: string, apiKey: string, baseUrl: string, companyName: string) => void
  setRemapStep: (step: WizardState['remapStep']) => void
  setRemapRows: (rows: RemapRow[], alreadyMapped?: number) => void
  setRemapSelections: (selections: RemapSelection[]) => void
  setRemapSummary: (summary: RemapSummary) => void
  setCatalogSource: (source: CatalogSource) => void
  setSelectedQxoBranch: (branch: QxoBranch | null) => void
  setSelectedTrades: (trades: Trade[]) => void
  setSelectedBrands: (brands: string[]) => void
  setSelectedGutterBrands: (brands: string[]) => void
  setSelectedSidingBrands: (brands: string[]) => void
  setSelectedProductLines: (lines: Record<string, string[]>) => void
  setSelectedGutterProductLines: (lines: Record<string, string[]>) => void
  setSelectedSidingProductLines: (lines: Record<string, string[]>) => void
  setPreview: (ids: (number | string)[], counts: WizardState['productCounts']) => void
  setValidationResult: (result: ValidationResult) => void
  setValidationData: (data: {
    categoryMap: Record<string, string>
    warehouseUid: string
    tokenMap: Record<string, TokenInfo>
    formulaMap: Record<string, string>
    productTierFieldUid: string
    serviceCategoryMap?: Record<string, string>
  }) => void
  setUploadSummary: (summary: { uploaded: number; skipped: number; errors: UploadError[]; productIdMap: Record<string, string>; serviceIdMap: Record<string, string>; colorCatalogMap: Record<string, ColorCatalogEntry[]> }) => void
  setProposalPackages: (packages: Record<string, BrandPackage>) => void
  setGutterProposalItems: (items: ProposalLineItem[]) => void
  setSidingProposalItems: (items: ProposalLineItem[]) => void
  reset: () => void
}

const initialState: WizardState = {
  mode: 'home',
  step: 1,
  companyLoginName: '',
  apiKey: '',
  baseUrl: '',
  companyName: '',
  remapStep: 1,
  remapRows: [],
  remapAlreadyMapped: 0,
  remapSelections: [],
  remapSummary: null,
  catalogSource: 'srs',
  selectedQxoBranch: null,
  selectedTrades: ['roofing'],
  selectedBrands: [],
  selectedGutterBrands: [],
  selectedSidingBrands: [],
  selectedProductLines: {},
  selectedGutterProductLines: {},
  selectedSidingProductLines: {},
  filteredProductIds: [],
  productCounts: { total: 0, byCategory: {} },
  validationResults: [],
  categoryMap: {},
  warehouseUid: '',
  tokenMap: {},
  formulaMap: {},
  productTierFieldUid: '',
  serviceCategoryMap: {},
  uploadSummary: { uploaded: 0, skipped: 0, errors: [] },
  productIdMap: {},
  serviceIdMap: {},
  colorCatalogMap: {},
  proposalPackages: {},
  gutterProposalItems: [],
  sidingProposalItems: [],
}

export const useWizardStore = create<WizardStore>()(persist((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setMode: (mode) => set({ mode }),

  // Return to the landing page and clear the (large, transient) remap match state.
  goHome: () => set({ mode: 'home', remapStep: 1, remapRows: [], remapAlreadyMapped: 0, remapSelections: [], remapSummary: null }),

  setConnection: (companyLoginName, apiKey, baseUrl, companyName) =>
    set({ companyLoginName, apiKey, baseUrl, companyName, step: 2 }),

  setRemapConnection: (companyLoginName, apiKey, baseUrl, companyName) =>
    set({ companyLoginName, apiKey, baseUrl, companyName, remapStep: 2 }),

  setRemapStep: (remapStep) => set({ remapStep }),
  setRemapRows: (rows, alreadyMapped = 0) => set({ remapRows: rows, remapAlreadyMapped: alreadyMapped, remapStep: 3 }),
  setRemapSelections: (selections) => set({ remapSelections: selections }),
  setRemapSummary: (summary) => set({ remapSummary: summary, remapStep: 4 }),

  // Changing the catalog source clears every downstream selection — different
  // sources have totally different brand lists, product lines, and
  // accessory catalogs, so cross-contamination would silently produce wrong
  // uploads. Branch also resets because it's QXO-specific.
  setCatalogSource: (source) => set((s) => ({
    catalogSource: source,
    selectedQxoBranch: source === 'qxo' ? s.selectedQxoBranch : null,
    selectedBrands: [],
    selectedGutterBrands: [],
    selectedSidingBrands: [],
    selectedProductLines: {},
    selectedGutterProductLines: {},
    selectedSidingProductLines: {},
    filteredProductIds: [],
    productCounts: { total: 0, byCategory: {} },
  })),

  // Same reasoning — switching branch on QXO changes the eligible product set,
  // so cached brand/line selections must be cleared.
  setSelectedQxoBranch: (branch) => set({
    selectedQxoBranch: branch,
    selectedBrands: [],
    selectedGutterBrands: [],
    selectedSidingBrands: [],
    selectedProductLines: {},
    selectedGutterProductLines: {},
    selectedSidingProductLines: {},
    filteredProductIds: [],
    productCounts: { total: 0, byCategory: {} },
  }),

  setSelectedTrades: (trades) => set({ selectedTrades: trades }),

  setSelectedBrands: (brands) => set({ selectedBrands: brands }),
  setSelectedGutterBrands: (brands) => set({ selectedGutterBrands: brands }),
  setSelectedSidingBrands: (brands) => set({ selectedSidingBrands: brands }),

  setSelectedProductLines: (lines) => set({ selectedProductLines: lines }),
  setSelectedGutterProductLines: (lines) => set({ selectedGutterProductLines: lines }),
  setSelectedSidingProductLines: (lines) => set({ selectedSidingProductLines: lines }),

  setPreview: (ids, counts) =>
    set({ filteredProductIds: ids, productCounts: counts, step: 7 }),

  setValidationResult: (result) =>
    set((s) => ({
      validationResults: [
        ...s.validationResults.filter(r => r.check !== result.check),
        result,
      ],
    })),

  setValidationData: (data) => set({ ...data, serviceCategoryMap: data.serviceCategoryMap ?? {} }),

  setUploadSummary: ({ productIdMap, serviceIdMap, colorCatalogMap, ...summary }) =>
    set({ uploadSummary: summary, productIdMap, serviceIdMap, colorCatalogMap, step: 9 }),

  setProposalPackages: (packages) => set({ proposalPackages: packages }),
  setGutterProposalItems: (items) => set({ gutterProposalItems: items }),
  setSidingProposalItems: (items) => set({ sidingProposalItems: items }),

  reset: () => set(initialState),
}), {
  name: 'zuper-importer-wizard',
  storage: createJSONStorage(() => localStorage),
  // Persist everything EXCEPT the API key — security: keep it memory-only so a
  // refreshed tab requires re-entering it. companyLoginName is fine to persist.
  // Reset step to 1 on rehydrate so the user lands on Connect to re-enter the key.
  partialize: (state) => {
    // Drop the API key (security: memory-only) and the large/transient remap
    // match state (rows + selections) — they're re-fetched after reconnect.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apiKey, remapRows, remapSelections, ...rest } = state
    return rest
  },
  onRehydrateStorage: () => (state) => {
    if (state) {
      state.apiKey = ''
      state.remapRows = []
      state.remapAlreadyMapped = 0
      state.remapSelections = []
      // If they had any progress, drop them at Connect to re-auth, then they can navigate forward.
      if (state.step > 1) state.step = 1
      // Remap mode also requires the (memory-only) key, so send them back to its Connect step.
      if (state.mode === 'remap') state.remapStep = 1
    }
  },
}))
