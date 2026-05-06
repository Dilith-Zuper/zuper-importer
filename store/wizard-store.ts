'use client'
import { create } from 'zustand'
import type { WizardState, ValidationResult, TokenInfo, UploadError, BrandPackage, Trade, ProposalLineItem } from '@/types/wizard'

interface WizardStore extends WizardState {
  setStep: (step: WizardState['step']) => void
  setConnection: (companyLoginName: string, apiKey: string, baseUrl: string, companyName: string) => void
  setSelectedTrades: (trades: Trade[]) => void
  setSelectedBrands: (brands: string[]) => void
  setSelectedGutterBrands: (brands: string[]) => void
  setSelectedSidingBrands: (brands: string[]) => void
  setSelectedProductLines: (lines: Record<string, string[]>) => void
  setSelectedGutterProductLines: (lines: Record<string, string[]>) => void
  setSelectedSidingProductLines: (lines: Record<string, string[]>) => void
  setPreview: (ids: number[], counts: WizardState['productCounts']) => void
  setValidationResult: (result: ValidationResult) => void
  setValidationData: (data: {
    categoryMap: Record<string, string>
    warehouseUid: string
    tokenMap: Record<string, TokenInfo>
    formulaMap: Record<string, string>
    productTierFieldUid: string
    serviceCategoryMap?: Record<string, string>
  }) => void
  setUploadSummary: (summary: { uploaded: number; skipped: number; errors: UploadError[]; productIdMap: Record<string, string>; serviceIdMap: Record<string, string> }) => void
  setProposalPackages: (packages: Record<string, BrandPackage>) => void
  setGutterProposalItems: (items: ProposalLineItem[]) => void
  setSidingProposalItems: (items: ProposalLineItem[]) => void
  reset: () => void
}

const initialState: WizardState = {
  step: 1,
  companyLoginName: '',
  apiKey: '',
  baseUrl: '',
  companyName: '',
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
  proposalPackages: {},
  gutterProposalItems: [],
  sidingProposalItems: [],
}

export const useWizardStore = create<WizardStore>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setConnection: (companyLoginName, apiKey, baseUrl, companyName) =>
    set({ companyLoginName, apiKey, baseUrl, companyName, step: 2 }),

  setSelectedTrades: (trades) => set({ selectedTrades: trades }),

  setSelectedBrands: (brands) => set({ selectedBrands: brands }),
  setSelectedGutterBrands: (brands) => set({ selectedGutterBrands: brands }),
  setSelectedSidingBrands: (brands) => set({ selectedSidingBrands: brands }),

  setSelectedProductLines: (lines) => set({ selectedProductLines: lines }),
  setSelectedGutterProductLines: (lines) => set({ selectedGutterProductLines: lines }),
  setSelectedSidingProductLines: (lines) => set({ selectedSidingProductLines: lines }),

  setPreview: (ids, counts) =>
    set({ filteredProductIds: ids, productCounts: counts, step: 6 }),

  setValidationResult: (result) =>
    set((s) => ({
      validationResults: [
        ...s.validationResults.filter(r => r.check !== result.check),
        result,
      ],
    })),

  setValidationData: (data) => set({ ...data, serviceCategoryMap: data.serviceCategoryMap ?? {} }),

  setUploadSummary: ({ productIdMap, serviceIdMap, ...summary }) =>
    set({ uploadSummary: summary, productIdMap, serviceIdMap, step: 8 }),

  setProposalPackages: (packages) => set({ proposalPackages: packages }),
  setGutterProposalItems: (items) => set({ gutterProposalItems: items }),
  setSidingProposalItems: (items) => set({ sidingProposalItems: items }),

  reset: () => set(initialState),
}))
