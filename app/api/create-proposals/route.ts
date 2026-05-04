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
  packages: { brand: string; templateName: string; templateDescription: string; pkg: BrandPackage }[]
}

export async function POST(req: NextRequest) {
  const input: CreateInput = await req.json()
  const { baseUrl, apiKey, categoryUid, statusUid, layoutTemplateUid, formulaMap, productIdMap, packages } = input

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      for (const { brand, templateName, templateDescription, pkg } of packages) {
        try {
          emit({ brand, status: 'running', step: 'Creating template…' })

          // Step 1: Create template
          const createRes = await fetchWithRetry(`${baseUrl}invoice_estimate/proposal_template`, {
            method: 'POST',
            headers: zuperHeaders(apiKey),
            body: JSON.stringify({ proposal_template: { template_name: templateName, template_description: templateDescription, template_type: 'CPQ' } }),
          })
          const templateUid = createRes.json?.data?.template_uid
          if (!templateUid) throw new Error(`Failed to create template: ${JSON.stringify(createRes.json)}`)

          emit({ brand, status: 'running', step: 'Creating options…' })

          // Step 2: Create Good / Better / Best options
          const optionsRes = await fetchWithRetry(`${baseUrl}invoice_estimate/proposal_template/${templateUid}/options?items_type=LINE_ITEMS`, {
            method: 'POST',
            headers: zuperHeaders(apiKey),
            body: JSON.stringify({
              proposal_options: [
                { option_name: 'Good',   option_description: '', option_image: '', promo: '', is_recommended: false },
                { option_name: 'Better', option_description: '', option_image: '', promo: '', is_recommended: true },
                { option_name: 'Best',   option_description: '', option_image: '', promo: '', is_recommended: false },
              ],
            }),
          })

          const options: { option_uid: string; option_name: string }[] = optionsRes.json?.data ?? []
          if (!options.length) throw new Error('Failed to create options')

          const optionUidFor = (name: string) => options.find(o => o.option_name === name)?.option_uid ?? ''
          const goodUid   = optionUidFor('Good')
          const betterUid = optionUidFor('Better')
          const bestUid   = optionUidFor('Best')

          emit({ brand, status: 'running', step: 'Configuring trigger & layout…' })

          // Step 3: PUT trigger + layout
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
                layout_template_uid: layoutTemplateUid,
                is_draft: false,
              },
            }),
          })

          // Step 4: Add line items to each option
          const tierMap: [string, ProposalLineItem[]][] = [
            [goodUid,   pkg.good],
            [betterUid, pkg.better],
            [bestUid,   pkg.best],
          ]

          for (const [optionUid, items] of tierMap) {
            if (!optionUid || !items.length) continue
            emit({ brand, status: 'running', step: `Adding line items to ${options.find(o => o.option_uid === optionUid)?.option_name ?? ''}…` })

            const lineItemsUrl = `${baseUrl}invoice_estimate/proposal_template/${templateUid}/options/${optionUid}/line_items?items_type=LINE_ITEMS`

            // POST HEADER section
            const headerRes = await fetchWithRetry(lineItemsUrl, {
              method: 'POST',
              headers: zuperHeaders(apiKey),
              body: JSON.stringify({ line_item: { type: 'HEADER', line_item_type: 'HEADER', product_name: 'Material', section_type: 'EXPANDED', show_section_total: false, show_child_prices: true } }),
            })
            const sectionUid = headerRes.json?.data?.section_uid ?? headerRes.json?.data?.line_item_uid ?? ''

            // POST each product
            for (const item of items) {
              const zuperProductUid = productIdMap[String(item.product_id)]
              if (!zuperProductUid) continue  // product not uploaded — skip

              const formulaUid = item.formula_key ? formulaMap[item.formula_key] : undefined
              const quantityFields = formulaUid
                ? { quantity_type: 'FORMULA', formula_uid: formulaUid }
                : { quantity_type: 'FIXED', quantity: 1 }

              await fetchWithRetry(lineItemsUrl, {
                method: 'POST',
                headers: zuperHeaders(apiKey),
                body: JSON.stringify({
                  line_item: {
                    type: 'ITEM',
                    line_item_type: 'ITEM',
                    product_name: item.product_name,
                    product: zuperProductUid,
                    product_type: 'PARTS',
                    ...quantityFields,
                    ...(sectionUid ? { section_uid: sectionUid, section_name: 'Material' } : {}),
                  },
                }),
              })
            }
          }

          emit({ brand, status: 'done', templateUid })
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
