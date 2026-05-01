import { NextRequest, NextResponse } from 'next/server'
import { fetchWithRetry, zuperHeaders } from '@/lib/zuper-fetch'

export async function POST(req: NextRequest) {
  try {
    const { companyLoginName, apiKey } = await req.json()

    if (!companyLoginName?.trim() || !apiKey?.trim()) {
      return NextResponse.json({ error: 'Company name and API key are required' }, { status: 400 })
    }

    // 1. Resolve base URL from company name
    const configRes = await fetch('https://accounts.zuperpro.com/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ company_name: companyLoginName.trim() }),
    })

    if (!configRes.ok) {
      return NextResponse.json({ error: 'Company not found. Check the login name.' }, { status: 400 })
    }

    const configData = await configRes.json()
    const dcApiUrl: string = configData?.config?.dc_api_url
    if (!dcApiUrl) {
      return NextResponse.json({ error: 'Could not resolve company region. Check the login name.' }, { status: 400 })
    }

    // Normalise: always ends with /api/ so reference utilities work without modification
    const baseUrl = dcApiUrl.replace(/\/?$/, '/api/')

    // 2. Verify API key
    const verifyRes = await fetchWithRetry(`${baseUrl}user/company`, {
      headers: zuperHeaders(apiKey),
    })

    if (!verifyRes.ok) {
      return NextResponse.json({ error: 'Invalid API key. Check key and try again.' }, { status: 401 })
    }

    const companyName: string =
      verifyRes.json?.data?.company_name ??
      verifyRes.json?.company_name ??
      companyLoginName

    return NextResponse.json({ baseUrl, companyName })
  } catch (e: unknown) {
    const msg = (e as Error).message ?? 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
