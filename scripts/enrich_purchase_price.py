"""
Populate purchase_price on srs_products = round(suggested_price * 0.6, 2).
Groups products by their calculated purchase_price so we can PATCH all products
with the same price in a single API call (minimises round-trips).
"""
import sys, io, json, os, urllib.request, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def load_env():
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

load_env()
URL = os.environ['SUPABASE_URL']
KEY = os.environ['SUPABASE_SERVICE_KEY']

BASE_HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

def fetch_all(path):
    rows, offset = [], 0
    while True:
        req = urllib.request.Request(
            f'{URL}/rest/v1/{path}&limit=1000&offset={offset}',
            headers={**BASE_HDR, 'Prefer': 'count=exact'})
        with urllib.request.urlopen(req) as r:
            total = int(r.headers.get('Content-Range', '0/0').split('/')[-1] or 0)
            batch = json.loads(r.read())
        rows.extend(batch)
        offset += len(batch)
        if offset >= total or not batch:
            break
    return rows

def patch_by_ids(product_ids, purchase_price):
    """PATCH all products in the id list to the given purchase_price."""
    # Build the IN filter — Supabase allows large IN lists in query params
    id_list = ','.join(str(i) for i in product_ids)
    h = {**BASE_HDR, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
    data = json.dumps({'purchase_price': purchase_price}).encode()
    url = f'{URL}/rest/v1/srs_products?product_id=in.({id_list})'
    req = urllib.request.Request(url, data=data, headers=h, method='PATCH')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  PATCH error {e.code}: {e.read()[:200]}')
        return e.code

# Fetch products with suggested_price
print('Fetching products with suggested_price...')
rows = fetch_all('srs_products?select=product_id,suggested_price&suggested_price=not.is.null')
print(f'  {len(rows)} products with suggested_price')

# Group by calculated purchase_price
groups: dict = collections.defaultdict(list)
for p in rows:
    purchase = round(p['suggested_price'] * 0.6, 2)
    groups[purchase].append(p['product_id'])

print(f'  {len(groups)} unique purchase_price values — sending one PATCH per group')

# PATCH each group (max 500 IDs per request to avoid URL length limits)
MAX_IDS = 500
updated = 0
errors = 0
for price, ids in sorted(groups.items()):
    for i in range(0, len(ids), MAX_IDS):
        batch = ids[i:i+MAX_IDS]
        status = patch_by_ids(batch, price)
        if status in (200, 204):
            updated += len(batch)
        else:
            errors += len(batch)

print(f'\nDone. Updated: {updated}, Errors: {errors}')

# Verify
sample = fetch_all('srs_products?select=product_id,suggested_price,purchase_price&suggested_price=not.is.null')
print('\nSample:')
for p in sample[:5]:
    print(f'  product_id={p["product_id"]}  sell=${p["suggested_price"]}  cost=${p["purchase_price"]}')
