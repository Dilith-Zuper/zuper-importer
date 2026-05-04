'use client'
import { create } from 'zustand'
import type { WizardState, ValidationResult, TokenInfo, UploadError } from '@/types/wizard'

interface WizardStore extends WizardState {
  setStep: (step: WizardState['step']) => void
  setConnection: (companyLoginName: string, apiKey: string, baseUrl: string, companyName: string) => void
  setSelectedBrands: (brands: string[]) => void
  setSelectedProductLines: (lines: Record<string, string[]>) => void
  setPreview: (ids: number[], counts: WizardState['productCounts']) => void
  setValidationResult: (result: ValidationResult) => void
  setValidationData: (data: {
    categoryMap: Record<string, string>
    warehouseUid: string
    tokenMap: Record<string, TokenInfo>
    formulaMap: Record<string, string>
    productTierFieldUid: string
  }) => void
  setUploadSummary: (summary: { uploaded: number; skipped: number; errors: UploadError[] }) => void
  reset: () => void
}

const initialState: WizardState = {
  step: 1,
  companyLoginName: '',
  apiKey: '',
  baseUrl: '',
  companyName: '',
  selectedBrands: [],
  selectedProductLines: {},
  filteredProductIds: [],
  productTierFieldUid: '',
  productCounts: { total: 0, byCategory: {} },
  validationResults: [],
  categoryMap: {},
  warehouseUid: '',
  tokenMap: {},
  formulaMap: {},
  uploadSummary: { uploaded: 0, skipped: 0, errors: [] },
}

export const useWizardStore = create<WizardStore>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setConnection: (companyLoginName, apiKey, baseUrl, companyName) =>
    set({ companyLoginName, apiKey, baseUrl, companyName, step: 2 }),

  setSelectedBrands: (brands) => set({ selectedBrands: brands }),

  setSelectedProductLines: (lines) => set({ selectedProductLines: lines }),

  setPreview: (ids, counts) =>
    set({ filteredProductIds: ids, productCounts: counts, step: 5 }),

  setValidationResult: (result) =>
    set((s) => ({
      validationResults: [
        ...s.validationResults.filter(r => r.check !== result.check),
        result,
      ],
    })),

  setValidationData: (data) => set({ ...data }),

  setUploadSummary: (summary) => set({ uploadSummary: summary, step: 7 }),

  reset: () => set(initialState),
}))
