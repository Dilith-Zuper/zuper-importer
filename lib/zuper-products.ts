import { fetchWithRetry, zuperHeaders } from './zuper-fetch'
import { mapWithLimit } from './limit'

const SCAN_CONCURRENCY = 8
const PAGE_SIZE = 100
const MAX_PAGES = 250

export interface ZuperProductRow {
  product_uid?: string
  product_id?: string | number
  product_name?: string
  product_category?: string
  product_type?: string
  option?: { option_label?: string; option_values?: Array<{ option_uid?: string; option_value?: string }> }
  [k: string]: unknown
}

export interface FetchAllOptions {
  /** Called as pages drain so callers can stream scan progress. */
  onProgress?: (pageNumber: number, totalPages: number) => void
  /** Return true to stop early (e.g. the SSE controller closed). */
  aborted?: () => boolean
}

/**
 * Fetch every product in a Zuper account, paginated with bounded concurrency.
 *
 * The product-list endpoint differs by Zuper data-center: some serve it at
 * `product` (singular, e.g. us-west-1c), others at `products` (plural). The bare-
 * plural assumption silently 404'd on singular regions. Resolve the working
 * segment from page 1, then reuse it for the fan-out. Page 1 reports
 * `total_records`; remaining pages fan out at SCAN_CONCURRENCY.
 *
 * Lifted from app/api/upload/route.ts's idempotency scan so the upload and remap
 * flows share one implementation. Returns raw rows; callers map them as needed.
 */
export async function fetchAllZuperProducts(
  baseUrl: string,
  apiKey: string,
  opts: FetchAllOptions = {},
): Promise<ZuperProductRow[]> {
  const { onProgress, aborted } = opts
  const all: ZuperProductRow[] = []

  const listUrl = (segment: string, page: number) =>
    `${baseUrl}${segment}?count=${PAGE_SIZE}&page=${page}`

  let listSegment = 'product'
  let first = await fetchWithRetry(listUrl(listSegment, 1), { headers: zuperHeaders(apiKey) })
  if (first.status === 404) {
    listSegment = 'products'
    first = await fetchWithRetry(listUrl(listSegment, 1), { headers: zuperHeaders(apiKey) })
  }
  const firstRows = (first.json?.data ?? []) as ZuperProductRow[]
  all.push(...firstRows)
  const totalRecords: number | undefined =
    typeof first.json?.total_records === 'number' ? first.json.total_records : undefined

  if (firstRows.length >= PAGE_SIZE) {
    const totalPages = totalRecords
      ? Math.min(Math.ceil(totalRecords / PAGE_SIZE), MAX_PAGES)
      : MAX_PAGES
    onProgress?.(1, totalPages)

    let stop = false
    for (let chunkStart = 2; chunkStart <= totalPages && !stop && !aborted?.(); chunkStart += SCAN_CONCURRENCY) {
      const chunkEnd = Math.min(chunkStart + SCAN_CONCURRENCY - 1, totalPages)
      const pageNums = Array.from({ length: chunkEnd - chunkStart + 1 }, (_, i) => chunkStart + i)
      const pages = await mapWithLimit(pageNums, SCAN_CONCURRENCY, async (pageNumber) => {
        const r = await fetchWithRetry(listUrl(listSegment, pageNumber), { headers: zuperHeaders(apiKey) })
        return { pageNumber, rows: (r.json?.data ?? []) as ZuperProductRow[] }
      })
      pages.sort((a, b) => a.pageNumber - b.pageNumber)
      for (const p of pages) {
        all.push(...p.rows)
        if (p.rows.length < PAGE_SIZE) stop = true
      }
      onProgress?.(chunkEnd, totalPages)
    }
  }

  return all
}
