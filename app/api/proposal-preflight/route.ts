import { NextRequest, NextResponse } from 'next/server'
import { fetchWithRetry, zuperHeaders } from '@/lib/zuper-fetch'

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey, categoryUid: knownCategoryUid } = await req.json() as {
      baseUrl: string
      apiKey: string
      categoryUid?: string
    }

    // 1. Job categories
    const catsRes = await fetchWithRetry(`${baseUrl}jobs/category`, { headers: zuperHeaders(apiKey) })
    const categories: { category_uid: string; category_name: string; is_deleted: boolean }[] = catsRes.json?.data ?? []
    const activeCategories = categories.filter(c => !c.is_deleted)
    const roofCat = activeCategories.find(c => c.category_name.toLowerCase().includes('roof inspection'))

    const categoryUid = roofCat?.category_uid ?? knownCategoryUid ?? ''
    const categoryName = roofCat?.category_name ?? ''

    // 2. Job statuses for the resolved category
    let statuses: { status_uid: string; status_name: string }[] = []
    let statusUid = ''
    let statusName = ''

    if (categoryUid) {
      const statusRes = await fetchWithRetry(`${baseUrl}jobs/status/${categoryUid}`, { headers: zuperHeaders(apiKey) })
      statuses = statusRes.json?.data?.job_statuses ?? []
      const cpqStatus = statuses.find(s => s.status_name.toLowerCase().includes('create proposal'))
      statusUid = cpqStatus?.status_uid ?? ''
      statusName = cpqStatus?.status_name ?? ''
    }

    // 3. Layout templates
    const layoutRes = await fetchWithRetry(`${baseUrl}layout_templates`, { headers: zuperHeaders(apiKey) })
    const layouts: { layout_uid: string; layout_name: string; is_deleted: boolean }[] = layoutRes.json?.data ?? []
    const activeLayouts = layouts.filter(l => !l.is_deleted)
    const roofLayout = activeLayouts.find(l => l.layout_name.toLowerCase().includes('residential roofing'))

    return NextResponse.json({
      // Resolved values (empty string = not found)
      categoryUid, categoryName,
      statusUid, statusName,
      layoutUid:   roofLayout?.layout_uid   ?? '',
      layoutName:  roofLayout?.layout_name  ?? '',
      // Picker options (shown when auto-detect fails)
      categoryOptions: !roofCat   ? activeCategories.map(c => ({ uid: c.category_uid, name: c.category_name })) : [],
      statusOptions:   !statusUid ? statuses.map(s => ({ uid: s.status_uid, name: s.status_name })) : [],
      layoutOptions:   !roofLayout ? activeLayouts.map(l => ({ uid: l.layout_uid, name: l.layout_name })) : [],
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
