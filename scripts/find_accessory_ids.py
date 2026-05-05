"""
Query Supabase srs_products to find representative accessory product IDs.
Targets: Drip Edge, Underlayment, Nails/Fasteners, Flashing, Pipe Boots, Ridge Vent, Starter Strip.
Preference: TopShield, Grip-Rite, Lomanco, DMI, Berger, National Nail brands.
"""
import sys, io, json, os, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except FileNotFoundError:
        pass

_load_env()
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
}

def query(table, select, filters='', limit=200):
    url = f'{SUPABASE_URL}/rest/v1/{table}?select={select}&limit={limit}'
    if filters:
        url += '&' + filters
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# ── Search categories ─────────────────────────────────────────────────────────
TARGETS = [
    {
        'label': 'Drip Edge',
        'filters': [
            'product_name=ilike.*drip+edge*',
            'manufacturer_norm=ilike.*topshield*',
        ],
        'fallback': 'product_name=ilike.*drip+edge*',
        'want': 3,
    },
    {
        'label': 'Underlayment — Synthetic',
        'filters': [
            'product_name=ilike.*synthetic*&product_name=ilike.*underlayment*',
        ],
        'fallback': 'product_name=ilike.*underlayment*',
        'want': 2,
    },
    {
        'label': 'Ice & Water Shield',
        'filters': [
            'product_name=ilike.*ice*water*',
        ],
        'fallback': 'product_name=ilike.*ice*water*',
        'want': 2,
    },
    {
        'label': 'Coil Nails',
        'filters': [
            'product_name=ilike.*coil+nail*&manufacturer_norm=ilike.*grip*rite*',
            'product_name=ilike.*coil+nail*&manufacturer_norm=ilike.*national+nail*',
            'product_name=ilike.*coil+nail*',
        ],
        'fallback': 'product_name=ilike.*nail*',
        'want': 3,
    },
    {
        'label': 'Plastic Cap Nails',
        'filters': [
            'product_name=ilike.*cap+nail*',
            'product_name=ilike.*plastic+cap*',
        ],
        'fallback': 'product_name=ilike.*cap+nail*',
        'want': 1,
    },
    {
        'label': 'Step Flashing',
        'filters': [
            'product_name=ilike.*step+flashing*',
        ],
        'fallback': 'product_name=ilike.*step+flash*',
        'want': 2,
    },
    {
        'label': 'Valley Metal',
        'filters': [
            'product_name=ilike.*valley*',
        ],
        'fallback': 'product_name=ilike.*valley*',
        'want': 2,
    },
    {
        'label': 'Pipe Boots',
        'filters': [
            'product_name=ilike.*pipe+boot*',
            'product_name=ilike.*pipe+jack*',
        ],
        'fallback': 'product_name=ilike.*boot*',
        'want': 3,
    },
    {
        'label': 'Ridge Vent',
        'filters': [
            'product_name=ilike.*ridge+vent*&manufacturer_norm=ilike.*lomanco*',
            'product_name=ilike.*ridge+vent*&manufacturer_norm=ilike.*air+vent*',
            'product_name=ilike.*ridge+vent*',
        ],
        'fallback': 'product_name=ilike.*ridge*vent*',
        'want': 2,
    },
    {
        'label': 'Starter Strip',
        'filters': [
            'product_name=ilike.*starter+strip*',
            'product_name=ilike.*starter*',
        ],
        'fallback': 'product_name=ilike.*starter*',
        'want': 2,
    },
    {
        'label': 'Caulk / Sealant',
        'filters': [
            'product_name=ilike.*caulk*',
            'product_name=ilike.*sealant*',
            'product_name=ilike.*np1*',
        ],
        'fallback': 'product_name=ilike.*caulk*',
        'want': 2,
    },
]

COLS = 'product_id,product_name,manufacturer,manufacturer_norm,product_category,suggested_price,product_uom'

results = {}

for target in TARGETS:
    label = target['label']
    found = []
    seen_ids = set()

    filter_list = target['filters']

    for f in filter_list:
        if len(found) >= target['want']:
            break
        try:
            rows = query('srs_products', COLS, f, limit=20)
            for r in rows:
                pid = r['product_id']
                if pid not in seen_ids:
                    seen_ids.add(pid)
                    found.append(r)
                if len(found) >= target['want']:
                    break
        except Exception as e:
            print(f'  [warn] {label} filter "{f[:40]}": {e}')

    # fallback
    if not found:
        try:
            rows = query('srs_products', COLS, target['fallback'], limit=20)
            for r in rows:
                pid = r['product_id']
                if pid not in seen_ids:
                    seen_ids.add(pid)
                    found.append(r)
                if len(found) >= target['want']:
                    break
        except Exception as e:
            print(f'  [warn] {label} fallback: {e}')

    results[label] = found[:target['want']]

# ── Print results ─────────────────────────────────────────────────────────────
print('\n' + '='*80)
print('ACCESSORY PRODUCT IDs FROM SUPABASE')
print('='*80)

all_ids = []
for label, items in results.items():
    print(f'\n  {label} ({len(items)} found):')
    for r in items:
        print(f'    id={r["product_id"]:>7}  mfr={str(r["manufacturer"] or "")[:25]:<26}  {r["product_name"][:60]}')
        print(f'             cat={r["product_category"]}  price=${r["suggested_price"]}  uom={r["product_uom"]}')
        all_ids.append(r['product_id'])

print('\n' + '='*80)
print('TYPESCRIPT ARRAY (paste into lib/accessory-catalog.ts):')
print('='*80)
print()
print('export const ACCESSORY_PRODUCT_IDS: number[] = [')
for label, items in results.items():
    if items:
        print(f'  // {label}')
        for r in items:
            mfr = str(r['manufacturer'] or '').strip()
            name = r['product_name'][:60]
            print(f'  {r["product_id"]},  // {mfr} — {name}')
print(']')
print(f'\n// Total: {len(all_ids)} products')
