/**
 * Universal roofing accessory products uploaded to every account regardless of brand selection.
 * These cover the commodity items (drip edge, nails, underlayment, flashing, pipe boots,
 * ridge vent, starter, caulk) that 89% of accounts carry as generic/unbranded stock.
 * SRS has branded equivalents for all — same set for every account, not brand-tied.
 *
 * To revalidate or replace any entry: run `node find-accessory-gaps.js` from the
 * product-importer dir for that specific proposal_line_item.
 */
export const ACCESSORY_PRODUCT_IDS: number[] = [
  // Drip Edge
  119896,  // Mastic — Aluminum F Drip Edge
  190032,  // DOT Metal Products — Aluminum D-Style Long Eave Drip Edge

  // Underlayment — Synthetic
  137828,  // Continental Materials — CMI SecureGripPRO Synthetic Underlayment
  95601,   // Owens Corning — ProArmor Synthetic Underlayment

  // Ice & Water Shield
  133778,  // Owens Corning — Titanium FR Self-Adhered Ice & Water
  161582,  // Tarco — LeakBarrier MS300 Ice & Water

  // Coil Nails
  212070,  // Grip-Rite — TTC Pack Coil Nails
  79025,   // National Nail — ProFIT Coil Nails

  // Plastic Cap Nails
  91472,   // National Nail — Stinger EG RS Plastic Cap Nails (DB-classified as Fasteners)
  79219,   // National Nail — Stinger Plastic Cap NailPac (proposal_line_item = Plastic Cap Nails)

  // Step Flashing
  135477,  // Verde — Steel Step Flashing
  112508,  // Taylor — Prebent Step Flashing

  // Valley Metal
  160264,  // Bay Cities Metal — Aluminum Roll Valley Flashing
  92052,   // W-Valley (Copper)

  // Pipe Boots
  // 93517 removed — DMI is in OTHER FLASHING METAL with proposal_line_item='Step Flashing'
  // in the DB (miscategorized), so it would land in the wrong proposal slot
  164240,  // Dektite — EPDM Pipe Boot
  164159,  // Dektite — High Temp Pipe Boot

  // Ridge Vent
  87851,   // Lomanco — PRO4-SWN OmniRidge Vent with Nails
  76806,   // Lomanco — Aluminum LPR-10 Ridge Vent

  // Starter Strip
  686,     // Owens Corning — Starter Strip

  // Caulk / Sealant
  194970,  // G.A.P. — DYNAFLEX Caulk

  // Counter / Headwall Flashing — Bay Cities (5 SKUs in catalog, workhorse brand)
  75999,   // Bay Cities Metal — Bay Cities Counter Flashing
]

export const ACCESSORY_COUNT = ACCESSORY_PRODUCT_IDS.length
