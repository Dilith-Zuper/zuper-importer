// api/migrate-jn.js — JobNimbus + SumoQuote → Zuper Migration Backend
// Variant for accounts using the JobNimbus + SumoQuote integration.
// Kept as an independent copy of migrate.js — changes here do not affect standalone mode.

const SUMO_BASE   = 'https://internal.sumoquote.com/api/v1';
const CALC_BASE   = 'https://internal.sumoquote.com/api/v2'; // v2 calculations endpoint
const JN_BASE     = 'https://app.jobnimbus.com/api1/v2';     // JobNimbus v2 API

const BATCH_SIZE     = 10;      // items per concurrent batch (increased from 5 to halve creation time for large datasets)
const BATCH_DELAY_MS = 400;     // ms between batches
const FETCH_TIMEOUT_MS = 25_000; // 25s per individual upstream API call
const RETRY_MAX      = 2;       // up to 3 total attempts (1 + 2 retries)

const WEBHOOK_URL = 'https://staging-workflow.zuperpro.com/api/gatekeeper/workflow/webhook/f9a33c19-8b1a-46f4-a215-2ae98bea297a';
const RETRY_BASE_MS  = 800;     // backoff: 800ms, 1600ms

// ─── Helpers ─────────────────────────────────────────────────────────────────

// In-process lock: prevents the same account from running two migrations simultaneously.
// Keyed by sumoToken+zuperApiKey — works per Vercel instance (acceptable for internal tool).
const activeMigrations = new Map();

// ─── Webhook report helpers ───────────────────────────────────────────────────

function toCSV(rows, cols) {
  if (!rows?.length) return cols.map(c => `"${c.label}"`).join(',') + '\n(no data)';
  const hdr = cols.map(c => `"${c.label}"`).join(',');
  const lines = rows.map(r => cols.map(c => {
    let val = r;
    for (const k of c.key.split('.')) val = val?.[k];
    return `"${String(val ?? '').replace(/"/g, '""')}"`;
  }).join(','));
  return [hdr, ...lines].join('\n');
}

const M_COLS = [
  { label: 'Token Name', key: 'tokenName' }, { label: 'UOM', key: 'uom' },
  { label: 'Sumo Category', key: 'sumoCategory' }, { label: 'Sumo Token ID', key: 'sumoTokenId' },
  { label: 'Zuper UID', key: 'uid' }, { label: 'Status', key: 'status' },
  { label: 'Reason', key: 'reason' }, { label: 'Error', key: 'error' },
];
const F_COLS = [
  { label: 'Formula Name', key: 'formula_name' }, { label: 'Formula Key', key: 'formula_key' },
  { label: 'Sumo ID', key: 'sumo_id' }, { label: 'Zuper Formula UID', key: 'formula_uid' },
  { label: 'Expression', key: 'calculation' }, { label: 'Sumo Calculation', key: 'sumo_calculation' },
  { label: 'Merged Count', key: 'merged_count' }, { label: 'Status', key: 'status' }, { label: 'Reason', key: 'api_response' },
];
const P_COLS = [
  { label: 'Name', key: 'name' }, { label: 'Product Type', key: 'product_type' },
  { label: 'Product ID', key: 'product_id' }, { label: 'Sumo ID', key: 'sumo_id' },
  { label: 'Zuper UID', key: 'zuper_uid' }, { label: 'Child Part UID', key: 'child_part_uid' },
  { label: 'Child Service UID', key: 'child_service_uid' },
  { label: 'Formula Linked', key: 'formula_linked' }, { label: 'Formula Reason', key: 'formula_reason' },
  { label: 'Status', key: 'status' }, { label: 'Reason', key: 'reason' }, { label: 'Error', key: 'error' },
];
const L_COLS = [
  { label: 'Layout Name', key: 'layoutName' }, { label: 'Package Name', key: 'packageName' },
  { label: 'Source', key: 'source' }, { label: 'Work Type', key: 'workType' },
  { label: 'Is Default', key: 'isDefault' },
  { label: 'Item Count', key: 'itemCount' }, { label: 'Linked Count', key: 'linkedCount' },
  { label: 'Package UID', key: 'packageUid' }, { label: 'Layout ID', key: 'layoutId' },
  { label: 'Status', key: 'status' }, { label: 'Reason', key: 'error' },
];

async function sendWebhookReport({ response, userEmail, sumoCompanyName }) {
  try {
    let csvContent = '';
    if (response.phases?.measurements) csvContent += 'MEASUREMENTS\n' + toCSV(response.phases.measurements.results, M_COLS) + '\n\n';
    if (response.phases?.formulas)     csvContent += 'FORMULAS\n'     + toCSV(response.phases.formulas.results,     F_COLS) + '\n\n';
    if (response.phases?.products)     csvContent += 'PRODUCTS\n'     + toCSV(response.phases.products.results,     P_COLS) + '\n\n';
    if (response.phases?.layouts)      csvContent += 'LAYOUTS\n'      + toCSV(response.phases.layouts.results,      L_COLS);

    const payload = {
      userEmail,
      sumoCompanyName,
      reportedAt: new Date().toISOString(),
      csv: csvContent,
      summary: {
        measurements: response.phases?.measurements?.summary || null,
        formulas:     response.phases?.formulas?.summary     || null,
        products:     response.phases?.products?.summary     || null,
        layouts:      response.phases?.layouts?.summary      || null,
      },
    };

    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('[webhook] Failed to send report:', e.message);
  }
}

// Strip HTML tags from user-supplied strings before forwarding to Zuper.
function stripHtml(str) {
  return String(str || '').replace(/<[^>]+>/g, '');
}

function sumoHeaders(token) {
  return { Authorization: token, 'Content-Type': 'application/json' };
}

