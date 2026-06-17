/**
 * SRS fuzzy-matching engine — TypeScript port of the pure scoring core of
 * `product importer/match-account-to-srs.js`.
 *
 * Given an account's free-text product name (e.g. an existing Zuper product),
 * score it against every SRS catalog product (token overlap + brand + dimension
 * signals), gated by coarse product TYPE and form-token DISTINGUISHERS, and
 * bucket the best candidate exact / strong / weak / none.
 *
 * The scoring math is intentionally identical to the audited CLI so the in-app
 * remap flow produces the same matches a CSM would get from the offline tool.
 * Excel I/O, Supabase access, and the labor/fee splitting all live in the caller.
 */

// ── HTML-entity decode (ported minimal subset of product importer/lib/html-entities) ─
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  reg: '®', trade: '™', copy: '©',
  deg: '°', plusmn: '±', times: '×', divide: '÷',
  bull: '•', middot: '·', hellip: '…',
  ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  nbsp: ' ',
  frac12: '½', frac14: '¼', frac34: '¾',
  micro: 'µ',
}

function decodeHtmlEntities(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = NAMED[String(name).toLowerCase()]
      return v == null ? m : v
    })
}

// ── Text normalization ────────────────────────────────────────────────────────
// Noise tokens — packaging/UOM/filler that carry no matching signal. NB: "ct" is
// deliberately NOT here (it's CertainTeed shorthand); brand detection runs first.
const NOISE = new Set([
  'gallon', 'gallons', 'gal', 'pail', 'pails', 'can', 'cans', 'box', 'boxes', 'bx', 'bundle',
  'bundles', 'bdl', 'roll', 'rolls', 'rl', 'sq', 'square', 'ft', 'feet', 'foot', 'lf', 'pc', 'pcs',
  'piece', 'pieces', 'each', 'ea', 'carton', 'cartons', 'ctn', 'pack', 'pkg', 'bag', 'bags', 'tube',
  'tubes', 'tb', 'case', 'cases', 'unit', 'units', 'count', 'the', 'with', 'and', 'for', 'of', 'per',
  'a', 'an', 'to', 'in', 'on', 'set', 'kit', 'new', 'used', 'x', 'size', 'color', 'colors',
])

// Labor / service / fee / change-order signals — NOT material parts; excluded from
// matching entirely. Checked on the NAME only.
const NON_MATERIAL_RE = /\b(labor|install(ation|ed|ing)?|tear[\s-]?off|tearoff|remov(e|al|ing)|haul|disposal|dispose|dump\s*fee|dumpster|permit|warranty|clean[\s-]?up|mobiliz|trip charge|restock|delivery|freight|travel|production fee|equipment rental|deposit|change order|sales tax|repair)\b/i
const NON_MATERIAL_PREFIX_RE = /^\s*(co\s*-|contract\s+to\s+match\b)/i

export function isNonMaterial(name: string | null | undefined): boolean {
  const n = String(name || '')
  if (NON_MATERIAL_PREFIX_RE.test(n)) return true
  return NON_MATERIAL_RE.test(n)
}

// Brand aliases (account shorthand → a token that appears in SRS manufacturer_norm).
const BRAND_ALIAS = new Map<string, string>([
  ['ct', 'certainteed'],
  ['oc', 'owens corning'],
  ['gaf', 'gaf'],
  ['apoc', 'apoc'],
  ['certainteed', 'certainteed'],
  ['owens', 'owens corning'],
  ['norwesco', 'norwesco'],
  ['versico', 'versico'],
  ['pabco', 'pabco'],
  ['quarrix', 'quarrix'],
])

// Account shorthand → SRS-canonical phrasing, applied to the part name before
// matching (matching only — the original name is still shown).
const SYNONYMS: Array<[RegExp, string]> = [
  [/\bdens[\s-]?deck\b/gi, 'densdeck elevate roof board'],
  [/\btri[\s-]?built\b/gi, ' '],
  [/\broof\s*runner\b/gi, 'roofrunner'],
]

export function applySynonyms(name: string | null | undefined): string {
  let s = String(name || '')
  for (const [re, rep] of SYNONYMS) s = s.replace(re, rep)
  return s
}

export function cleanText(s: string | null | undefined): string {
  if (s == null) return ''
  let t = decodeHtmlEntities(String(s))
  t = t.replace(/�/g, ' ').replace(/â€[]?/g, ' ')
  t = t.replace(/[‘’“”]/g, ' ').replace(/[–—]/g, ' ')
  return t
}

