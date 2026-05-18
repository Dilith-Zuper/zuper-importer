/**
 * Universal QXO accessory products — auto-loaded into every account regardless
 * of brand selection. The QXO equivalent of `accessory-catalog.ts`.
 *
 * Hand-picked from the catalog after enrichment. Picks favor good/better
 * family_tier products in well-stocked brands.
 *
 * To revalidate or replace any entry: run
 *
 *   node enrich-qxo-account-flags.js   # if changing tier rules first
 *
 * then query qxo_products for the proposal_line_item slot to find candidates.
 *
 * Refinement is expected — the v1 list is intentionally narrow. Add IDs as
 * CSMs flag gaps.
 */

export const QXO_ACCESSORY_PRODUCT_KEYS: string[] = [
  // Drip Edge
  'C-010166',  // Berger — 0.0125" A5 Painted Aluminum Drip Edge
  'C-010169',  // Berger — 0.0125" B5 Mill Finish Aluminum Drip Edge

  // Underlayment — Synthetic
  'C-010634',  // GAF — Shingle-Mate Roof Deck Protection
  'C-012706',  // CertainTeed — Roofers' Select High Performance Underlayment

  // Ice & Water — Standard
  'C-010639',  // GCP — 36" x 75' Ice & Water Shield
  'C-262662',  // Owens Corning — WeatherLock Mat Self-Sealing Ice & Water Barrier

  // Coil Nails
  'C-016220',  // Generic — 8d Ring Shank BR Coil Nails

  // Plastic Cap Nails
  'C-011807',  // Independent Nail — 1" Round Head Metal Cap Nail

  // W-Valley
  'C-010261',  // Berger — 8" x 50' Mill Finish Aluminum Valley Flashing

  // Pipe Boot 3"
  'C-039387',  // IPS — Aluminum Base Roof Flashing for 3" Vent Pipe

  // Ridge Vent
  'C-018530',  // Lomanco — 10' LPR Lo-Profile Ridge Vent

  // Counter / Headwall Flashing
  'C-296949',  // Bay Cities Metal — 1/2" x 5" Galvanized Counter Flashing

  // Gutter Apron
  'C-634121',  // Tri-Built — Premium Aluminum Gutter Apron
]

export const QXO_ACCESSORY_COUNT = QXO_ACCESSORY_PRODUCT_KEYS.length
