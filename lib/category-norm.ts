export const CATEGORY_NORM: Record<string, string> = {
  'SHINGLES':             'Shingles',
  'HIP AND RIDGE':        'Hip & Ridge Cap',
  'STARTER':              'Starter Strip',
  'UNDERLAYMENT':         'Underlayment — Synthetic',
  'ICE AND WATER':        'Ice & Water — Standard',
  'VENTS':                'Box Vent',
  'OTHER FASTENERS':      'Fasteners',
  'COIL NAILS':           'Coil Nails',
  'DECKING':              'Roof Decking (OSB)',
  'DRIP EDGE':            'Drip Edge',
  'OTHER FLASHING METAL': 'Step Flashing',
  'PIPE FLASHING':        'Pipe Boot 3"',
  'CAULK':                'Caulk / Sealant',
  'SPRAY PAINT':          'Spray Paint',
  'COMMERCIAL':           'Commercial Membrane (TPO/EPDM)',
  'SIDING':               'Siding',
  'GUTTER/ALUMINUM/COIL': 'Gutter Sections',
  'TOOLS/SAFETY':         'TOOLS/SAFETY',
  'OTHER':                'OTHER',
}

export function normalizeCategory(proposalLineItem: string | null, productCategory: string): string {
  if (proposalLineItem) return proposalLineItem
  return CATEGORY_NORM[productCategory] ?? productCategory
}

// Lines that are non-core residential roofing — highlight so users know to review
export const NON_CORE_LINES = new Set([
  'Commercial Membrane (TPO/EPDM)',
  'Siding',
  'TOOLS/SAFETY',
  'OTHER',
])
