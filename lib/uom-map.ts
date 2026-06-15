// Catalog UOM codes → Zuper UOM codes (SRS + ABC + QXO)
// Zuper's roofing-industry UOM list (misc/uom?filter.industry=roofing) is just
// 13 codes: SQ, SQFT, LF, EA, PC, GAL, HR, BDL, PCT, RL, BX, PITCH, INCH.
// TB (tube) has no Zuper equivalent — mapped to EA (each)
// ABC spells bundle "BD"; QXO spells it "BDL"
export const UOM_MAP: Record<string, string> = {
  BD:  'BDL',
  BDL: 'BDL',
  RL:  'RL',
  PC:  'PC',
  EA:  'EA',
  BX:  'BX',
  SQ:  'SQ',
  TB:  'EA',
  LF:  'LF',
  SF:  'SQFT', // square foot
  SHT: 'PC',   // sheet — one discrete piece

  // Containers, packs, kits, and weight/volume units (covers the long tail of
  // SRS order_uom codes — see srs-add-order-uom-column.sql). Each container is
  // one sellable unit; mapping gallon/weight sizes to GAL would imply
  // per-gallon pricing/quantity, but these are priced per container.
  BAG: 'EA', PACK: 'EA', PKG: 'EA', CTN: 'EA', KIT: 'EA', SET: 'EA',
  PAIR: 'EA', CN: 'EA', BKT: 'EA', PAIL: 'EA', BTL: 'EA', DRUM: 'EA',
  TOTE: 'EA', CART: 'EA', TUB: 'EA', CR: 'EA', PAL: 'EA',
  '1G': 'EA', '1.5G': 'EA', '2G': 'EA', '2.5G': 'EA', '3G': 'EA', '3.5G': 'EA',
  '4G': 'EA', '4.5G': 'EA', '5G': 'EA', '15G': 'EA', '50G': 'EA', '55G': 'EA',
  '475G': 'EA', '2L': 'EA',
  LB: 'EA', KG: 'EA', QT: 'EA', PT: 'EA', TON: 'EA', YARD: 'EA',
}

export function toZuperUom(srsUom: string | string[] | null | undefined): string {
  const raw = Array.isArray(srsUom) ? srsUom[0] : srsUom
  return UOM_MAP[raw ?? ''] ?? 'EA'
}