export function tokenize(s: string | null | undefined): string[] {
  const cleaned = cleanText(s).toLowerCase()
  const raw = cleaned
    .replace(/["()®™©°•·…]/g, ' ')
    .replace(/[^a-z0-9/.\-x]+/g, ' ')      // keep digits, x, /, ., -
    .split(/\s+/)
    .filter(Boolean)
  const tokens: string[] = []
  for (let tok of raw) {
    tok = tok.replace(/^[-.]+|[-.]+$/g, '')
    if (!tok) continue
    if (tok.length > 4 && tok.endsWith('s') && !tok.endsWith('ss')) tok = tok.slice(0, -1)
    tokens.push(tok)
  }
  return tokens
}

const isNumToken = (t: string) => /\d/.test(t)

// ── Product-type gating ───────────────────────────────────────────────────────
const TYPE_SIGS: Array<[string, RegExp]> = [
  ['shingle',      /\b(shingle|shingles|landmark|timberline|duration|oakridge|heritage|3[\s-]?tab|architectural|laminate[d]?)\b/i],
  ['starter',      /\b(starter|swift[\s-]?start)\b/i],
  ['ridge',        /\b(hip\s*&?\s*ridge|hip and ridge|ridge cap|cap shingle|shadow cap)\b/i],
  ['vent',         /\b(vent|vents|flapper|exhaust|louver|turbine|\brvo\b|\brv[\s-]?\d)\b/i],
  ['siding',       /\b(siding|vinyl|f[\s-]?channel|j[\s-]?channel|soffit|fascia|trim|lap|shake panel)\b/i],
  ['underlayment', /\b(underlayment|felt|roofrunner|synthetic underlay)\b/i],
  ['ice_water',    /\b(ice\s*&?\s*water|ice and water|i&w|winterguard|weatherguard|water\s*shield)\b/i],
  ['flashing',     /\b(flashing|drip edge|valley|step flash|counter flash|pipe boot|pipe flash|l[\s-]?flashing|apron)\b/i],
  ['membrane',     /\b(tpo|epdm|membrane|modified|mod bit|torch|cap sheet|base sheet|base ply|ply sheet|fleece|coil stock)\b/i],
  ['primer_adh',   /\b(primer|prime|cleaner|adhesive|bonding|sealant|sealer|caulk|mastic|cement|coating|cut[\s-]?edge)\b/i],
  ['fastener',     /\b(fastener|fasteners|staple|staples|nail|nails|screw|screws|barbed|termination bar|insulation plate|fastening plate)\b/i],
  ['tool',         /\b(gun|sprayer|spray gun|probe|roller|winch|strap|tie[\s-]?down|blade|knife)\b/i],
  ['decking',      /\b(osb|cdx|plywood|sheathing|nailboard|nail base|deck board|subfloor)\b/i],
  ['insulation',   /\b(polyiso|poly iso|\biso\b|insulation|coverboard|cover board|densdeck|gypsum|fan[\s-]?fold)\b/i],
]

function typesOf(name: string | null | undefined): Set<string> {
  const lc = ' ' + cleanText(name).toLowerCase() + ' '
  const s = new Set<string>()
  for (const [t, re] of TYPE_SIGS) if (re.test(lc)) s.add(t)
  return s
}

// Form-defining tokens (post-singularization). When a product has one of these and
// the account part doesn't (or vice-versa), it's likely the wrong form of the product.
const DISTINGUISHERS = new Set([
  'primer', 'cleaner', 'adhesive', 'sealer', 'sealant', 'caulk', 'mastic', 'cement',
  'coating', 'gun', 'sprayer', 'probe', 'roller', 'winch', 'strap', 'staple',
  'nailboard', 'tape', 'gypsum', 'knife', 'blade', 'cartridge', 'patch',
  'plate', 'rhinobond', 'kit', 'wheel', 'carriage', 'channel',
])

export interface Rep {
  all: string[]
  content: string[]
  set: Set<string>
  nums: Set<string>
  tok: Set<string>
  types: Set<string>
}

export function buildRep(name: string | null | undefined): Rep {
  const all = tokenize(name)
  const content = all.filter(t => !NOISE.has(t))
  return {
    all,
    content,
    set: new Set(content.length ? content : all),
    nums: new Set(all.filter(isNumToken)),
    tok: new Set(all),
    types: typesOf(name),
  }
}

export function detectBrand(name: string | null | undefined, brandVocab: string[]): string | null {
  for (const tok of tokenize(name)) {
    if (BRAND_ALIAS.has(tok)) return BRAND_ALIAS.get(tok)!
  }
  const lc = ' ' + cleanText(name).toLowerCase() + ' '
  for (const b of brandVocab) {
    if (lc.includes(' ' + b + ' ') || lc.includes(' ' + b)) return b
  }
  return null
}

const brandMatches = (aBrand: string | null, brandLc: string | null) =>
  !!(aBrand && brandLc && (brandLc === aBrand || brandLc.includes(aBrand) || aBrand.includes(brandLc)))

// ── SRS catalog product shape (as loaded for matching) ──────────────────────────
export interface SrsCatalogProduct {
  product_id: number
  product_name: string
  manufacturer_norm: string | null
  product_category: string | null
  proposal_line_item: string | null
  product_options: string[] | null
  // Computed once via prepareCatalog():
  rep?: Rep
  brandLc?: string | null
}

export interface ScoredMatch {
  prod: SrsCatalogProduct
  score: number
}

export type Confidence = 'exact' | 'strong' | 'weak' | 'none'

export interface MatchResult {
  best: ScoredMatch | null
  second: ScoredMatch | null
  third: ScoredMatch | null
  confidence: Confidence
  aBrand: string | null
  aBrandInSrs: boolean
}

// ── Scoring ─────────────────────────────────────────────────────────────────
function scoreMatch(
  aRep: Rep,
  aBrand: string | null,
  aBrandInSrs: boolean,
  prod: SrsCatalogProduct,
): number {
  const aSet = aRep.set
  const pSet = prod.rep!.set
  if (aSet.size === 0 || pSet.size === 0) return 0

  const brandToks = aBrand ? new Set(aBrand.split(/\s+/)) : new Set<string>()
  let inter = 0, nonBrandShared = 0
  for (const t of aSet) {
    if (pSet.has(t)) { inter++; if (!isNumToken(t) && !brandToks.has(t)) nonBrandShared++ }
  }
  const overlap = inter / aSet.size
  const union = aSet.size + pSet.size - inter
  const jaccard = inter / union

  let numInter = 0
  for (const n of aRep.nums) if (prod.rep!.nums.has(n)) numInter++
  const aNumCount = aRep.nums.size
  const numScore = aNumCount ? numInter / aNumCount : 0

  let score = 0.55 * overlap + 0.20 * jaccard + 0.06 * numScore

  // Brand: boost same-brand only when there's also a shared real product word.
  if (brandMatches(aBrand, prod.brandLc ?? null)) {
    score += nonBrandShared >= 1 ? 0.30 : 0.05
  } else if (aBrandInSrs && prod.brandLc) {
    score -= 0.25
  }

  // Product-type compatibility.
  const aT = aRep.types, pT = prod.rep!.types
  if (aT.size && pT.size) {
    let common = false
    for (const t of aT) if (pT.has(t)) { common = true; break }
    score += common ? 0.12 : -0.40
  }

  // Form-defining token mismatch.
  let distPen = 0
  for (const d of DISTINGUISHERS) {
    if (aRep.tok.has(d) !== prod.rep!.tok.has(d)) distPen += 0.16
  }
  score -= Math.min(distPen, 0.48)

  if (aNumCount && numInter < aNumCount) score -= 0.05 * (aNumCount - numInter)
  return score
}

function bucket(best: ScoredMatch | null, aRep: Rep): Confidence {
  if (!best || best.score < 0.32) return 'none'
  let inter = 0
  for (const t of aRep.set) if (best.prod.rep!.set.has(t)) inter++
  const fullCover = inter === aRep.set.size
  if (fullCover && best.score >= 0.7) return 'exact'
  if (best.score >= 0.55) return 'strong'
  return 'weak'
}

// ── Catalog preparation ───────────────────────────────────────────────────────
// Mutates each product to attach `rep` + `brandLc`, and returns the brand
// vocabulary used for brand detection on the account side. Call once per catalog.
export function prepareCatalog(products: SrsCatalogProduct[]): {
  brandVocab: string[]
  srsHasBrand: (aBrand: string | null) => boolean
} {
  const brandVocabSet = new Set<string>()
  for (const p of products) {
    p.rep = buildRep(p.product_name)
    p.brandLc = p.manufacturer_norm ? String(p.manufacturer_norm).toLowerCase().trim() : null
    if (p.brandLc) brandVocabSet.add(p.brandLc)
  }
  const brandVocab = [...brandVocabSet].filter(b => b.length >= 3).sort((a, b) => b.length - a.length)
  const srsHasBrand = (aBrand: string | null) =>
    !!aBrand && brandVocab.some(b => b.includes(aBrand) || aBrand.includes(b))
  return { brandVocab, srsHasBrand }
}

// ── Match one account part against the prepared catalog ─────────────────────────
export function matchProduct(
  part: { name: string; brand?: string | null },
  products: SrsCatalogProduct[],
  brandVocab: string[],
  srsHasBrand: (aBrand: string | null) => boolean,
): MatchResult {
  const matchName = applySynonyms(part.name)
  const aRep = buildRep(matchName)
  const aBrand = (part.brand && part.brand.trim())
    ? part.brand.toLowerCase().trim()
    : detectBrand(matchName, brandVocab)
  const aBrandInSrs = srsHasBrand(aBrand)

  let best: ScoredMatch | null = null
  let second: ScoredMatch | null = null
  let third: ScoredMatch | null = null
  for (const prod of products) {
    const s = scoreMatch(aRep, aBrand, aBrandInSrs, prod)
    if (!best || s > best.score) { third = second; second = best; best = { prod, score: s } }
    else if (!second || s > second.score) { third = second; second = { prod, score: s } }
    else if (!third || s > third.score) { third = { prod, score: s } }
  }

  return { best, second, third, confidence: bucket(best, aRep), aBrand, aBrandInSrs }
}

export const cleanForDisplay = (s: string | null | undefined): string =>
  cleanText(s).replace(/\s+/g, ' ').trim()
