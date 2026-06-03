/**
 * Universal roofing accessory products for ABC Supply accounts.
 * Mirrors lib/accessory-catalog.ts — same 15 slots, ABC's family_ids.
 *
 * Each id is an abc_items.family_id (TEXT, prefixed with `PFam_`) — also the
 * abc_products view's product_id since the view groups by family_id.
 *
 * Picks chosen from `find-abc-accessory-gaps.py` output (2026-06-03):
 *  - Cheapest priced family per slot, preferring real Family records over
 *    inventory Lot records (PFam_* vs PLot_*).
 *  - Where the cheapest pick was off-slot (e.g. "Caulk" returned a spray paint),
 *    we picked the cheapest semantically correct alternative.
 *  - Where a Big 3 brand was available at the lowest tier, it wins over an
 *    unbranded equivalent (matches the SRS accessory catalog approach).
 */
export const ABC_ACCESSORY_PRODUCT_IDS: string[] = [
  'PFam_3359303',  // Drip Edge — Triangle Industries — Plum Tree Drip Edge
  'PFam_3402190',  // Underlayment Synthetic — Owens Corning — Mineral Surfaced Roll
  'PFam_3357525',  // Ice & Water Standard — GAF — UnderRoof 2 Leak Barrier
  'PFam_3359245',  // Ice & Water HT — Owens Corning — WeatherLock Speciality Tile & Metal
  'PFam_3476422',  // Coil Nails — National Nail — Pro-Fit Electro Galvanized Roofing Nails
  'PFam_3477055',  // Plastic Cap Nails — Simplex Nails — Masonry Cap Nails
  'PFam_4343467',  // Step Flashing — Velux — ECL Flashing Kit
  'PFam_3359308',  // W-Valley — Triangle Industries — Plum Tree W-Valley Flashing
  'PFam_3356447',  // Pipe Boot 3" — Deks — Dektite Original EPDM Pipe Flashing
  'PFam_3358459',  // Ridge Vent — Lomanco — LPR Ridge Vent (matches SRS pick)
  'PFam_3356334',  // Starter Strip — DaVinci Roofscapes — Single-Width Starter
  'PFam_3354025',  // Caulk / Sealant — OSI — Quad Max Window/Door/Siding Sealant
  'PFam_3355418',  // Counter / Headwall Flashing — Bay Cities Metal — Roof to Wall Flashing
  'PFam_4237126',  // Gutter Apron — Alsco — Steel Roof Edge Style G
  'PFam_3354906',  // Box Vent — Air Vent — Filter Vent
]

export const ABC_ACCESSORY_COUNT = ABC_ACCESSORY_PRODUCT_IDS.length
