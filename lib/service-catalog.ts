import type { Trade } from '@/types/wizard'

export type ServiceType = 'FIXED' | 'HOURLY'

export interface ServiceDef {
  id: string
  name: string
  description: string
  price: number
  service_type: ServiceType
  trades: Trade[]
  category_key: string
  /**
   * Optional formula key (from FORMULA_DEFINITIONS) — when set, the proposal
   * line item uses quantity_type=FORMULA so quantities auto-calculate from
   * measurement tokens. Currently wired for slope-based tear-off and install.
   */
  formula_key?: string
}

export const SERVICE_CATALOG: ServiceDef[] = [
  // ── Roofing — core services ─────────────────────────────────────────────────
  {
    id: 'installation-labor-general',
    name: 'Installation Labor (General)',
    description: 'General roofing installation labor — billed hourly',
    price: 193.50,
    service_type: 'HOURLY',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'tear-off-general',
    name: 'Tear Off / Remove Existing Roof',
    description: 'Remove and dispose of existing roofing material',
    price: 110.21,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'shingle-installation',
    name: 'Shingle Installation',
    description: 'Install asphalt shingles per roofing specification',
    price: 228.25,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'flashing-installation',
    name: 'Flashing Installation',
    description: 'Install step, counter, and headwall flashing',
    price: 35.79,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'starter-strip-installation',
    name: 'Starter Strip Installation',
    description: 'Install starter strip along eaves and rakes',
    price: 15.35,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'roof-repair',
    name: 'Roof Repair',
    description: 'General roofing repair service',
    price: 452.81,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'underlayment-installation',
    name: 'Underlayment Installation',
    description: 'Install synthetic or felt underlayment',
    price: 44.57,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'ventilation-installation',
    name: 'Ventilation Installation',
    description: 'Install ridge vents, box vents, or attic ventilation',
    price: 26.43,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'standing-seam-installation',
    name: 'Standing Seam Metal Installation',
    description: 'Install standing seam metal roofing panels',
    price: 268.19,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'skylight-installation',
    name: 'Skylight Installation',
    description: 'Install and flash skylight unit',
    price: 387.62,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'chimney-flashing-installation',
    name: 'Chimney Flashing Installation',
    description: 'Install step and counter flashing around chimney',
    price: 316.19,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'shingle-repair',
    name: 'Shingle Repair',
    description: 'Repair damaged or missing shingles',
    price: 125.12,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'roof-deck-replacement',
    name: 'Roof Deck Replacement',
    description: 'Replace damaged roof decking / OSB sheathing',
    price: 26.90,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'epdm-installation',
    name: 'EPDM Membrane Installation',
    description: 'Install EPDM rubber membrane for low-slope roofing',
    price: 336.13,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'flashing-repair',
    name: 'Flashing Repair',
    description: 'Repair or re-seal existing flashing',
    price: 157.41,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },
  {
    id: 'ridge-vent-installation',
    name: 'Ridge Vent Installation',
    description: 'Install continuous ridge vent along ridge line',
    price: 55.73,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
  },

  // ── Roofing — slope-based tear off ──────────────────────────────────────────
  {
    id: 'tear-off-low-slope',
    name: 'Tear Off — Low Slope (3/12–6/12)',
    description: 'Remove existing roof on low-slope pitch (3/12 to 6/12)',
    price: 107,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'tear_off_low_slope_sq',
  },
  {
    id: 'tear-off-standard-slope',
    name: 'Tear Off — Standard Slope (7/12–9/12)',
    description: 'Remove existing roof on standard pitch (7/12 to 9/12)',
    price: 185,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'tear_off_standard_slope_sq',
  },
  {
    id: 'tear-off-steep-slope',
    name: 'Tear Off — Steep Slope (10/12–12/12)',
    description: 'Remove existing roof on steep pitch (10/12 to 12/12)',
    price: 245,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'tear_off_steep_slope_sq',
  },
  {
    id: 'tear-off-very-steep',
    name: 'Tear Off — Very Steep (13/12+)',
    description: 'Remove existing roof on very steep pitch (13/12 and above)',
    price: 321,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'tear_off_very_steep_sq',
  },

  // ── Roofing — slope-based shingle installation ──────────────────────────────
  {
    id: 'shingle-install-low-slope',
    name: 'Shingle Installation — Low Slope (3/12–6/12)',
    description: 'Install shingles on low-slope pitch (3/12 to 6/12)',
    price: 30,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'shingle_install_low_slope_sq',
  },
  {
    id: 'shingle-install-standard-slope',
    name: 'Shingle Installation — Standard Slope (7/12–9/12)',
    description: 'Install shingles on standard pitch (7/12 to 9/12)',
    price: 77,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'shingle_install_standard_slope_sq',
  },
  {
    id: 'shingle-install-steep-slope',
    name: 'Shingle Installation — Steep Slope (10/12–12/12)',
    description: 'Install shingles on steep pitch (10/12 to 12/12)',
    price: 107,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'shingle_install_steep_slope_sq',
  },
  {
    id: 'shingle-install-very-steep',
    name: 'Shingle Installation — Very Steep (13/12+)',
    description: 'Install shingles on very steep pitch (13/12 and above)',
    price: 132,
    service_type: 'FIXED',
    trades: ['roofing'],
    category_key: 'roofing-services',
    formula_key: 'shingle_install_very_steep_sq',
  },

  // ── Gutters ─────────────────────────────────────────────────────────────────
  {
    id: 'gutter-installation',
    name: 'Gutter Installation',
    description: 'Supply and install gutters — priced per linear foot',
    price: 11.87,
    service_type: 'FIXED',
    trades: ['gutters'],
    category_key: 'gutter-services',
  },
  {
    id: 'gutter-repair',
    name: 'Gutter Repair',
    description: 'Repair or re-hang existing gutters',
    price: 152.50,
    service_type: 'FIXED',
    trades: ['gutters'],
    category_key: 'gutter-services',
  },
  {
    id: 'fascia-soffit-installation',
    name: 'Fascia / Soffit Installation',
    description: 'Install or replace fascia boards and soffit panels',
    price: 36.23,
    service_type: 'FIXED',
    trades: ['gutters'],
    category_key: 'gutter-services',
  },

  // ── Siding ───────────────────────────────────────────────────────────────────
  {
    id: 'siding-installation',
    name: 'Siding Installation',
    description: 'Install vinyl, fiber cement, or composite siding',
    price: 200.49,
    service_type: 'FIXED',
    trades: ['siding'],
    category_key: 'siding-services',
  },
]

// Human-readable labels for service category keys
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  'roofing-services': 'Roofing Services',
  'gutter-services':  'Gutter Services',
  'siding-services':  'Siding Services',
}
