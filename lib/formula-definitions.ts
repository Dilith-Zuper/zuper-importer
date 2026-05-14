type MeasEntry = { type: 'MEASUREMENT'; field_name: string }
type ConstEntry = { type: 'CONSTANT'; value: number }
type MapEntry = MeasEntry | ConstEntry

const m = (field_name: string): MeasEntry => ({ type: 'MEASUREMENT', field_name })
const c = (value: number): ConstEntry => ({ type: 'CONSTANT', value })

/**
 * Magic numbers used in roof-quantity formulas. Every constant should be
 * justified here, not buried as a literal in an `expression_map`. Update both
 * the map and the formula entry together.
 *
 * Sources:
 *   "CSM medians"  → derived from 54 real customer accounts (us_east + us_west
 *                    *_zuper_service.cpq_formula.csv). See Token_Analysis.xlsx.
 *   "Industry std" → standard roofing trade convention.
 *   "Mfr packaging"→ from manufacturer (GAF/CertainTeed/OC) packaging specs.
 *
 * If a customer needs a different value (e.g. CertainTeed Landmark wraps 32 LF/
 * bundle, not 33), override per-account via the formula admin once that feature
 * lands (see plan P1-5 future scope).
 */
export const FORMULA_CONSTANTS = {
  // Roofing standards
  SQFT_PER_SQUARE: 100,           // Industry std — 1 SQ = 100 SQFT.
  PCT_DIVISOR: 100,               // Industry std — turns waste % into a fraction.

  // Hip & ridge bundles
  HIP_RIDGE_LF_PER_BUNDLE: 33,    // CSM medians — corrected from 35 (older spec).

  // Starter bundles
  STARTER_LF_PER_BUNDLE: 120,     // CSM medians — uses Eaves+Rakes, not a Starter token.

  // Ice & water
  ICE_WATER_OVERLAP_FACTOR: 1.1,  // Industry std — 10% overlap on each course.
  ICE_WATER_LF_PER_ROLL: 66,      // Mfr packaging — 3' wide × 66' long roll.

  // Drip edge / gutter apron / valley
  PIECE_LF: 10,                   // Industry std — 10' bar / piece.

  // Coil nails
  NAILS_PER_SQFT: 3.2,            // Industry std — 4 nails per shingle × 12 shingles / 100 SQFT plus laps.
  NAILS_PER_BOX: 3600,            // Mfr packaging — 3,600 nails / box.

  // Plastic cap nails
  CAP_NAILS_SQFT_PER_BOX: 400,    // Mfr packaging — covers ~400 SQFT.

  // Vents
  RIDGE_VENT_LF_PER_PIECE: 4,     // Mfr packaging — Lomanco LPR-10 is 10', but ridge vent install is 4' sections (industry std).

  // Underlayment — roll lengths in SQFT
  UNDERLAYMENT_SYNTHETIC_SQFT_PER_ROLL: 1000,   // Mfr packaging — 10 SQ rolls.
  UNDERLAYMENT_FELT_15_SQFT_PER_ROLL: 400,      // Mfr packaging — 4 SQ rolls.
  UNDERLAYMENT_FELT_30_SQFT_PER_ROLL: 200,      // Mfr packaging — 2 SQ rolls.
  UNDERLAYMENT_HT_SQFT_PER_ROLL: 200,           // Mfr packaging — 2 SQ rolls (self-adhered HT).

  // Decking
  DECKING_SQFT_PER_SHEET: 32,     // Industry std — 4'×8' OSB = 32 SQFT.
} as const

export interface FormulaDefinition {
  formula_name: string
  formula_key: string
  formula_description: string
  expression: string
  expression_map: MapEntry[]
  rounding_mechanism: 'NEXT_WHOLE_NUMBER' | 'NO_ROUNDING'
  proposal_line_items: string[]  // display_name values from proposal_line_items table
}