function zuperHeaders(apiKey) {
  return { 'x-api-key': apiKey, 'Content-Type': 'application/json' };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJSON(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Wraps fetchJSON with retry on 429 / 5xx / network errors.
// Fails immediately on 401/403 with a clear credential error.
async function fetchWithRetry(url, opts = {}, attempt = 1) {
  let res;
  try {
    res = await fetchJSON(url, opts);
  } catch (e) {
    if (attempt <= RETRY_MAX) {
      await sleep(RETRY_BASE_MS * attempt);
      return fetchWithRetry(url, opts, attempt + 1);
    }
    throw e;
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Authentication error (${res.status}) — check your API credentials`);
  }

  if ((res.status === 429 || res.status >= 500) && attempt <= RETRY_MAX) {
    const delay = res.status === 429
      ? RETRY_BASE_MS * attempt * 2   // longer backoff for rate limit
      : RETRY_BASE_MS * attempt;
    await sleep(delay);
    return fetchWithRetry(url, opts, attempt + 1);
  }

  return res;
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── ROUNDING MAP ─────────────────────────────────────────────────────────────

const ROUNDING_MAP = {
  NoRounding: 'NO_ROUNDING',
  NextWhole: 'NEXT_WHOLE_NUMBER',
  PreviousWhole: 'PREVIOUS_WHOLE_NUMBER',
  RoundOff: 'ROUND_OFF',
  NextTenth: 'NEXT_ONE_TENTH',
  NextQuarter: 'NEXT_QUARTER',
};

// ─── FUZZY TOKEN MATCHING ─────────────────────────────────────────────────────

function normalizeToken(name) {
  return name
    .toLowerCase()
    // normalize inch/foot symbols (various encodings) to a word
    .replace(/\u2033|\u02ba|"{2}|''/g, ' inch ')   // ″ ʺ "" '' → inch
    .replace(/\u2032|\u02b9/g, ' foot ')             // ′ ʹ → foot
    .replace(/"/g, ' inch ')                         // plain " → inch
    .replace(/'/g, ' foot ')                         // plain ' → foot
    // split digit-letter boundaries so "2in" → "2 in", "3ft" → "3 ft"
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    // remove remaining non-alphanumeric characters
    .replace(/[^a-z0-9\s]/g, '')
    // collapse spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlapScore(a, b) {
  const wordsA = new Set(a.split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  // Dice coefficient: rewards both overlap and size similarity
  // (2 * |A∩B|) / (|A| + |B|) — more lenient than Jaccard for partial matches
  return (2 * intersection) / (wordsA.size + wordsB.size);
}

function bestZuperMatch(sumoName, sumoUom, defaultTokens) {
  const normSumo = normalizeToken(sumoName);
  const normSumoUom = (sumoUom || '').trim().toUpperCase();
  let best = null;
  let bestScore = 0;
  for (const t of defaultTokens) {
    const normZuper = normalizeToken(t.measurement_token_name);
    const nameScore = wordOverlapScore(normSumo, normZuper);
    // No name overlap → not a candidate, regardless of UOM
    if (nameScore === 0) continue;
    const zuperUom = (t.uom || '').trim().toUpperCase();
    // UOM factor: penalty if both present and mismatched; neutral if either blank
    const uomFactor = (normSumoUom && zuperUom)
      ? (normSumoUom === zuperUom ? 1.0 : 0.8)
      : 1.0;
    const score = nameScore * uomFactor;
    if (score > bestScore) {
      bestScore = score;
      best = {
        uid: t.measurement_token_uid,
        name: t.measurement_token_name,
        uom: t.uom || '',
        categoryName: t.categoryName,
        categoryUid: t.categoryUid,
        score,
      };
    }
  }
  return bestScore > 0 ? best : null;
}

// ─── PHASE 1: MEASUREMENTS ────────────────────────────────────────────────────

async function runMeasurements({ sumoToken, zuperApiKey, base_url, categoryName, tokenMatchOverrides }) {
  tokenMatchOverrides = tokenMatchOverrides || {};
  const results = [];
  const tokenMap = {};
  const tokenCategoryMap = {}; // sumoTokenId → zuper measurement_category_uid

  const sumoRes = await fetchWithRetry(`${SUMO_BASE}/measurement`, {
    headers: sumoHeaders(sumoToken),
  });
  if (!sumoRes.ok) throw new Error(`SumoQuote measurements fetch failed: ${sumoRes.status}`);
  const categories = sumoRes.json?.Data?.Payload || [];

  const allTokens = [];
  for (const cat of categories) {
    for (const token of (cat.Tokens || [])) {
      allTokens.push({ ...token, sumoCategory: cat.Name });
    }
  }

  // Pre-populate tokenMap with confirmed matches; add MATCHED results
  for (const token of allTokens) {
    const override = tokenMatchOverrides[token.TokenId];
    if (override && override.uid) {
      tokenMap[token.TokenId] = override.uid;
      if (override.categoryUid) tokenCategoryMap[token.TokenId] = override.categoryUid;
      results.push({
        tokenName: token.Name,
        sumoTokenId: token.TokenId,
        uom: token.UnitOfMeasure || 'EA',
        uomDefaulted: false,
        sumoCategory: token.sumoCategory,
        status: 'MATCHED',
        uid: override.uid,
        error: null,
        reason: 'Matched to existing Zuper token via override',
      });
    }
  }

  // Tokens that need custom creation in Zuper
  const tokensToCreate = allTokens.filter(t => {
    const ov = tokenMatchOverrides[t.TokenId];
    return !ov || !ov.uid;
  });

  let categoryUid = null;

  if (tokensToCreate.length > 0) {
    const resolvedCategoryName = categoryName || 'Sumoquote Tokens';
    const catRes = await fetchWithRetry(`${base_url}measurements/categories`, {
      method: 'POST',
      headers: zuperHeaders(zuperApiKey),
      body: JSON.stringify({
        measurement_category: {
          measurement_category_name: resolvedCategoryName,
        },
      }),
    });
    if (catRes.ok) {
      categoryUid = catRes.json?.data?.measurement_category_uid;
    } else {
      // Category already exists — look it up by name
      const listRes = await fetchWithRetry(`${base_url}measurements/categories?sort=ASC&sort_by=created_at`, {
        headers: zuperHeaders(zuperApiKey),
      });
      const existing = (listRes.json?.data || []).find(
        c => (c.measurement_category_name || '').toLowerCase() === resolvedCategoryName.toLowerCase()
      );
      if (existing) {
        categoryUid = existing.measurement_category_uid;
        console.log(`[measurements] category "${resolvedCategoryName}" already exists — reusing uid=${categoryUid}`);
      } else {
        throw new Error(`Failed to create Zuper measurement category: ${JSON.stringify(catRes.json)}`);
      }
    }
    if (!categoryUid) throw new Error('No measurement_category_uid returned from Zuper');

    for (const batch of chunks(tokensToCreate, BATCH_SIZE)) {
      await Promise.all(batch.map(async (token) => {
        try {
          const uomValue = token.UnitOfMeasure || '';
          const uomDefaulted = !uomValue;
          const r = await fetchWithRetry(`${base_url}measurements/categories/${categoryUid}/tokens`, {
            method: 'POST',
            headers: zuperHeaders(zuperApiKey),
            body: JSON.stringify({
              measurement_token: {
                measurement_token_name: token.Name,
                uom: uomValue || 'EA',
              },
            }),
          });
          const uid = r.json?.data?.measurement_token_uid;
          const ok = r.ok && uid;
          if (ok) {
            tokenMap[token.TokenId] = uid;
            tokenCategoryMap[token.TokenId] = categoryUid;
          }
          results.push({
            tokenName: token.Name,
            sumoTokenId: token.TokenId,
            uom: uomValue || 'EA',
            uomDefaulted,
            sumoCategory: token.sumoCategory,
            status: ok ? 'SUCCESS' : 'FAILED',
            uid: uid || null,
            error: ok ? null : JSON.stringify(r.json),
            reason: ok ? 'Created in Zuper' : `Zuper API error: ${JSON.stringify(r.json)}`,
          });
        } catch (e) {
          results.push({
            tokenName: token.Name,
            sumoTokenId: token.TokenId,
            uom: token.UnitOfMeasure || 'EA',
            uomDefaulted: !token.UnitOfMeasure,
            sumoCategory: token.sumoCategory,
            status: 'FAILED',
            uid: null,
            error: e.message,
            reason: `Exception: ${e.message}`,
          });
        }
      }));
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { results, tokenMap, categoryUid, tokenCategoryMap };
}

// ─── PHASE 2: FORMULAS ────────────────────────────────────────────────────────

async function runFormulas({ sumoToken, zuperApiKey, base_url, tokenMap, categoryUid, tokenCategoryMap }) {
  tokenCategoryMap = tokenCategoryMap || {};
  const results = [];
  const formulaMap = {};
  const debug = [];

  // JN: calculations come from the v2 calculations endpoint (lowercase fields)
  const calcRes = await fetchWithRetry(`${CALC_BASE}/calculations`, {
    headers: sumoHeaders(sumoToken),
  });
  if (!calcRes.ok) throw new Error(`SumoQuote calculations fetch failed: ${calcRes.status}`);
  // v2 API returns { data: [...] }; also handle bare array and legacy Data.Payload shape
  const rawPriceItems = Array.isArray(calcRes.json)
    ? calcRes.json
    : (calcRes.json?.data || calcRes.json?.Data?.Payload || []);
  debug.push(`[formulas] calculations fetch: ${rawPriceItems.length} raw items (HTTP ${calcRes.status})`);
  console.log(`[formulas] calculations fetch: ${rawPriceItems.length} raw items`);
  if (rawPriceItems.length === 0) {
    throw new Error(`SumoQuote calculations returned 0 items (HTTP ${calcRes.status}). Check your SumoQuote token and that calculations exist in the account.`);
  }
  // Normalize fields — v2 uses lowercase; calculationSqId is the unique ID
  const priceItems = rawPriceItems.map(item => ({
    name: item.name || item.Name || '',
    calculation: item.calculation || item.Calculation || '',
    roundingStrategy: item.roundingStrategy || item.RoundingStrategy || '',
    Description: item.description || item.Description || '',
    products: item.products || [],
    PriceDetailId: item.calculationSqId || item.price_detail_id || item.PriceDetailId || '',
  }));

  // Build token name map from SumoQuote measurement tokens (needed for waste-token detection and error messages)
  const measRes = await fetchWithRetry(`${SUMO_BASE}/measurement`, {
    headers: sumoHeaders(sumoToken),
  });
  const sumoTokenNameMap = {};
  for (const cat of (measRes.json?.Data?.Payload || [])) {
    for (const t of (cat.Tokens || [])) {
      sumoTokenNameMap[t.TokenId] = (t.Name || '').trim();
    }
  }

  // JN: calculations are the source of truth for formulas; build formulaMap keyed by calculation name
  // The products[] array inside each calculation tells us which products use this formula
  const formulasByProduct = {}; // productName → formula_uid (built later during formula creation)

  // Matches both standard UUIDs (36 chars) and SumoQuote compound TokenIds (two UUIDs joined with a hyphen, 73 chars)
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?/g;

  const formulaEntries = [];

  for (const item of priceItems) {
    if (!item.calculation || !item.calculation.trim()) continue;

    let expression = item.calculation;
    expression = expression.replace(/\u00A0/g, ' ');

    const tokens = expression.match(uuidRegex) || [];
    const uniqueTokens = [...new Set(tokens)];

    const expressionMap = [];
    let counter = 1;
    let hasMissingToken = false;
    const unmappedTokenNames = [];

    for (const token of uniqueTokens) {
      if (tokenMap[token]) {
        // Simple token — found directly in map
        const key = `$${counter}`;
        const tokenName = (sumoTokenNameMap[token] || '').toLowerCase();
        const isWaste = tokenName.includes('waste');
        const replacement = isWaste ? `(${key}/100)` : key;
        expression = expression.split(token).join(replacement);
        expressionMap.push({
          key,
          type: 'MEASUREMENT',
          measurement_token_uid: tokenMap[token],
          measurement_category_uid: tokenCategoryMap[token] || categoryUid,
        });
        counter++;
      } else if (token.length > 36) {
        // Compound token — two individual tokens joined, represents their product (e.g. pitch factor × area)
        const parts = token.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || [];
        const resolvedParts = parts.filter(p => tokenMap[p]);
        if (resolvedParts.length === 0) {
          unmappedTokenNames.push(sumoTokenNameMap[token] || token);
          hasMissingToken = true;
          break;
        }
        const keys = resolvedParts.map(p => {
          const key = `$${counter}`;
          const tokenName = (sumoTokenNameMap[p] || '').toLowerCase();
          const isWaste = tokenName.includes('waste');
          expressionMap.push({
            key,
            type: 'MEASUREMENT',
            measurement_token_uid: tokenMap[p],
            measurement_category_uid: tokenCategoryMap[p] || categoryUid,
          });
          counter++;
          return isWaste ? `(${key}/100)` : key;
        });
        expression = expression.split(token).join(`(${keys.join('-')})`);
      } else {
        unmappedTokenNames.push(sumoTokenNameMap[token] || token);
        hasMissingToken = true;
        break;
      }
    }

    if (hasMissingToken) {
      debug.push(`[formulas] SKIPPED "${item.name}" — unmapped tokens: ${unmappedTokenNames.join(', ')}`);
      console.log(`[formulas] SKIPPED "${item.name}" — unmapped tokens: ${unmappedTokenNames.join(', ')}`);
      results.push({
        formula_name: item.name,
        formula_key: '',
        sumo_id: item.name,
        sumo_calculation: item.calculation,
        calculation: expression,
        status: 'SKIPPED',
        formula_uid: null,
        api_response: `Unmapped tokens: ${unmappedTokenNames.join(', ')}`,
        merged_count: 1,
      });
      continue;
    }

    if (expressionMap.length === 0) {
      const trimmed = expression.trim();
      const constantValue = Number(trimmed);
      if (!isNaN(constantValue) && trimmed !== '') {
        expression = '$1';
        expressionMap.push({
          key: '$1',
          type: 'CONSTANT',
          value: constantValue,
        });
      } else {
        debug.push(`[formulas] SKIPPED "${item.name}" — no tokens found and not a constant expression`);
        console.log(`[formulas] SKIPPED "${item.name}" — no tokens and not a constant`);
        results.push({
          formula_name: item.name,
          formula_key: '',
          sumo_id: item.name,
          sumo_calculation: item.calculation,
          calculation: expression,
          status: 'SKIPPED',
          formula_uid: null,
          api_response: 'No measurement tokens found in expression and it is not a numeric constant — formula cannot be created',
          merged_count: 1,
        });
        continue;
      }
    }

    expression = expression.replace(/(^|[^0-9])\.(\d+)/g, '$10.$2');
    expression = expression.replace(/\s+/g, '');

    const rounding = ROUNDING_MAP[item.roundingStrategy] || 'NO_ROUNDING';
    const cleanName = item.name.replace(/^\*+/, '').trim();
    const shortId = (item.PriceDetailId || item.name).replace(/-/g, '').substring(0, 8);
    const formulaKey = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50) + '_' + shortId;

    formulaEntries.push({
      item,
      cleanName,
      formulaName: `${formulaKey}_migration`,
      formulaKey: `${formulaKey}_migration`,
      expression,
      expressionMap,
      rounding,
    });
  }

  // Deduplicate by formulaName — multiple price items can share the same name/calculation.
  // Only create one formula per unique name; map all their PriceDetailIds to the same UID.
  const byFormulaName = new Map();
  for (const entry of formulaEntries) {
    if (!byFormulaName.has(entry.formulaName)) byFormulaName.set(entry.formulaName, []);
    byFormulaName.get(entry.formulaName).push(entry);
  }
  const uniqueEntries = [...byFormulaName.values()].map(group => group[0]);

  // Pre-fetch ALL existing Zuper formulas so re-runs can reuse already-created formula UIDs
  // instead of failing on duplicate name and leaving products unlinked.
  const existingByName = {};
  const existingByKey = {};
  try {
    const formulaPageSize = 100;
    let formulaPage = 1;
    while (true) {
      const existingRes = await fetchWithRetry(
        `${base_url}invoice_estimate/cpq/formulas?count=${formulaPageSize}&page=${formulaPage}`,
        { headers: zuperHeaders(zuperApiKey) },
      );
      const pageItems = existingRes.json?.data || [];
      for (const f of pageItems) {
        if (f.formula_name && f.formula_uid) existingByName[f.formula_name] = f.formula_uid;
        if (f.formula_key && f.formula_uid) existingByKey[f.formula_key] = f.formula_uid;
      }
      if (pageItems.length < formulaPageSize) break;
      formulaPage++;
    }
  } catch (e) {
    // Non-fatal — migration continues, but re-run deduplication won't work for this run
    const warn = `[formulas] WARNING: could not pre-fetch existing Zuper formulas (${e.message}). Re-run deduplication disabled.`;
    debug.push(warn);
    console.warn(warn);
  }

  for (const batch of chunks(uniqueEntries, BATCH_SIZE)) {
    await Promise.all(batch.map(async (entry) => {
      const group = byFormulaName.get(entry.formulaName);
      const mergedCount = group.length;

      const payload = {
        formula: {
          formula_name: entry.formulaName,
          formula_key: entry.formulaKey,
          formula_category: 'AREA_MEASUREMENT',
          formula_description: entry.item.Description || '',
          formula: {
            expression: entry.expression,
            expression_map: entry.expressionMap,
            rounding_mechanism: entry.rounding,
          },
        },
      };

      try {
        const r = await fetchWithRetry(`${base_url}invoice_estimate/cpq/formulas`, {
          method: 'POST',
          headers: zuperHeaders(zuperApiKey),
          body: JSON.stringify(payload),
        });

        const ok = r.ok && r.json?.type === 'success';
        let formulaUid = r.json?.data?.formula_uid || null;
        let status = ok ? 'SUCCESS' : 'FAILED';
        let apiResponse = ok ? 'Created in Zuper' : (r.json?.message || JSON.stringify(r.json));

        if (!ok || !formulaUid) {
          // Formula creation failed — check if it already exists in Zuper (re-run scenario)
          const existingUid = existingByName[entry.formulaName] || existingByKey[entry.formulaKey];
          if (existingUid) {
            formulaUid = existingUid;
            status = 'REUSED';
            apiResponse = 'Formula already existed in Zuper — reused existing UID';
          }
        }

        if (formulaUid) {
          // Map all calculations sharing this formula name to the same UID
          // In JN mode, both calculations and products are keyed by name
          const linkedProducts = [];
          for (const e of group) {
            formulaMap[e.item.name] = formulaUid;
            // Also add mappings from the products array in this calculation
            if (Array.isArray(e.item.products)) {
              for (const prod of e.item.products) {
                if (prod.name) {
                  formulasByProduct[prod.name] = formulaUid;
                  linkedProducts.push(prod.name);
                }
              }
            }
          }
          debug.push(`[formulas] ${status} "${entry.formulaName}" uid=${formulaUid} | products linked: [${linkedProducts.join(', ') || 'none'}]`);
          console.log(`[formulas] ${status} "${entry.formulaName}" uid=${formulaUid} | products: [${linkedProducts.join(', ') || 'none'}]`);
        } else {
          debug.push(`[formulas] FAILED "${entry.formulaName}" — ${apiResponse}`);
          console.log(`[formulas] FAILED "${entry.formulaName}" — ${apiResponse}`);
        }

        results.push({
          formula_name: entry.formulaName,
          formula_key: entry.formulaKey,
          sumo_id: entry.item.name,
          sumo_calculation: entry.item.calculation,
          calculation: entry.expression,
          status,
          formula_uid: formulaUid,
          api_response: apiResponse,
          merged_count: mergedCount,
        });
      } catch (e) {
        debug.push(`[formulas] EXCEPTION "${entry.formulaName}" — ${e.message}`);
        console.error(`[formulas] EXCEPTION "${entry.formulaName}"`, e.message);
        results.push({
          formula_name: entry.formulaName,
          formula_key: entry.formulaKey,
          sumo_id: entry.item.name,
          sumo_calculation: entry.item.calculation,
          calculation: entry.expression,
          status: 'FAILED',
          formula_uid: null,
          api_response: e.message,
          merged_count: mergedCount,
        });
      }
    }));
    await sleep(BATCH_DELAY_MS);
  }

  const fmKeys = Object.keys(formulaMap).length;
  const fbpKeys = Object.keys(formulasByProduct).length;
  debug.push(`[formulas] done — formulaMap: ${fmKeys} entries, formulasByProduct: ${fbpKeys} entries`);
  console.log(`[formulas] done — formulaMap: ${fmKeys}, formulasByProduct: ${fbpKeys}`);

  return { results, formulaMap, formulasByProduct, debug };
}

// ─── PHASE 3: PRODUCTS ────────────────────────────────────────────────────────


// JN-specific classifier — item_type is the sole source of truth.
// No price-based fallback: missing/unknown item_type → SKIP.
function classifyItemJN(item) {
  const t = (item.ItemType || '').toLowerCase();
  if (t === 'labor+material') return 'BUNDLE';
  if (t === 'labor')          return 'SERVICE';
  if (t === 'material')       return 'PARTS';
  return 'SKIP';
}

function makeProductId(type, num) {
  return `${type}-${String(num).padStart(3, '0')}`;
}

function buildTax(isTaxExempted) {
  if (isTaxExempted === true) return { tax_exempt: true };
  return { tax_exempt: false, tax_name: '', tax_rate: '' };
}

function buildBaseProduct({
  name, productId, price, purchasePrice, uom, markup,
  description, productType, formulaUid, locationUid,
  productCategoryUid, isTaxExempted,
}) {
  const product = {
    product_name: name,
    product_id: productId,
    is_available: true,
    product_category: productCategoryUid || 'UNCATEGORIZED',
    price: price || 0,
    min_quantity: 0,
    currency: '',
    quantity: 0,
    product_manual_link: '',
    product_description: description
      ? `<p>${stripHtml(description).replace(/\n/g, '</p><p>')}</p>`
      : '',
    product_image: '',
    product_type: productType,
    pricing_level: 'ROLLUP',
    brand: '',
    track_quantity: false,
    specification: '',
    has_custom_tax: false,
    meta_data: [],
    uom: uom || '',
    is_billable: true,
    consider_profitability: true,
    is_commissionable: true,
    location_availability: locationUid
      ? [{ location: locationUid, min_quantity: 0, quantity: 0, serial_nos: [] }]
      : [],
    tax: buildTax(isTaxExempted),
    product_files: [],
    option: { customer_selection: false, option_label: 'Option', option_values: [] },
  };

  if (purchasePrice !== undefined && purchasePrice !== null) {
    product.purchase_price = purchasePrice;
  }
  if (markup && markup > 0) {
    product.markup = { markup_type: 'PERCENTAGE', markup_value: markup };
  }
  if (formulaUid) {
    product.formula = formulaUid;
  }

  return product;
}

async function ensureWarehouseLocation({ zuperApiKey, base_url }) {
  const r = await fetchWithRetry(`${base_url}products/location?count=50&page=1`, {
    headers: zuperHeaders(zuperApiKey),
  });
  const locations = r.json?.data || [];
  const existing = locations.find(l => (l.location_name || '').toLowerCase() === 'warehouse');
  if (existing) return existing.location_uid || existing.uid || existing.id;

  const cr = await fetchWithRetry(`${base_url}products/location`, {
    method: 'POST',
    headers: zuperHeaders(zuperApiKey),
    body: JSON.stringify({
      product_location: { location_name: 'Warehouse', location_type: 'WAREHOUSE' },
    }),
  });
  return cr.json?.data?.location_uid || cr.json?.data?.uid || null;
}

async function fetchFirstProductCategory({ zuperApiKey, base_url }) {
  try {
    const r = await fetchWithRetry(`${base_url}products/category?count=200&page=1`, {
      headers: zuperHeaders(zuperApiKey),
    });
    const cats = r.json?.data || r.json?.categories || [];
    if (cats.length) {
      return cats[0]?.product_category_uid || cats[0]?.category_uid || cats[0]?.uid || cats[0]?.id || null;
    }
  } catch (e) {
    console.warn('Could not fetch product categories:', e.message);
  }
  return null;
}

async function runProducts({ sumoToken, zuperApiKey, base_url, formulaMap, formulasByProduct, taxRate = 0 }) {
  const results = [];
  const debug = [];
  formulaMap = formulaMap || {};
  formulasByProduct = formulasByProduct || {};

  debug.push(`[products] formulaMap keys: ${Object.keys(formulaMap).length}, formulasByProduct keys: ${Object.keys(formulasByProduct).length}`);
  console.log(`[products] formulaMap keys: ${Object.keys(formulaMap).length}, formulasByProduct keys: ${Object.keys(formulasByProduct).length}`);

  const [locationUid, productCategoryUid] = await Promise.all([
    ensureWarehouseLocation({ zuperApiKey, base_url }).catch(() => null),
    fetchFirstProductCategory({ zuperApiKey, base_url }).catch(() => null),
  ]);

  // JN v2 products API — paginate via size/from offsets, Bearer auth only
  const jnHeaders = { Authorization: `Bearer ${sumoToken}`, 'Content-Type': 'application/json' };
  let rawProducts = [];
  let from = 0;
  const PAGE_SIZE = 200;
  while (true) {
    const jnRes = await fetchWithRetry(`${JN_BASE}/products?size=${PAGE_SIZE}&from=${from}`, {
      headers: jnHeaders,
    });
    if (!jnRes.ok) throw new Error(`JobNimbus v2 products fetch failed (from=${from}): ${jnRes.status} ${JSON.stringify(jnRes.json)}`);
    // v2 response: { count, results: [...] }  (field is "results" not "records")
    const records = jnRes.json?.results || jnRes.json?.records || [];
    rawProducts = rawProducts.concat(records.filter(p => p.is_active !== false)); // active flag in v2
    if (records.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  debug.push(`[products] fetched ${rawProducts.length} active products from JN v2 API`);
  console.log(`[Products] Fetched ${rawProducts.length} active products from JN v2 API`);

  // Map JN v2 products to normalized internal shape
  const priceItems = rawProducts.map(p => {
    const uom0 = p.uoms?.[0] || {};
    const matPrice = uom0.material?.price ?? uom0.price ?? 0;
    const matCost  = uom0.material?.cost  ?? uom0.cost  ?? 0;
    const labPrice = uom0.labor?.price    ?? 0;
    const labCost  = uom0.labor?.cost     ?? 0;
    const matMarkupPct = (matCost > 0) ? Math.round(((matPrice - matCost) / matCost) * 10000) / 100 : 0;
    const labMarkupPct = (labCost > 0) ? Math.round(((labPrice - labCost) / labCost) * 10000) / 100 : 0;
    return {
      Name:          p.name,
      Price:         matPrice,
      Labour:        labPrice,
      PurchasePrice: matCost,
      LabourCost:    labCost,
      UnitOfMeasure: uom0.uom || p.unit_of_measure || '',
      Description:   p.description || '',
      Markup:        matMarkupPct,
      LabourMarkup:  labMarkupPct,
      IsTaxExempted: p.tax_exempt === true,
      PriceDetailId: p.jnid || p.id || p.name,
      ItemType:      (p.item_type || '').toLowerCase(),
    };
  });

  let bundleCount = 0, partCount = 0, serviceCount = 0;

  for (const batch of chunks(priceItems, BATCH_SIZE)) {
    await Promise.all(batch.map(async (item) => {
      const type = classifyItemJN(item);
      let effectiveType = type;

      if (type === 'SKIP') {
        // item_type is missing or unrecognized — skip, no override
        const skipMsg = `Unknown or missing item_type "${item.ItemType || ''}" — skipped`;
        debug.push(`[products] SKIPPED "${item.Name}" — ${skipMsg}`);
        console.log(`[products] SKIPPED "${item.Name}" item_type="${item.ItemType || ''}"`);
        results.push({
          sumo_id: item.PriceDetailId,
          name: item.Name || 'Unnamed',
          product_type: 'SKIP',
          product_id: null, zuper_uid: null,
          formula_linked: false,
          formula_reason: 'Product skipped — no formula lookup attempted',
          status: 'SKIPPED',
          error: skipMsg,
          reason: skipMsg,
        });
        return;
      }

      let price = parseFloat(item.Price) || 0;
      let labour = parseFloat(item.Labour) || 0;
      const isTaxExempted = item.IsTaxExempted === true;

      // Back-calculate pre-tax price for taxable items when user confirms prices are tax-inclusive.
      // IsTaxExempted=true means the item was never taxed — leave its price unchanged.
      if (taxRate > 0 && !isTaxExempted) {
        const divisor = 1 + taxRate / 100;
        price = Math.round((price / divisor) * 100) / 100;
        labour = Math.round((labour / divisor) * 100) / 100;
      }

      const markup = parseFloat(item.Markup) || 0;
      const labourMarkup = parseFloat(item.LabourMarkup) || 0;
      // JN: formulasByProduct is keyed by product name (from calculation.products[].name)
      // formulaMap is keyed by calculation name — both are looked up by name first, then by PriceDetailId as fallback
      const formulaUid = formulasByProduct[item.Name]
        || formulasByProduct[item.PriceDetailId]
        || formulaMap[item.Name]
        || formulaMap[item.PriceDetailId]
        || null;
      const uom = item.UnitOfMeasure || '';
      const desc = item.Description || '';
      const name = item.Name || 'Unnamed';

      const formulaLookupDetail = formulaUid
        ? `Linked via ${
            formulasByProduct[item.Name] ? 'product name match in calculation' :
            formulasByProduct[item.PriceDetailId] ? 'product ID match in calculation' :
            formulaMap[item.Name] ? 'calculation name matches product name' : 'calculation ID match'
          }`
        : `No matching calculation found — tried product name "${item.Name}", product ID "${item.PriceDetailId}" in both formulasByProduct and formulaMap`;
      debug.push(`[products] "${name}" item_type="${item.ItemType}" → ${effectiveType} | ${formulaLookupDetail}`);
      console.log(`[products] "${name}" → ${effectiveType} | ${formulaLookupDetail}`);

      try {
        if (effectiveType === 'PARTS') {
          partCount++;
          const productId = makeProductId('PART', partCount);
          const r = await fetchWithRetry(`${base_url}product`, {
            method: 'POST',
            headers: zuperHeaders(zuperApiKey),
            body: JSON.stringify({
              product: buildBaseProduct({
                name, productId, price, purchasePrice: parseFloat(item.PurchasePrice) || price,
                uom, markup, description: desc, productType: 'PARTS',
                formulaUid, locationUid, productCategoryUid, isTaxExempted,
              }),
              vendor: [],
            }),
          });
          const ok = r.ok && (r.json?.type === 'success' || r.json?.data);
          results.push({
            sumo_id: item.PriceDetailId, name, product_type: 'PARTS',
            product_id: productId, zuper_uid: r.json?.data?.product_uid || null,
            price, purchase_price: parseFloat(item.PurchasePrice) || price,
            uom, product_description: desc,
            markup: markup ? { markup_type: 'PERCENTAGE', markup_value: markup } : null,
            tax: { tax_exempt: isTaxExempted }, is_billable: true,
            formula_linked: !!formulaUid,
            formula_reason: formulaLookupDetail,
            status: ok ? 'SUCCESS' : 'FAILED',
            error: ok ? null : JSON.stringify(r.json),
            reason: ok ? 'Created in Zuper as PARTS' : `Zuper API error: ${JSON.stringify(r.json)}`,
          });

        } else if (effectiveType === 'SERVICE') {
          serviceCount++;
          const productId = makeProductId('SERVICE', serviceCount);
          const r = await fetchWithRetry(`${base_url}product`, {
            method: 'POST',
            headers: zuperHeaders(zuperApiKey),
            body: JSON.stringify({
              product: buildBaseProduct({
                name, productId, price: labour, purchasePrice: parseFloat(item.LabourCost) || labour,
                uom, markup: labourMarkup, description: desc, productType: 'SERVICE',
                formulaUid, locationUid, productCategoryUid, isTaxExempted,
              }),
              vendor: [],
            }),
          });
          const ok = r.ok && (r.json?.type === 'success' || r.json?.data);
          results.push({
            sumo_id: item.PriceDetailId, name, product_type: 'SERVICE',
            product_id: productId, zuper_uid: r.json?.data?.product_uid || null,
            price: labour, purchase_price: parseFloat(item.LabourCost) || labour,
            uom, product_description: desc,
            markup: labourMarkup ? { markup_type: 'PERCENTAGE', markup_value: labourMarkup } : null,
            tax: { tax_exempt: isTaxExempted }, is_billable: true,
            formula_linked: !!formulaUid,
            formula_reason: formulaLookupDetail,
            status: ok ? 'SUCCESS' : 'FAILED',
            error: ok ? null : JSON.stringify(r.json),
            reason: ok ? 'Created in Zuper as SERVICE' : `Zuper API error: ${JSON.stringify(r.json)}`,
          });

        } else {
          // BUNDLE — create children sequentially first
          bundleCount++;
          const partId = makeProductId('BMAT', bundleCount);
          const serviceId = makeProductId('BLAB', bundleCount);
          const bundleId = makeProductId('BUNDLE', bundleCount);

          const partRes = await fetchWithRetry(`${base_url}product`, {
            method: 'POST',
            headers: zuperHeaders(zuperApiKey),
            body: JSON.stringify({
              product: buildBaseProduct({
                name: `${name} - Material`, productId: partId,
                price, purchasePrice: parseFloat(item.PurchasePrice) || price,
                uom, markup, description: desc,
                productType: 'PARTS', formulaUid, locationUid, productCategoryUid, isTaxExempted,
              }),
              vendor: [],
            }),
          });
          const partUid = partRes.json?.data?.product_uid || null;
          const partOk = partRes.ok && !!partUid;

          const svcRes = await fetchWithRetry(`${base_url}product`, {
            method: 'POST',
            headers: zuperHeaders(zuperApiKey),
            body: JSON.stringify({
              product: buildBaseProduct({
                name: `${name} - Labor`, productId: serviceId,
                price: labour, purchasePrice: parseFloat(item.LabourCost) || labour,
                uom, markup: labourMarkup, description: desc,
                productType: 'SERVICE', formulaUid, locationUid, productCategoryUid, isTaxExempted,
              }),
              vendor: [],
            }),
          });
          const svcUid = svcRes.json?.data?.product_uid || null;
          const svcOk = svcRes.ok && !!svcUid;

          if (!partUid && !svcUid) {
            results.push({
              sumo_id: item.PriceDetailId, name, product_type: 'BUNDLE',
              product_id: bundleId, zuper_uid: null,
              child_part_uid: null, child_service_uid: null,
              price: price + labour,
              purchase_price: (parseFloat(item.PurchasePrice) || price) + (parseFloat(item.LabourCost) || labour),
              uom, product_description: desc,
              markup: null, tax: { tax_exempt: isTaxExempted }, is_billable: true,
              formula_linked: !!formulaUid,
              formula_reason: formulaLookupDetail,
              status: 'FAILED',
              error: `Both child products failed — Part: ${JSON.stringify(partRes.json)}, Service: ${JSON.stringify(svcRes.json)}`,
              reason: `Both child products failed — Part: ${JSON.stringify(partRes.json)}, Service: ${JSON.stringify(svcRes.json)}`,
            });
            return;
          }

          const associated = [];
          if (partUid) associated.push({ product_uid: partUid, quantity: 1, price, purchase_price: price, product_description: '', preferred_product: false });
          if (svcUid) associated.push({ product_uid: svcUid, quantity: 1, price: labour, purchase_price: labour, product_description: '', preferred_product: false });

          const bundleRes = await fetchWithRetry(`${base_url}product`, {
            method: 'POST',
            headers: zuperHeaders(zuperApiKey),
            body: JSON.stringify({
              product: {
                product_name: name,
                product_id: bundleId,
                is_available: true,
                product_category: productCategoryUid || 'UNCATEGORIZED',
                min_quantity: 0, currency: '', quantity: 0,
                product_manual_link: '',
                product_description: desc ? `<p>${stripHtml(desc).replace(/\n/g, '</p><p>')}</p>` : '',
                product_image: '', product_type: 'BUNDLE',
                pricing_level: 'ROLLUP', brand: '',
                track_quantity: false, specification: '',
                has_custom_tax: false, meta_data: [], uom: '',
                is_billable: true, consider_profitability: true, is_commissionable: true,
                location_availability: [],
                tax: buildTax(isTaxExempted),
                markup: null,
                associated_products: associated,
                product_files: [],
                option: { customer_selection: false, option_label: 'Option', option_values: [] },
              },
              vendor: [],
            }),
          });

          const bundleOk = bundleRes.ok && (bundleRes.json?.type === 'success' || bundleRes.json?.data);
          const bundleStatus = bundleOk ? (partOk && svcOk ? 'SUCCESS' : 'PARTIAL') : 'FAILED';
          const bundleReason = bundleOk
            ? (partOk && svcOk ? 'Created in Zuper as BUNDLE with both children' : `Bundle created but one child failed — Material: ${partOk ? 'OK' : 'FAILED'}, Labor: ${svcOk ? 'OK' : 'FAILED'}`)
            : `Bundle creation failed — Zuper API error: ${JSON.stringify(bundleRes.json)}`;
          const bundleUid = bundleRes.json?.data?.product_uid || null;
          // Pre-populate associated_products with creation-time data so layouts have
          // price/purchase_price/unit_price without needing the lazy enrichment GET.
          // The lazy GET will still run and overwrite with full Zuper data if available.
          const creationAssociatedProducts = [];
          if (partUid) creationAssociatedProducts.push({
            product_uid: partUid, quantity: 1,
            unit_price: price, purchase_price: parseFloat(item.PurchasePrice) || price,
            name: `${name} - Material`, product_type: 'PARTS',
            uom, tax: { tax_exempt: isTaxExempted },
          });
          if (svcUid) creationAssociatedProducts.push({
            product_uid: svcUid, quantity: 1,
            unit_price: labour, purchase_price: parseFloat(item.LabourCost) || labour,
            name: `${name} - Labor`, product_type: 'SERVICE',
            uom, tax: { tax_exempt: isTaxExempted },
          });
          results.push({
            sumo_id: item.PriceDetailId, name, product_type: 'BUNDLE',
            product_id: bundleId,
            zuper_uid: bundleUid,
            child_part_uid: partUid, child_service_uid: svcUid,
            price: price + labour,
            purchase_price: (parseFloat(item.PurchasePrice) || price) + (parseFloat(item.LabourCost) || labour),
            uom, product_description: desc,
            markup: null,
            tax: { tax_exempt: isTaxExempted }, is_billable: true,
            associated_products: creationAssociatedProducts,
            formula_linked: !!formulaUid,
            formula_reason: formulaLookupDetail,
            status: bundleStatus,
            error: bundleOk ? null : JSON.stringify(bundleRes.json),
            reason: bundleReason,
          });
        }
      } catch (e) {
        results.push({
          sumo_id: item.PriceDetailId, name, product_type: effectiveType,
          product_id: null, zuper_uid: null,
          formula_linked: false,
          formula_reason: formulaLookupDetail || 'Formula lookup not reached due to exception',
          status: 'FAILED',
          error: e.message,
          reason: `Exception: ${e.message}`,
        });
      }
    }));

    await sleep(BATCH_DELAY_MS);
  }

  // Enrichment removed — product details (zuper_raw, location, markup, tax) are fetched
  // lazily in runLayouts via getProductDetail() to avoid timing out on large datasets.

  const pSuccess = results.filter(r => r.status === 'SUCCESS').length;
  const pSkipped = results.filter(r => r.status === 'SKIPPED').length;
  const pFailed  = results.filter(r => r.status === 'FAILED').length;
  const pLinked  = results.filter(r => r.formula_linked).length;
  debug.push(`[products] done — total: ${results.length}, success: ${pSuccess}, skipped: ${pSkipped}, failed: ${pFailed}, formula_linked: ${pLinked}`);
  console.log(`[products] done — total: ${results.length}, success: ${pSuccess}, skipped: ${pSkipped}, failed: ${pFailed}, formula_linked: ${pLinked}`);

  return { results, debug };
}

// ─── LAYOUTS & SERVICE PACKAGES ───────────────────────────────────────────────

async function runLayouts({ sumoToken, zuperApiKey, base_url, productResults }) {
  // Lazy product detail cache — fetches full Zuper product data on demand per zuper_uid.
  // Replaces the upfront enrichment loop that was removed from runProducts to avoid timeouts.
  const productDetailCache = new Map();
  async function getProductDetail(zuper_uid) {
    if (productDetailCache.has(zuper_uid)) return productDetailCache.get(zuper_uid);
    try {
      const getRes = await fetchWithRetry(`${base_url}product/${zuper_uid}`, { headers: zuperHeaders(zuperApiKey) });
      const d = getRes.json?.data || (getRes.ok ? getRes.json : null);
      if (!d || typeof d !== 'object') return null;
      const locations = (d.product_ref_id?.location_availability) || [];
      const firstLoc = locations[0] || {};
      const detail = {
        zuper_raw: d,
        location_uid: firstLoc.location_uid || '',
        location_name: firstLoc.location_name || '',
        location_internal: firstLoc._id || firstLoc.location || '',
        markup: d.markup || null,
        tax: d.tax || { tax_exempt: false },
        is_billable: d.is_billable !== undefined ? d.is_billable : true,
        product_category: (typeof d.product_category === 'object' && d.product_category !== null)
          ? d.product_category
          : (d.product_category_uid ? { category_uid: d.product_category_uid, category_name: 'Product', business_unit: [] } : null),
      };
      // For BUNDLEs: enrich associated_products children
      if ((d.product_type === 'BUNDLE') && Array.isArray(d.associated_products)) {
        detail.associated_products = await Promise.all(d.associated_products.map(async (ap) => {
          const childUid = ap.product_uid || ap.product?.product_uid;
          if (!childUid) return ap;
          try {
            const childRes = await fetchWithRetry(`${base_url}product/${childUid}`, { headers: zuperHeaders(zuperApiKey) });
            const childData = childRes.json?.data || (childRes.ok ? childRes.json : null);
            if (childData) return { ...ap, product: childData };
          } catch (e) { /* non-fatal */ }
          return ap;
        }));
      }
      productDetailCache.set(zuper_uid, detail);
      return detail;
    } catch (e) {
      return null;
    }
  }

  // Build a map: sumo_id → product record (with zuper_uid)
  // sumo_id = JN product jnid/id/name, which won't match layout EstimateItems' PriceDetailId (UUID from SumoQuote)
  // So we ALSO index by product name for name-based fallback lookup
  const debug = [];
  const productMap = {};
  const productMapByName = {};
  for (const p of (productResults || [])) {
    if (p.sumo_id && p.zuper_uid) {
      productMap[p.sumo_id] = p;
    }
    if (p.name && p.zuper_uid) {
      productMapByName[p.name] = p;
    }
  }
  // Layout items use JobNimbusProductId (matches sumo_id = jnid) and PriceDetailName (matches product name)
  const lookupProduct = (item) =>
    productMap[item.JobNimbusProductId]
    || productMapByName[item.PriceDetailName]
    || productMap[item.PriceDetailId]
    || productMapByName[item.Name]
    || productMapByName[item.name]
    || null;
  const mapSizes = `productMap: ${Object.keys(productMap).length}, byName: ${Object.keys(productMapByName).length}`;
  console.log(`[layouts] ${mapSizes}`);
  debug.push(`[layouts] ${mapSizes}`);

  const results = [];

  // JN: layouts come from a single endpoint
  const jnLayoutsRes = await fetchWithRetry(`${SUMO_BASE}/jn/layouts`, { headers: sumoHeaders(sumoToken) });

  console.log(`[layouts] /jn/layouts status: ${jnLayoutsRes.status}, keys: ${JSON.stringify(Object.keys(jnLayoutsRes.json || {}))}`);

  // Data.Payload is an array of groups: [{ WorkType, Layouts: [{LayoutId, LayoutName...}] }]
  const jnPayload = jnLayoutsRes.json?.Data?.Payload || [];
  const allLayouts = jnPayload
    .flatMap(group => Array.isArray(group.Layouts) ? group.Layouts : [group])
    .map(l => ({ ...l, source: 'JN' }));

  console.log(`[layouts] found ${allLayouts.length} JN layouts`);
  if (process.env.DEBUG_LAYOUTS && allLayouts.length > 0) {
    console.log(`[layouts] first layout sample:`, JSON.stringify(allLayouts[0]));
  }

  for (const batch of chunks(allLayouts, BATCH_SIZE)) {
    await Promise.all(batch.map(async (layout) => {
      const layoutId = layout.LayoutId;
      const layoutName = layout.LayoutName || layout.Name || `Layout ${layoutId}`;

      try {
        // Fetch layout details to get its price items
        const detailRes = await fetchWithRetry(`${SUMO_BASE}/layouts/${layoutId}`, {
          headers: sumoHeaders(sumoToken),
        });

        if (process.env.DEBUG_LAYOUTS) {
          console.log(`[layouts] layout "${layoutName}" (${layoutId}) detail status: ${detailRes.status}`);
          console.log(`[layouts] layout "${layoutName}" detail top-level keys:`, JSON.stringify(Object.keys(detailRes.json || {})));
        }

        const payload = detailRes.json?.Data?.Payload || detailRes.json?.data || detailRes.json || {};
        if (process.env.DEBUG_LAYOUTS) {
          console.log(`[layouts] layout "${layoutName}" payload type: ${Array.isArray(payload) ? 'array[' + payload.length + ']' : 'object'}, keys: ${JSON.stringify(Object.keys(payload).slice(0, 10))}`);
        }

        // Recursively collect all objects with a PriceDetailId (used for count logging only)
        function collectPriceItems(obj, depth = 0) {
          if (!obj || typeof obj !== 'object' || depth > 10) return [];
          if (Array.isArray(obj)) return obj.flatMap(el => collectPriceItems(el, depth + 1));
          if (obj.PriceDetailId) return [obj];
          return Object.values(obj).flatMap(v => collectPriceItems(v, depth + 1));
        }

        const rawItems = collectPriceItems(payload.Report || payload);
        console.log(`[layouts] layout "${layoutName}" rawItems count: ${rawItems.length}`);
        // Log the first raw item's keys so we know what fields the API actually returns
        if (rawItems.length > 0 && results.length === 0) {
          const sample = rawItems[0];
          const sampleInfo = `first item keys: ${JSON.stringify(Object.keys(sample))}, Name="${sample.Name}", name="${sample.name}", PriceDetailId="${sample.PriceDetailId}"`;
          console.log(`[layouts] sample item — ${sampleInfo}`);
          debug.push(`[layouts] sample item — ${sampleInfo}`);
        }

        // Build a complete ITEM line item from a matched product
        async function buildProductLineItem(prod) {
          // Lazy-fetch full product details (zuper_raw, location, markup, tax, associated_products)
          // that were previously populated by the upfront enrichment loop in runProducts.
          if (prod.zuper_uid && !prod.zuper_raw) {
            const detail = await getProductDetail(prod.zuper_uid);
            if (detail) Object.assign(prod, detail);
          }
          const unitPrice = Math.round((parseFloat(prod.price) || 0) * 100) / 100;
          const purchasePrice = Math.round((parseFloat(prod.purchase_price) || 0) * 100) / 100;
          const markupPrice = Math.round((unitPrice - purchasePrice) * 100) / 100;
          const isBundle = prod.product_type === 'BUNDLE';

          const li = {
            line_item_type: 'ITEM',
            product_uid: prod.zuper_uid,
            product_id: prod.product_id || '',
            product_type: prod.product_type || 'PARTS',
            name: prod.name || '',
            description: prod.product_description || '',
            product_description: prod.product_description || '',
            uom: prod.uom || '',
            quantity: 1,
            unit_price: unitPrice,
            purchase_price: purchasePrice,
            discount: 0,
            discount_type: 'FIXED',
            serial_nos: [],
            total: unitPrice,
            section_type: 'EXPANDED',
            show_section_total: false,
            show_child_prices: true,
            brand: '',
            specification: '',
            image: '',
            location_uid: prod.location_uid || '',
            location_name: prod.location_name || '',
            tax: prod.tax || { tax_exempt: false },
            is_billable: prod.is_billable !== undefined ? prod.is_billable : true,
            associated_products: isBundle
              ? (prod.associated_products || []).map((ap, apIdx) => {
                const childPrice = (ap.product?.price != null ? parseFloat(ap.product.price) : null) ?? parseFloat(ap.unit_price) ?? 0;
                const childPurchasePrice = (ap.purchase_price != null ? parseFloat(ap.purchase_price) : null)
                  ?? (ap.product?.purchase_price != null ? parseFloat(ap.product.purchase_price) : null)
                  ?? 0;
                const childUnitPrice = (ap.unit_price != null ? parseFloat(ap.unit_price) : null) ?? childPrice;
                const childTotal = (ap.total != null ? parseFloat(ap.total) : null) ?? childUnitPrice;
                const childQty = ap.quantity || 1;
                const childMarkupPrice = Math.round((childUnitPrice - childPurchasePrice) * 100) / 100;
                const childMarkup = ap.product?.markup || ap.markup;

                if (process.env.DEBUG_LAYOUTS) {
                  console.log(`[layouts]   child[${apIdx}] "${ap.name || ap.product?.product_name || '?'}" ` +
                    `ap.purchase_price=${ap.purchase_price} ap.unit_price=${ap.unit_price} ` +
                    `ap.product?.price=${ap.product?.price} ap.product?.purchase_price=${ap.product?.purchase_price} ` +
                    `ap.location=${ap.location || '(none)'} ap.uom=${ap.uom || ap.product?.uom || '(none)'} ` +
                    `→ childPurchasePrice=${childPurchasePrice} childUnitPrice=${childUnitPrice} childMarkup=${JSON.stringify(childMarkup)}`);
                }

                const mapped = {
                  name: ap.name || ap.product?.product_name || '',
                  markup: {
                    markup_type: childMarkup?.markup_type || 'PERCENTAGE',
                    markup_value: childMarkup?.markup_value ?? 0,
                    markup_price: childMarkupPrice,
                  },
                  tax: ap.tax || { tax_exempt: false },
                  product_id: ap.product_id || ap.product?.product_id || '',
                  product_uid: ap.product_uid || ap.product?.product_uid || '',
                  product_type: ap.product_type || '',
                  product: ap.product || undefined,
                  unit_price: childUnitPrice,
                  purchase_price: childPurchasePrice,
                  unit_price_premarkup: childPurchasePrice,
                  unit_price_pre_dealer_markup: childUnitPrice,
                  quantity: childQty,
                  ...(ap.location ? { location: ap.location } : {}),
                  location_uid: ap.location_uid || '',
                  location_name: ap.location_name || '',
                  description: ap.description || ap.product?.product_description || '',
                  product_description: ap.description || ap.product?.product_description || '',
                  total: childTotal,
                  total_purchase_price: childPurchasePrice * childQty,
                  asset_uid: ap.asset_uid || '',
                  uom: ap.uom || ap.product?.uom || '',
                  serial_nos: [],
                  discount: 0,
                  discount_type: 'FIXED',
                  is_commissionable: ap.is_commissionable !== undefined ? ap.is_commissionable : true,
                  markup_updated_via_cpq: false,
                  has_custom_tax: ap.has_custom_tax !== undefined ? ap.has_custom_tax : false,
                  enable_customer_selection_for_option: false,
                  taxes: ap.taxes || [],
                  image: ap.image || '',
                };
                if (ap.pricing_level) mapped.pricing_level = ap.pricing_level;

                // NaN guard — log any number fields that resolved to NaN
                const nanKeys = Object.entries(mapped)
                  .filter(([, v]) => typeof v === 'number' && isNaN(v))
                  .map(([k]) => k);
                if (nanKeys.length) {
                  console.error(`[layouts]   ⚠ NaN in child[${apIdx}] "${mapped.name}": ${nanKeys.join(', ')}`);
                } else if (process.env.DEBUG_LAYOUTS) {
                  console.log(`[layouts]   child[${apIdx}] mapped OK — name="${mapped.name}" purchase_price=${mapped.purchase_price} unit_price_premarkup=${mapped.unit_price_premarkup} markup_price=${mapped.markup?.markup_price}`);
                }

                return mapped;
              })
              : [],
          };

          // BUNDLE-specific
          if (isBundle) li.pricing_level = 'ROLLUP';

          // unit_price_premarkup only on non-BUNDLE
          if (!isBundle) li.unit_price_premarkup = purchasePrice;

          // location internal _id (PARTS warehouse location)
          if (prod.location_internal) li.location = prod.location_internal;

          // markup
          if (prod.markup) {
            li.markup = {
              markup_type: prod.markup.markup_type || 'PERCENTAGE',
              markup_value: prod.markup.markup_value || 0,
              markup_price: markupPrice,
            };
          }

          // product_ref_id — full product snapshot from Zuper GET
          if (prod.zuper_raw) li.product_ref_id = prod.zuper_raw;

          return li;
        }

        // Build line items with HEADER entries for each layout section
        // Build line items from a given set of sections (caller provides tier's sections)
        async function buildSectionedLineItems(sections) {
          const lineItems = [];

          for (const section of (sections || [])) {
            const sectionName = section.SectionTitle || '';
            const sectionItems = section.EstimateItems || section.Items || [];

            // Only include sections that have at least one item matching a product
            const matchedItems = sectionItems.filter(
              item => lookupProduct(item)?.zuper_uid
            );
            if (matchedItems.length === 0) continue;

            // HEADER line item for this section (only when SectionTitle exists in SumoQuote)
            if (sectionName) {
              lineItems.push({
                line_item_type: 'HEADER',
                name: sectionName,
                section_total: 0,
                section_type: 'EXPANDED',
                show_section_total: false,
                show_child_prices: true,
                quantity: 0,
                unit_price: 0,
                discount: 0,
                serial_nos: [],
                discount_type: 'FIXED',
                total: 0,
                product_type: 'PARTS',
                associated_products: [],
              });
            }

            for (const item of sectionItems) {
              const prod = lookupProduct(item);
              if (prod?.zuper_uid) lineItems.push(await buildProductLineItem(prod));
            }
          }

          return lineItems;
        }

        // Detect all tiers dynamically (Tier1, Tier2, Tier3, ...)
        const edp = (payload.Report || payload)?.EstimateDetailsPage || {};
        const tierEntries = Object.entries(edp)
          .filter(([k]) => /^Tier\d+$/.test(k))
          .sort(([a], [b]) => a.localeCompare(b));

        const tiersStr = tierEntries.map(([k]) => k).join(', ') || 'none';
        console.log(`[layouts] layout "${layoutName}" tiers found: ${tiersStr}`);
        if (results.length < 3) debug.push(`[layouts] "${layoutName}" tiers: ${tiersStr}, edp keys: ${JSON.stringify(Object.keys(edp).slice(0, 8))}`);

        if (tierEntries.length === 0) {
          // No tiers found — skip this layout
          console.log(`[layouts] SKIPPED layout "${layoutName}" — no Tier* keys in EstimateDetailsPage`);
          results.push({
            layoutId, layoutName, tierKey: null, tierName: null,
            packageName: layoutName, source: layout.source,
            workType: layout.WorkType || layout.work_type || '',
            isDefault: layout.IsDefault || layout.is_default || false,
            itemCount: rawItems.length, linkedCount: 0,
            packageUid: null, status: 'SKIPPED', error: 'No tiers found',
          });
        } else {
          for (const [tierKey, tierObj] of tierEntries) {
            const tierName = tierObj.Name || tierKey;
            const packageName = `${layoutName} - ${tierName}`;
            const lineItems = await buildSectionedLineItems(tierObj.EstimateSections || []);

            const itemCount = lineItems.filter(li => li.line_item_type === 'ITEM').length;
            console.log(`[layouts] tier "${packageName}" lineItems: ${lineItems.length} (${itemCount} items)`);

            if (itemCount === 0) {
              // Collect names of unmatched items to explain the skip
              const allSectionItems = (tierObj.EstimateSections || []).flatMap(s => s.EstimateItems || s.Items || []);
              const unmatchedNames = allSectionItems
                .filter(it => !lookupProduct(it)?.zuper_uid)
                .map(it => it.PriceDetailName || it.Name || it.name || it.PriceDetailId || '?')
                .slice(0, 5);
              const skipReason = allSectionItems.length === 0
                ? 'Layout has no items in any section'
                : `None of the ${allSectionItems.length} items in this layout were successfully migrated in Phase 3. Unmatched items: ${unmatchedNames.join(', ')}${allSectionItems.length > 5 ? ` … and ${allSectionItems.length - 5} more` : ''}`;
              const firstSection = (tierObj.EstimateSections || [])[0];
              const firstItem = (firstSection?.EstimateItems || firstSection?.Items || [])[0];
              if (firstItem && debug.length < 20) {
                debug.push(`[layouts] SKIP "${packageName}" — first item keys: ${JSON.stringify(Object.keys(firstItem))}, PriceDetailId="${firstItem.PriceDetailId}", Name="${firstItem.Name}", name="${firstItem.name}"`);
              }
              console.log(`[layouts] SKIPPED "${packageName}" — ${skipReason}`);
              results.push({
                layoutId, layoutName, tierKey, tierName, packageName,
                source: layout.source,
                workType: layout.WorkType || layout.work_type || '',
                isDefault: layout.IsDefault || layout.is_default || false,
                itemCount: allSectionItems.length, linkedCount: 0,
                packageUid: null, status: 'SKIPPED', error: skipReason,
              });
              continue;
            }

            if (process.env.DEBUG_LAYOUTS && lineItems.filter(li => li.line_item_type === 'ITEM').length > 0) {
              const first = lineItems.find(li => li.line_item_type === 'ITEM');
              console.log(`[layouts] "${packageName}" first item — name: "${first.name}", unit_price: ${first.unit_price}, uom: "${first.uom}"`);
            }

            // Create Zuper service package for this tier
            const pkgRes = await fetchWithRetry(`${base_url}invoice_estimate/package`, {
              method: 'POST',
              headers: zuperHeaders(zuperApiKey),
              body: JSON.stringify({
                invoice_estimate_package: {
                  package_name: packageName,
                  line_items: lineItems,
                },
              }),
            });

            if (process.env.DEBUG_LAYOUTS) {
              console.log(`[layouts] "${packageName}" package creation status: ${pkgRes.status}, response: ${JSON.stringify(pkgRes.json)}`);
            }

            const ok = pkgRes.ok && (pkgRes.json?.type === 'success' || pkgRes.json?.data?.package_uid);
            results.push({
              layoutId, layoutName, tierKey, tierName, packageName,
              source: layout.source,
              workType: layout.WorkType || layout.work_type || '',
              isDefault: layout.IsDefault || layout.is_default || false,
              itemCount: rawItems.length, linkedCount: lineItems.length,
              packageUid: pkgRes.json?.data?.package_uid || null,
              status: ok ? 'SUCCESS' : 'FAILED',
              error: ok ? null : JSON.stringify(pkgRes.json),
            });
          }
        }

      } catch (e) {
        console.log(`[layouts] layout "${layoutName}" ERROR: ${e.message}`);
        results.push({
          layoutId, layoutName, tierKey: null, tierName: null,
          packageName: layoutName,
          source: layout.source,
          workType: layout.WorkType || layout.work_type || '',
          isDefault: layout.IsDefault || layout.is_default || false,
          itemCount: 0, linkedCount: 0,
          packageUid: null, status: 'FAILED', error: e.message,
        });
      }
    }));
    await sleep(BATCH_DELAY_MS);
  }

  const succeeded = results.filter(r => r.status === 'SUCCESS').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  console.log(`[layouts] done. ${succeeded} success, ${failed} failed, ${skipped} skipped`);
  debug.push(`[layouts] done. ${succeeded} success, ${failed} failed, ${skipped} skipped`);
  return { results, debug };
}

// ─── PREVIEW ──────────────────────────────────────────────────────────────────

async function runPreview({ sumoToken }) {
  // JN v2 products API — Bearer auth, paginated
  const jnHeaders = { Authorization: `Bearer ${sumoToken}`, 'Content-Type': 'application/json' };
  let rawProducts = [];
  let from = 0;
  const PAGE_SIZE = 200;
  while (true) {
    const jnRes = await fetchWithRetry(`${JN_BASE}/products?size=${PAGE_SIZE}&from=${from}`, { headers: jnHeaders });
    if (!jnRes.ok) throw new Error(`JobNimbus v2 products fetch failed: ${jnRes.status}`);
    const records = jnRes.json?.results || jnRes.json?.records || [];
    rawProducts = rawProducts.concat(records.filter(p => p.is_active !== false && p.status !== 0));
    if (records.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const measRes = await fetchWithRetry(`${SUMO_BASE}/measurement`, {
    headers: sumoHeaders(sumoToken),
  });

  // Normalize to internal shape (item_type is all we need for classification)
  const priceItems = rawProducts.map(p => ({
    Name:         p.name,
    PriceDetailId: p.jnid || p.id || p.name,
    ItemType:     (p.item_type || '').toLowerCase(),
  }));

  const allTokens = [];
  for (const cat of (measRes.json?.Data?.Payload || [])) {
    for (const t of (cat.Tokens || [])) allTokens.push(t);
  }

  let parts = 0, services = 0, bundles = 0, skipped = 0, withFormula = 0, withoutFormula = 0;
  for (const item of priceItems) {
    const type = classifyItemJN(item);
    if (type === 'PARTS') parts++;
    else if (type === 'SERVICE') services++;
    else if (type === 'BUNDLE') bundles++;
    else skipped++;
    withFormula++;  // All items potentially have formulas in JN mode
  }

  return {
    totalPriceItems: priceItems.length,
    parts, services, bundles, skipped,
    withFormula, withoutFormula,
    totalTokens: allTokens.length,
  };
}

// ─── DELETE ALL CUSTOM FORMULAS ───────────────────────────────────────────────

async function deleteAllFormulas({ zuperApiKey, base_url }) {
  const r = await fetchWithRetry(`${base_url}invoice_estimate/cpq/formulas?count=300`, {
    headers: zuperHeaders(zuperApiKey),
  });
  if (!r.ok) throw new Error(`Failed to fetch formulas: ${JSON.stringify(r.json)}`);

  const formulas = r.json?.data || [];
  const customFormulas = formulas.filter(f => f.is_custom === true);

  if (customFormulas.length === 0) {
    return { deleted: 0, failed: 0, results: [], message: 'No custom formulas found' };
  }

  const results = [];
  for (const batch of chunks(customFormulas, BATCH_SIZE)) {
    await Promise.all(batch.map(async (f) => {
      try {
        const dr = await fetchWithRetry(`${base_url}invoice_estimate/cpq/formulas/${f.formula_uid}`, {
          method: 'DELETE',
          headers: zuperHeaders(zuperApiKey),
        });
        results.push({
          formula_uid: f.formula_uid,
          formula_name: f.formula_name,
          status: dr.ok ? 'DELETED' : 'FAILED',
          error: dr.ok ? null : JSON.stringify(dr.json),
        });
      } catch (e) {
        results.push({
          formula_uid: f.formula_uid,
          formula_name: f.formula_name,
          status: 'FAILED',
          error: e.message,
        });
      }
    }));
    await sleep(BATCH_DELAY_MS);
  }

  return {
    deleted: results.filter(r => r.status === 'DELETED').length,
    failed: results.filter(r => r.status === 'FAILED').length,
    results,
  };
}

// ─── DELETE ALL SERVICE PACKAGES ─────────────────────────────────────────────

async function deleteAllPackages({ zuperApiKey, base_url }) {
  // Paginate through all packages
  const allPackages = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const r = await fetchWithRetry(
      `${base_url}invoice_estimate/package?count=${pageSize}&page=${page}`,
      { headers: zuperHeaders(zuperApiKey) }
    );
    if (!r.ok) throw new Error(`Failed to fetch packages (page ${page}): ${JSON.stringify(r.json)}`);

    const items = r.json?.data || [];
    allPackages.push(...items);

    if (items.length < pageSize) break;  // last page
    page++;
  }

  if (allPackages.length === 0) {
    return { deleted: 0, failed: 0, results: [], message: 'No service packages found' };
  }

  const results = [];
  for (const batch of chunks(allPackages, BATCH_SIZE)) {
    await Promise.all(batch.map(async (pkg) => {
      const uid = pkg.package_uid;
      try {
        const dr = await fetchWithRetry(`${base_url}invoice_estimate/package/${uid}`, {
          method: 'DELETE',
          headers: zuperHeaders(zuperApiKey),
        });
        results.push({
          package_uid: uid,
          package_name: pkg.package_name || uid,
          status: dr.ok ? 'DELETED' : 'FAILED',
          error: dr.ok ? null : JSON.stringify(dr.json),
        });
      } catch (e) {
        results.push({ package_uid: uid, package_name: pkg.package_name || uid, status: 'FAILED', error: e.message });
      }
    }));
    await sleep(BATCH_DELAY_MS);
  }

  return {
    deleted: results.filter(r => r.status === 'DELETED').length,
    failed: results.filter(r => r.status === 'FAILED').length,
    results,
  };
}

// ─── DELETE ALL PRODUCTS ─────────────────────────────────────────────────────

async function deleteAllProducts({ zuperApiKey, base_url }) {
  const allProducts = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const r = await fetchWithRetry(
      `${base_url}product?count=${pageSize}&page=${page}`,
      { headers: zuperHeaders(zuperApiKey) }
    );
    if (!r.ok) throw new Error(`Failed to fetch products (page ${page}): ${JSON.stringify(r.json)}`);
    const items = r.json?.data || [];
    allProducts.push(...items);
    if (items.length < pageSize) break;
    page++;
  }

  if (allProducts.length === 0) {
    return { deleted: 0, failed: 0, results: [], message: 'No products found' };
  }

  const results = [];
  for (const batch of chunks(allProducts, BATCH_SIZE)) {
    await Promise.all(batch.map(async (p) => {
      try {
        const dr = await fetchWithRetry(`${base_url}product/${p.product_uid}`, {
          method: 'DELETE',
          headers: zuperHeaders(zuperApiKey),
        });
        results.push({
          product_uid: p.product_uid,
          product_name: p.product_name,
          status: dr.ok ? 'DELETED' : 'FAILED',
          error: dr.ok ? null : JSON.stringify(dr.json),
        });
      } catch (e) {
        results.push({
          product_uid: p.product_uid,
          product_name: p.product_name,
          status: 'FAILED',
          error: e.message,
        });
      }
    }));
    await sleep(BATCH_DELAY_MS);
  }

  return {
    deleted: results.filter(r => r.status === 'DELETED').length,
    failed: results.filter(r => r.status === 'FAILED').length,
    results,
  };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const ALLOWED_BASE_URLS = [
  'https://us-east-1.zuperpro.com/api/',
  'https://us-west-1c.zuperpro.com/api/',
  'https://stagingv2.zuperpro.com/api/',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  const {
    sumoToken, zuperApiKey, base_url, categoryName,
    userEmail, sumoCompanyName,
    phases, action,
    tokenMap: incomingTokenMap,
    formulaMap: incomingFormulaMap,
    formulasByProduct: incomingFormulasByProduct,
    categoryUid: incomingCategoryUid,
    tokenCategoryMap: incomingTokenCategoryMap,
    tokenMatchOverrides,
    productResults: incomingProductResults,
    taxRate: incomingTaxRate,
  } = req.body;

  if (!sumoToken || !zuperApiKey || !base_url) {
    return res.status(400).json({ error: 'Missing required fields: sumoToken, zuperApiKey, base_url' });
  }

  if (!ALLOWED_BASE_URLS.includes(base_url)) {
    return res.status(400).json({ error: 'Invalid base_url. Must be one of the allowed Zuper regions.' });
  }

  if (!sumoToken.startsWith('Bearer ')) {
    return res.status(400).json({ error: 'sumoToken must start with "Bearer "' });
  }

  // Prevent the same account from running two migrations simultaneously.
  // Key is a simple concatenation — sufficient to uniquely identify the account pair.
  const migrationKey = `${sumoToken}::${zuperApiKey}`;
  if (activeMigrations.has(migrationKey)) {
    return res.status(409).json({ error: 'A migration is already running for this account. Please wait for it to complete.' });
  }

  if (action === 'preview') {
    try {
      const preview = await runPreview({ sumoToken });
      return res.status(200).json({ preview });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'previewZeroItems') {
    try {
      // JN v2 products API — fetch all, flag items with unknown/missing item_type
      const jnHeaders = { Authorization: `Bearer ${sumoToken}`, 'Content-Type': 'application/json' };
      let allProducts = [];
      let from = 0;
      const PAGE_SIZE = 200;
      while (true) {
        const jnRes = await fetchWithRetry(`${JN_BASE}/products?size=${PAGE_SIZE}&from=${from}`, { headers: jnHeaders });
        if (!jnRes.ok) throw new Error(`JobNimbus v2 products fetch failed: ${jnRes.status}`);
        const records = jnRes.json?.results || jnRes.json?.records || [];
        allProducts = allProducts.concat(records.filter(p => p.is_active !== false));
        if (records.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      const KNOWN_TYPES = new Set(['labor+material', 'labor', 'material']);
      const zeroItems = allProducts
        .filter(p => !KNOWN_TYPES.has((p.item_type || '').toLowerCase()))
        .map(p => ({ sumo_id: p.jnid || p.id || p.name, name: p.name, description: `item_type: "${p.item_type || ''}"` }));
      return res.status(200).json({ zeroItems });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'deleteFormulas') {
    try {
      const result = await deleteAllFormulas({ zuperApiKey, base_url });
      return res.status(200).json({ deleteFormulas: result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'deletePackages') {
    try {
      const result = await deleteAllPackages({ zuperApiKey, base_url });
      return res.status(200).json({ deletePackages: result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'deleteProducts') {
    try {
      const result = await deleteAllProducts({ zuperApiKey, base_url });
      return res.status(200).json({ deleteProducts: result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'matchTokens') {
    try {
      const [sumoRes, zuperRes] = await Promise.all([
        fetchWithRetry(`${SUMO_BASE}/measurement`, { headers: sumoHeaders(sumoToken) }),
        fetchWithRetry(`${base_url}measurements/categories?sort=ASC&sort_by=created_at`, { headers: zuperHeaders(zuperApiKey) }),
      ]);
      if (!sumoRes.ok) throw new Error(`SumoQuote measurements fetch failed: ${sumoRes.status}`);

      const sumoCategories = sumoRes.json?.Data?.Payload || [];
      const allSumoTokens = [];
      for (const cat of sumoCategories) {
        for (const t of (cat.Tokens || [])) {
          allSumoTokens.push({ ...t, sumoCategory: cat.Name });
        }
      }

      const allZuperCategories = zuperRes.json?.data || [];
      const defaultTokens = allZuperCategories
        .flatMap(cat => (cat.measurement_tokens || cat.tokens || []).map(t => ({
          ...t,
          categoryName: cat.measurement_category_name,
          categoryUid: cat.measurement_category_uid,
        })))
        .filter(t => t.is_default === true);

      const matches = allSumoTokens.map(st => {
        const best = bestZuperMatch(st.Name, st.UnitOfMeasure || '', defaultTokens);
        return {
          sumoId: st.TokenId,
          sumoName: st.Name,
          sumoUom: st.UnitOfMeasure || '',
          sumoCategory: st.sumoCategory,
          zuperUid: best?.uid || null,
          zuperCategoryUid: best?.categoryUid || null,
          zuperName: best?.name || null,
          zuperUom: best?.uom || null,
          zuperCategory: best?.categoryName || null,
          confidence: best ? Math.round(best.score * 100) : 0,
          tier: best ? (best.score >= 0.75 ? 'green' : 'amber') : 'none',
        };
      });

      // Also return all default tokens so the frontend can build override dropdowns
      const allDefaultTokensFlat = defaultTokens.map(t => ({
        uid: t.measurement_token_uid,
        name: t.measurement_token_name,
        uom: t.uom || '',
        categoryName: t.categoryName,
        categoryUid: t.categoryUid,
      }));

      return res.status(200).json({ ok: true, matches, defaultTokens: allDefaultTokensFlat });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const runPhases = phases || ['measurements', 'formulas', 'products'];
  const response = { phases: {} };

  let tokenMap = incomingTokenMap || {};
  let formulaMap = incomingFormulaMap || {};
  let formulasByProduct = incomingFormulasByProduct || {};
  let categoryUid = incomingCategoryUid || null;
  let tokenCategoryMap = incomingTokenCategoryMap || {};

  // Validate and sanitise taxRate — must be a finite number in [0, 100].
  const taxRate = Math.min(Math.max(parseFloat(incomingTaxRate) || 0, 0), 100);

  // Validate incomingProductResults shape — only keep elements with string sumo_id and zuper_uid.
  const safeProductResults = Array.isArray(incomingProductResults)
    ? incomingProductResults.filter(
        p => p && typeof p.sumo_id === 'string' && typeof p.zuper_uid === 'string'
      )
    : [];

  activeMigrations.set(migrationKey, true);
  try {
    if (runPhases.includes('measurements')) {
      const m = await runMeasurements({ sumoToken, zuperApiKey, base_url, categoryName, tokenMatchOverrides });
      tokenMap = m.tokenMap;
      categoryUid = m.categoryUid;
      tokenCategoryMap = m.tokenCategoryMap || {};
      response.phases.measurements = {
        results: m.results, tokenMap, categoryUid, tokenCategoryMap,
        summary: {
          total: m.results.length,
          success: m.results.filter(r => r.status === 'SUCCESS').length,
          matched: m.results.filter(r => r.status === 'MATCHED').length,
          failed: m.results.filter(r => r.status === 'FAILED').length,
        },
      };
    }

    if (runPhases.includes('formulas')) {
      if (!Object.keys(tokenMap).length) {
        response.phases.formulas = {
          warning: 'No token map available. Run measurements first. Formulas skipped.',
          results: [], formulaMap: {},
          summary: { total: 0, success: 0, failed: 0, skipped: 0 },
        };
      } else {
        const f = await runFormulas({ sumoToken, zuperApiKey, base_url, tokenMap, categoryUid, tokenCategoryMap });
        formulaMap = f.formulaMap;
        formulasByProduct = f.formulasByProduct || {};
        response.phases.formulas = {
          results: f.results, formulaMap, formulasByProduct,
          debug: f.debug || [],
          summary: {
            total: f.results.length,
            success: f.results.filter(r => r.status === 'SUCCESS').length,
            failed: f.results.filter(r => r.status === 'FAILED').length,
            skipped: f.results.filter(r => r.status === 'SKIPPED').length,
          },
        };
      }
    }

    let productResultsWithRaw = null;
    if (runPhases.includes('products')) {
      const p = await runProducts({
        sumoToken, zuperApiKey, base_url, formulaMap, formulasByProduct,
        taxRate,
      });
      // Strip zuper_raw from results before serializing to response — it's large and only needed
      // internally for the layouts phase within the same request. Keep a reference for layouts below.
      productResultsWithRaw = p.results;
      const productResultsSlim = p.results.map(r => {
        const { zuper_raw, ...rest } = r;
        return rest;
      });
      response.phases.products = {
        results: productResultsSlim,
        debug: p.debug || [],
        summary: {
          total: p.results.length,
          success: p.results.filter(r => r.status === 'SUCCESS').length,
          partial: p.results.filter(r => r.status === 'PARTIAL').length,
          failed: p.results.filter(r => r.status === 'FAILED').length,
          skipped: p.results.filter(r => r.status === 'SKIPPED').length,
          bundles: p.results.filter(r => r.product_type === 'BUNDLE').length,
          parts: p.results.filter(r => r.product_type === 'PARTS').length,
          services: p.results.filter(r => r.product_type === 'SERVICE').length,
          formula_linked: p.results.filter(r => r.formula_linked).length,
        },
      };
    }

    if (runPhases.includes('layouts')) {
      // Use product results with zuper_raw from this run (if products ran in same request),
      // otherwise fall back to slim results passed from a previous run (zuper_raw won't be present)
      const productResults = productResultsWithRaw || safeProductResults || response.phases?.products?.results;
      const l = await runLayouts({ sumoToken, zuperApiKey, base_url, productResults });
      response.phases.layouts = {
        results: l.results,
        debug: l.debug || [],
        summary: {
          total: l.results.length,
          success: l.results.filter(r => r.status === 'SUCCESS').length,
          failed: l.results.filter(r => r.status === 'FAILED').length,
          shared: l.results.filter(r => r.source === 'Shared').length,
          personal: l.results.filter(r => r.source === 'Personal').length,
        },
      };
    }

    await sendWebhookReport({ response, userEmail: userEmail || '', sumoCompanyName: sumoCompanyName || '' });
    return res.status(200).json(response);
  } catch (e) {
    console.error('[migrate] unhandled error:', e);
    return res.status(500).json({ error: 'Migration failed — check server logs for details.' });
  } finally {
    activeMigrations.delete(migrationKey);
  }
}