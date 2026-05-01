// SRS catalog UOM codes → Zuper UOM codes
// TB (tube) has no Zuper equivalent — mapped to EA (each)
export const UOM_MAP: Record<string, string> = {
  BD:  'BDL',
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
