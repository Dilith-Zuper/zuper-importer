// Catalog UOM codes → Zuper UOM codes (SRS + ABC + QXO)
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
}

export function toZuperUom(srsUom: string | string[] | null | undefined): string {
  const raw = Array.isArray(srsUom) ? srsUom[0] : srsUom
  return UOM_MAP[raw ?? ''] ?? 'EA'
}
