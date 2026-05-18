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

// SRS stores category names in ALL CAPS with forward slashes (TOOLS/SAFETY,
// GUTTER/ALUMINUM/COIL). Zuper's category API rejects slashes and prefers
// readable title case. This map produces Zuper-safe names used when creating
// categories during pre-flight validation. categoryMap downstream is still
// keyed on the original SRS name so upload code doesn't change.
const SRS_TO_ZUPER_CATEGORY: Record<string, string> = {
  'SHINGLES':             'Shingles',
  'HIP AND RIDGE':        'Hip & Ridge',
  'STARTER':              'Starter',
  'UNDERLAYMENT':         'Underlayment',
  'ICE AND WATER':        'Ice & Water',
  'VENTS':                'Vents',
  'OTHER FASTENERS':      'Other Fasteners',
  'OTHER FLASHING METAL': 'Other Flashing Metal',
  'COIL NAILS':           'Coil Nails',
  'PLASTIC CAPS':         'Plastic Caps',
  'DECKING':              'Decking',
  'DRIP EDGE':            'Drip Edge',
  'PIPE FLASHING':        'Pipe Flashing',
  'CAULK':                'Caulk',
  'SPRAY PAINT':          'Spray Paint',
  'COMMERCIAL':           'Commercial',
  'SIDING':               'Siding',
  'GUTTER/ALUMINUM/COIL': 'Gutter, Aluminum & Coil',
  'GUTTER APRON':         'Gutter Apron',
  'TOOLS/SAFETY':         'Tools & Safety',
  'W-VALLEY':             'W-Valley',
  'SKYLIGHTS':            'Skylights',
  'OTHER':                'Other',
}

export function toZuperCategoryName(srsCategory: string): string {
  const mapped = SRS_TO_ZUPER_CATEGORY[srsCategory]
  if (mapped) return mapped
  // Fallback: strip slashes, title-case each word
  return srsCategory
    .replace(/\//g, ' & ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
}