export const FORMULA_DEFINITIONS: FormulaDefinition[] = [
  {
    formula_name: 'Shingles (squares)',
    formula_key: 'shingles_squares',
    formula_description: 'Roof area with waste factor, output in squares',
    expression: '($1*(1+$2/$3))/$4',
    expression_map: [m('Total Roof Area'), m('Suggested Waste Percentage %'), c(100), c(100)],
    rounding_mechanism: 'NO_ROUNDING',
    proposal_line_items: ['Shingles'],
  },
  {
    formula_name: 'Hip & Ridge Cap (bundles)',
    formula_key: 'hip_ridge_cap_bundles',
    formula_description: 'Hip + ridge linear footage divided by 33 LF per bundle',
    expression: '($1+$2)/$3',
    expression_map: [m('Total Hip Length'), m('Total Ridges Length'), c(33)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Hip & Ridge Cap'],
  },
  {
    formula_name: 'Starter Strip (bundles)',
    formula_key: 'starter_strip_bundles',
    formula_description: 'Eaves + rakes linear footage divided by 120 LF per bundle',
    expression: '($1+$2)/$3',
    expression_map: [m('Total Eaves Length'), m('Total Rakes Length'), c(120)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Starter Strip'],
  },
  {
    formula_name: 'Underlayment Synthetic (rolls)',
    formula_key: 'underlayment_synthetic_rolls',
    formula_description: 'Roof area with waste, divided by 1000 SQFT per roll (10 SQ)',
    expression: '$1*(1+$2/$3)/$4',
    expression_map: [m('Total Roof Area'), m('Suggested Waste Percentage %'), c(100), c(1000)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Underlayment — Synthetic'],
  },
  {
    formula_name: 'Underlayment Felt 15# (rolls)',
    formula_key: 'underlayment_felt_15_rolls',
    formula_description: 'Roof area with waste, divided by 400 SQFT per roll (4 SQ)',
    expression: '$1*(1+$2/$3)/$4',
    expression_map: [m('Total Roof Area'), m('Suggested Waste Percentage %'), c(100), c(400)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Underlayment — Felt 15#'],
  },
  {
    formula_name: 'Underlayment Felt 30# (rolls)',
    formula_key: 'underlayment_felt_30_rolls',
    formula_description: 'Roof area with waste, divided by 200 SQFT per roll (2 SQ)',
    expression: '$1*(1+$2/$3)/$4',
    expression_map: [m('Total Roof Area'), m('Suggested Waste Percentage %'), c(100), c(200)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Underlayment — Felt 30#'],
  },
  {
    formula_name: 'Underlayment Self-Adhered HT (rolls)',
    formula_key: 'underlayment_ht_rolls',
    formula_description: 'Roof area with waste, divided by 200 SQFT per roll (2 SQ)',
    expression: '$1*(1+$2/$3)/$4',
    expression_map: [m('Total Roof Area'), m('Suggested Waste Percentage %'), c(100), c(200)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Underlayment — Self-Adhered HT'],
  },
  {
    formula_name: 'Ice & Water Shield (rolls)',
    formula_key: 'ice_and_water_shield_rolls',
    formula_description: '(Eaves + Valleys) * 1.1 overlap factor / 66 LF per roll',
    expression: '($1+$2)*$3/$4',
    expression_map: [m('Total Eaves Length'), m('Total Valleys Length'), c(1.1), c(66)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Ice & Water — Standard'],
  },
  {
    formula_name: 'Drip Edge (pieces)',
    formula_key: 'drip_edge_pieces',
    formula_description: 'Rakes + eaves perimeter divided by 10 LF per piece',
    expression: '($1+$2)/$3',
    expression_map: [m('Total Rakes Length'), m('Total Eaves Length'), c(10)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Drip Edge'],
  },
  {
    formula_name: 'W-Valley (pieces)',
    formula_key: 'valley_metal_pieces',
    formula_description: 'Valley length divided by 10 LF per piece',
    expression: '$1/$2',
    expression_map: [m('Total Valleys Length'), c(10)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['W-Valley'],
  },
  {
    formula_name: 'Gutter Apron (pieces)',
    formula_key: 'gutter_apron_pieces',
    formula_description: 'Rakes + eaves perimeter divided by 10 LF per piece',
    expression: '($1+$2)/$3',
    expression_map: [m('Total Rakes Length'), m('Total Eaves Length'), c(10)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Gutter Apron'],
  },
  {
    formula_name: 'Coil Nails (boxes)',
    formula_key: 'coil_nails_boxes',
    formula_description: 'Total roof area * 3.2 nails/SQFT / 3600 nails per box',
    expression: '$1*$2/$3',
    expression_map: [m('Total Roof Area'), c(3.2), c(3600)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Coil Nails'],
  },
  {
    formula_name: 'Plastic Cap Nails (boxes)',
    formula_key: 'plastic_cap_nails_boxes',
    formula_description: 'Total roof area divided by 400 SQFT per box',
    expression: '$1/$2',
    expression_map: [m('Total Roof Area'), c(400)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Plastic Cap Nails'],
  },
  {
    formula_name: 'Ridge Vents (pieces)',
    formula_key: 'ridge_vents_pieces',
    formula_description: 'Ridge length divided by 4 LF per piece',
    expression: '$1/$2',
    expression_map: [m('Total Ridges Length'), c(4)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Ridge Vent'],
  },
  {
    formula_name: 'Gutter Sections (pieces)',
    formula_key: 'gutter_sections_pieces',
    formula_description: 'Gutter length divided by 10 LF per section',
    expression: '$1/$2',
    expression_map: [m('Gutter Length'), c(10)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Gutter Sections'],
  },
  {
    formula_name: 'Downspouts (count)',
    formula_key: 'downspouts_count',
    formula_description: 'Direct count from measurement report',
    expression: '$1',
    expression_map: [m('No of Downspouts')],
    rounding_mechanism: 'NO_ROUNDING',
    proposal_line_items: ['Downspouts'],
  },
  {
    formula_name: 'Gutter End Caps (count)',
    formula_key: 'gutter_end_caps_count',
    formula_description: 'Direct count from measurement report',
    expression: '$1',
    expression_map: [m('No of End Caps')],
    rounding_mechanism: 'NO_ROUNDING',
    proposal_line_items: ['Gutter End Caps'],
  },
  {
    formula_name: 'Gutter Outside Corners (count)',
    formula_key: 'gutter_outside_corners_count',
    formula_description: 'Direct count from measurement report',
    expression: '$1',
    expression_map: [m('No of Outside Miters')],
    rounding_mechanism: 'NO_ROUNDING',
    proposal_line_items: ['Gutter Outside Corners'],
  },
  {
    formula_name: 'Gutter Inside Corners (count)',
    formula_key: 'gutter_inside_corners_count',
    formula_description: 'Direct count from measurement report',
    expression: '$1',
    expression_map: [m('No of Inside Miters')],
    rounding_mechanism: 'NO_ROUNDING',
    proposal_line_items: ['Gutter Inside Corners'],
  },
  {
    formula_name: 'Gutter Elbows (count)',
    formula_key: 'gutter_elbows_count',
    formula_description: 'Sum of all elbow types from measurement report',
    expression: '$1+$2+$3',
    expression_map: [m('Downspout Elbows'), m('No of Inner Elbows'), m('No of Outer Elbows')],
    rounding_mechanism: 'NO_ROUNDING',
    proposal_line_items: ['Gutter Elbows'],
  },
  {
    formula_name: 'Step Flashing (pieces)',
    formula_key: 'step_flashing_pieces',
    formula_description: 'Step flashing length divided by 10 LF per piece',
    expression: '$1/$2',
    expression_map: [m('Total Step Flashing Length'), c(10)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Step Flashing'],
  },
  {
    formula_name: 'Headwall Flashing (pieces)',
    formula_key: 'headwall_flashing_pieces',
    formula_description: 'Headwall flashing length divided by 10 LF per piece',
    expression: '$1/$2',
    expression_map: [m('Headwall Flashing'), c(10)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Counter / Headwall Flashing'],
  },
  {
    formula_name: 'Siding (squares)',
    formula_key: 'siding_squares',
    formula_description: 'Siding area with waste, in squares',
    expression: '$1*(1+$2/$3)/$4',
    expression_map: [m('Total Siding Area'), m('Suggested Waste Percentage %'), c(100), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Siding'],
  },
  {
    formula_name: 'Commercial Membrane (squares)',
    formula_key: 'commercial_membrane_squares',
    formula_description: 'Flat roof area with waste, in squares',
    expression: '$1*(1+$2/$3)/$4',
    expression_map: [m('Total Roof Area'), m('Suggested Waste Percentage %'), c(100), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Commercial Membrane (TPO/EPDM)'],
  },
  {
    formula_name: 'Roof Decking (sheets)',
    formula_key: 'roof_decking_sheets',
    formula_description: 'Roof area divided by 32 SQFT per 4x8 sheet, with waste',
    expression: '$1/$2*(1+$3/$4)',
    expression_map: [m('Total Roof Area'), c(32), m('Suggested Waste Percentage %'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: ['Roof Decking (OSB)'],
  },

  // ── Slope-based service formulas ─────────────────────────────────────────
  // These compute squares of roof by slope band; the per-slope service line
  // items in the proposal use these so quantities auto-route from the
  // measurement report. proposal_line_items is empty because these don't
  // map to a product line item — they're service-only.
  {
    formula_name: 'Tear Off — Low Slope (squares)',
    formula_key: 'tear_off_low_slope_sq',
    formula_description: 'Low-slope area / 100 SQFT per square — drives Low Slope tear-off service quantity',
    expression: '$1/$2',
    expression_map: [m('Low Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
  {
    formula_name: 'Tear Off — Standard Slope (squares)',
    formula_key: 'tear_off_standard_slope_sq',
    formula_description: 'Standard-slope area / 100 SQFT per square',
    expression: '$1/$2',
    expression_map: [m('Standard Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
  {
    formula_name: 'Tear Off — Steep Slope (squares)',
    formula_key: 'tear_off_steep_slope_sq',
    formula_description: 'Steep-slope area / 100 SQFT per square',
    expression: '$1/$2',
    expression_map: [m('Steep Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
  {
    formula_name: 'Tear Off — Very Steep (squares)',
    formula_key: 'tear_off_very_steep_sq',
    formula_description: 'Very-steep area / 100 SQFT per square',
    expression: '$1/$2',
    expression_map: [m('Very Steep Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
  {
    formula_name: 'Shingle Install — Low Slope (squares)',
    formula_key: 'shingle_install_low_slope_sq',
    formula_description: 'Low-slope area / 100 SQFT per square',
    expression: '$1/$2',
    expression_map: [m('Low Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
  {
    formula_name: 'Shingle Install — Standard Slope (squares)',
    formula_key: 'shingle_install_standard_slope_sq',
    formula_description: 'Standard-slope area / 100 SQFT per square',
    expression: '$1/$2',
    expression_map: [m('Standard Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
  {
    formula_name: 'Shingle Install — Steep Slope (squares)',
    formula_key: 'shingle_install_steep_slope_sq',
    formula_description: 'Steep-slope area / 100 SQFT per square',
    expression: '$1/$2',
    expression_map: [m('Steep Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
  {
    formula_name: 'Shingle Install — Very Steep (squares)',
    formula_key: 'shingle_install_very_steep_sq',
    formula_description: 'Very-steep area / 100 SQFT per square',
    expression: '$1/$2',
    expression_map: [m('Very Steep Slope'), c(100)],
    rounding_mechanism: 'NEXT_WHOLE_NUMBER',
    proposal_line_items: [],
  },
]

// Lookup: proposal_line_item display_name → formula_key
export const ITEM_TO_FORMULA_KEY: Record<string, string> = {}
for (const def of FORMULA_DEFINITIONS) {
  for (const item of def.proposal_line_items) {
    ITEM_TO_FORMULA_KEY[item] = def.formula_key
  }
}
