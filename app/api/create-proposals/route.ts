import { NextRequest } from 'next/server'
import { fetchWithRetry, zuperHeaders } from '@/lib/zuper-fetch'
import type { BrandPackage, ProposalLineItem } from '@/types/wizard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface CreateInput {
  baseUrl: string
  apiKey: string
  categoryUid: string
  statusUid: string
  layoutTemplateUid: string
  formulaMap: Record<string, string>
  productIdMap: Record<string, string>
  gutterItems: ProposalLineItem[]
  sidingItems: ProposalLineItem[]
  packages: { brand: string; templateName: string; templateDescription: string; pkg: BrandPackage }[]
}

export async function POST(req: NextRequest) {
  const input: CreateInput = await req.json()
  const { baseUrl, apiKey, categoryUid, statusUid, layoutTemplateUid, formulaMap, productIdMap, gutterItems, sidingItems, packages } = input

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      // ── Fetch live formula map (formula_key → formula_uid) from Zuper ────────
      // Always refresh from the account rather than relying on the cached store value.
      const liveFormulaMap: Record<string, string> = { ...formulaMap }
      try {
        let page = 1
        while (true) {
          const r = await fetchWithRetry(
            `${baseUrl}invoice_estimate/cpq/formulas?count=100&page=${page}`,
            { headers: zuperHeaders(apiKey) }
          )
          const rows: { formula_key: string; formula_uid: string }[] = r.json?.data ?? []
          for (const f of rows) {
            if (f.formula_key && f.formula_uid) liveFormulaMap[f.formula_key] = f.formula_uid
          }
          if (rows.length < 100) break
          page++
        }
      } catch { /* fall back to passed formulaMap */ }

      // ── Per-brand template creation ──────────────────────────────────────────
      for (const { brand, templateName, templateDescription, pkg } of packages) {
        try {
          emit({ brand, status: 'running', step: 'Creating template…' })

          // Step 1: Create template
          const createRes = await fetchWithRetry(`${baseUrl}invoice_estimate/proposal_template`, {
            method: 'POST',
            headers: zuperHeaders(apiKey),
            body: JSON.stringify({
              proposal_template: {
                template_name: templateName,
                template_description: templateDescription,
                template_type: 'CPQ',
              },
            }),
          })
          const templateUid = createRes.json?.data?.template_uid
          if (!templateUid) throw new Error(`Failed to create template: ${JSON.stringify(createRes.json)}`)

          emit({ brand, status: 'running', step: 'Creating options…' })

          // Step 2: Create Good / Better / Best options
          const optionsRes = await fetchWithRetry(
            `${baseUrl}invoice_estimate/proposal_template/${templateUid}/options?items_type=LINE_ITEMS`,
            {
              method: 'POST',
              headers: zuperHeaders(apiKey),
              body: JSON.stringify({
                proposal_options: [
                  { option_name: 'Good',   option_description: '', option_image: '', promo: '', is_recommended: false },
                  { option_name: 'Better', option_description: '', option_image: '', promo: '', is_recommended: true },
                  { option_name: 'Best',   option_description: '', option_image: '', promo: '', is_recommended: false },
                ],
              }),
            }
          )

          const options: { option_uid: string; option_name: string }[] = optionsRes.json?.data ?? []
          if (!options.length) throw new Error(`Failed to create options: ${JSON.stringify(optionsRes.json)}`)

          const optionUidFor = (name: string) => options.find(o => o.option_name === name)?.option_uid ?? ''
          const goodUid   = optionUidFor('Good')
          const betterUid = optionUidFor('Better')
          const bestUid   = optionUidFor('Best')

          emit({ brand, status: 'running', step: 'Configuring trigger & layout…' })

          // Step 3: PUT trigger + layout + publish
          await fetchWithRetry(`${baseUrl}invoice_estimate/proposal_template/${templateUid}`, {
            method: 'PUT',
            headers: zuperHeaders(apiKey),
            body: JSON.stringify({
              proposal_template: {
                template_name: templateName,
                template_description: templateDescription,
                template_type: 'CPQ',
                template_uid: templateUid,
                cpq_config: { trigger: [{ job_category_uid: categoryUid, job_status_uid: statusUid }] },
                ...(layoutTemplateUid ? { layout_template_uid: layoutTemplateUid } : {}),
                is_draft: false,
              },
            }),
          })

          // Step 4: Add line items to each option
          const tierMap: [string, string, ProposalLineItem[]][] = [
            [goodUid,   'Good',   pkg.good],
            [betterUid, 'Better', pkg.better],
            [bestUid,   'Best',   pkg.best],
          ]

          for (const [optionUid, tierName, items] of tierMap) {
            if (!optionUid || !items.length) continue

            emit({ brand, status: 'running', step: `Adding ${items.length} items to ${tierName}…` })

            const lineItemsUrl = `${baseUrl}invoice_estimate/proposal_template/${templateUid}/options/${optionUid}/line_items?items_type=LINE_ITEMS`

            // POST HEADER section — response.data is an array
            const headerRes = await fetchWithRetry(lineItemsUrl, {
              method: 'POST',
              headers: zuperHeaders(apiKey),
              body: JSON.stringify({
                line_item: {
                  type: 'HEADER',
                  line_item_type: 'HEADER',
                  product_name: 'Material',
                  section_type: 'EXPANDED',
                  show_section_total: false,
                  show_child_prices: true,
                },
              }),
            })
            const hd = headerRes.json?.data
            const hdItem = Array.isArray(hd) ? hd[0] : hd
            const sectionUid: string = hdItem?.section_uid ?? hdItem?.line_item_uid ?? hdItem?.uid ?? ''

            // POST each product line item
            for (const item of items) {
              const zuperProductUid = productIdMap[String(item.product_id)]
              if (!zuperProductUid) continue

              const formulaUid = item.formula_key ? liveFormulaMap[item.formula_key] : undefined

              const lineItemBody = {
                line_item: {
                  type: 'ITEM',
                  line_item_type: 'ITEM',
                  product_name: item.product_name,
                  product: zuperProductUid,
                  product_type: 'PARTS',
                  quantity: 1,
                  ...(formulaUid
                    ? { quantity_type: 'FORMULA', formula: formulaUid }
                    : { quantity_type: 'FIXED' }),
                  ...(sectionUid ? { section_uid: sectionUid, section_name: 'Material' } : {}),
                },
              }

              const itemRes = await fetchWithRetry(lineItemsUrl, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify(lineItemBody),
              })

              // If formula UID was rejected, retry as FIXED
              if (!itemRes.ok && formulaUid) {
                await fetchWithRetry(lineItemsUrl, {
                  method: 'POST',
                  headers: zuperHeaders(apiKey),
                  body: JSON.stringify({
                    line_item: {
                      ...lineItemBody.line_item,
                      quantity_type: 'FIXED',
                      formula: undefined,
                    },
                  }),
                })
              }
            }
          }

          // ── Gutter and Siding sections (same items in all 3 options) ──────
          const extraSections: { label: string; items: ProposalLineItem[] }[] = []
          if (gutterItems?.length) extraSections.push({ label: 'Gutter Materials', items: gutterItems })
          if (sidingItems?.length)  extraSections.push({ label: 'Siding Materials',  items: sidingItems })

          for (const { label, items } of extraSections) {
            for (const opt of options) {
              const sectionUrl = `${baseUrl}invoice_estimate/proposal_template/${templateUid}/options/${opt.option_uid}/line_items?items_type=LINE_ITEMS`

              const hdr = await fetchWithRetry(sectionUrl, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify({ line_item: { type: 'HEADER', line_item_type: 'HEADER', product_name: label, section_type: 'EXPANDED', show_section_total: false, show_child_prices: true } }),
              })
              const hd2 = hdr.json?.data
              const hdItem2 = Array.isArray(hd2) ? hd2[0] : hd2
              const secUid: string = hdItem2?.section_uid ?? hdItem2?.line_item_uid ?? hdItem2?.uid ?? ''

              emit({ brand, status: 'running', step: `Adding ${items.length} items to ${opt.option_name} — ${label}…` })

              for (const item of items) {
                const zuperProductUid = productIdMap[String(item.product_id)]
                if (!zuperProductUid) continue
                const formulaUid = item.formula_key ? liveFormulaMap[item.formula_key] : undefined
                const itemRes = await fetchWithRetry(sectionUrl, {
                  method: 'POST',
                  headers: zuperHeaders(apiKey),
                  body: JSON.stringify({
                    line_item: {
                      type: 'ITEM', line_item_type: 'ITEM',
                      product_name: item.product_name, product: zuperProductUid,
                      product_type: 'PARTS', quantity: 1,
                      ...(formulaUid ? { quantity_type: 'FORMULA', formula: formulaUid } : { quantity_type: 'FIXED' }),
                      ...(secUid ? { section_uid: secUid, section_name: label } : {}),
                    },
                  }),
                })
                if (!itemRes.ok && formulaUid) {
                  await fetchWithRetry(sectionUrl, {
                    method: 'POST',
                    headers: zuperHeaders(apiKey),
                    body: JSON.stringify({ line_item: { type: 'ITEM', line_item_type: 'ITEM', product_name: item.product_name, product: zuperProductUid, product_type: 'PARTS', quantity: 1, quantity_type: 'FIXED', ...(secUid ? { section_uid: secUid, section_name: label } : {}) } }),
                  })
                }
              }
            }
          }

          emit({ brand, status: 'done', step: `Template created` })
        } catch (e: unknown) {
          emit({ brand, status: 'error', message: (e as Error).message })
        }
      }

      emit({ type: 'complete' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
