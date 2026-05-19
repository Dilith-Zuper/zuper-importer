import { createClient } from '@supabase/supabase-js'

// Env vars are validated lazily, not at module load. Next 14 evaluates every
// API route's module during "Collecting page data" to determine static-vs-
// dynamic. Preview deploys on Vercel may not have the Supabase env vars
// scoped to them — throwing here would crash the build with an opaque
// "Failed to collect page data" error even though the code is fine.
//
// Placeholders let createClient succeed at build time. At runtime, any actual
// query against a placeholder URL will fail with a clear network error, and
// production starts log a warning so missing config is visible in Vercel logs.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://placeholder.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? 'placeholder-key'

if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  if (!process.env.SUPABASE_URL) {
    console.error('Missing SUPABASE_URL — Supabase queries will fail at runtime')
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_SERVICE_KEY — Supabase queries will fail at runtime')
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})
