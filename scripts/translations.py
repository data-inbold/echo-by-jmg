#!/usr/bin/env python3
"""Translation helper for the echo theme (no dependencies, Python 3.8+).

  python3 scripts/translations.py check                 every key used in the theme exists in English and Danish,
                                                        placeholders match, breadcrumb and step separators are safe
  python3 scripts/translations.py export [file.csv]     key, English, Danish, where it is used  (open in Google Sheets)
  python3 scripts/translations.py import file.csv       read the Danish column back into locales/da.json

Only the "echo" group of the locale files is touched. Plural keys (one / other) are exported as two rows, key#one and key#other.
Run from the repository root.
"""
import csv, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN = os.path.join(ROOT, 'locales', 'en.default.json')
DA = os.path.join(ROOT, 'locales', 'da.json')
KEY_RE = re.compile(r"'(echo\.[a-z0-9_.]+)'\s*\|\s*t\b")
VAR_RE = re.compile(r'\{\{\s*([a-z_]+)\s*\}\}')
TAG_RE = re.compile(r'<(/?[a-zA-Z0-9]+)')

def load(path):
    s = open(path, encoding='utf8').read()
    return json.loads(re.sub(r'^\s*/\*.*?\*/', '', s, flags=re.S))

def flatten(tree, prefix=''):
    out = {}
    for k, v in tree.items():
        key = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict) and set(v) == {'one', 'other'}:
            out[key] = v                       # plural leaf
        elif isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out

def used_keys():
    used = {}
    for d in ('sections', 'snippets', 'layout', 'templates', 'blocks'):
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base): continue
        for f in sorted(os.listdir(base)):
            if not f.endswith('.liquid'): continue
            src = open(os.path.join(base, f), encoding='utf8').read()
            for k in KEY_RE.findall(src):
                used.setdefault(k, set()).add(f'{d}/{f}')
    return used

def texts(v):
    return [v['one'], v['other']] if isinstance(v, dict) else [v]

def check():
    en, da = flatten(load(EN).get('echo', {}), 'echo'), flatten(load(DA).get('echo', {}), 'echo')
    used = used_keys()
    errors, warns = [], []
    for k in sorted(used):
        if k not in en: errors.append(f'{k}: used in {sorted(used[k])[0]} but missing in en.default.json')
        elif k not in da: errors.append(f'{k}: missing in da.json (it would show English)')
    for k in sorted(en):
        if k not in used and not k.startswith('echo.date.') and not k.startswith('echo.number.'):
            # keys read only by JavaScript are passed from layout/echo.liquid, which is scanned above
            warns.append(f'{k}: defined but not used in any Liquid file')
        if k in da:
            if isinstance(en[k], dict) != isinstance(da[k], dict):
                errors.append(f'{k}: plural in one language only')
                continue
            for a, b in zip(texts(en[k]), texts(da[k])):
                if not b.strip(): errors.append(f'{k}: empty Danish text')
                extra = set(VAR_RE.findall(b)) - set(VAR_RE.findall(a))
                if extra:
                    errors.append(f'{k}: Danish uses placeholder(s) {sorted(extra)} that the English text does not have')
                elif set(VAR_RE.findall(a)) != set(VAR_RE.findall(b)):
                    warns.append(f'{k}: Danish leaves out placeholder(s) {sorted(set(VAR_RE.findall(a)) - set(VAR_RE.findall(b)))} (allowed, check it is intended)')
                if k.endswith('_html') and sorted(TAG_RE.findall(a)) != sorted(TAG_RE.findall(b)):
                    errors.append(f'{k}: HTML tags differ between English and Danish')
    for k in sorted(set(da) - set(en)):
        warns.append(f'{k}: only in da.json')
    # separators used when the theme builds strings like "Home::url||Account"
    for k in ('echo.common.home', 'echo.common.account', 'echo.common.about_us', 'echo.common.shop', 'echo.common.gifts',
              'echo.common.bag', 'echo.common.search', 'echo.addresses.crumb', 'echo.account.create_account', 'echo.order.title'):
        for lang, tr in (('en', en), ('da', da)):
            if k in tr and re.search(r'::|\|\|', tr[k]): errors.append(f'{k} ({lang}): must not contain "::" or "||" (breadcrumb separators)')
    for lang, tr in (('en', en), ('da', da)):
        if tr.get('echo.order.steps', '').count(',') != 3: errors.append(f'echo.order.steps ({lang}): needs exactly 4 comma separated steps')
        if tr.get('echo.date.months', '').count(',') != 11: errors.append(f'echo.date.months ({lang}): needs exactly 12 comma separated months')
    print(f'{len(en)} English keys, {len(da)} Danish keys, {len(used)} keys used in Liquid')
    for w in warns: print('warning:', w)
    for e in errors: print('ERROR:', e)
    print('OK' if not errors else f'{len(errors)} error(s)')
    return 1 if errors else 0

def export(out):
    en, da = flatten(load(EN).get('echo', {}), 'echo'), flatten(load(DA).get('echo', {}), 'echo')
    used = used_keys()
    rows = []
    for k in sorted(en):
        where = ', '.join(sorted(used.get(k, [])))[:120]
        if isinstance(en[k], dict):
            for form in ('one', 'other'):
                rows.append([f'{k}#{form}', en[k][form], da.get(k, {}).get(form, '') if isinstance(da.get(k), dict) else '', where])
        else:
            rows.append([k, en[k], da.get(k, ''), where])
    with open(out, 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['key', 'english', 'danish', 'used in'])
        w.writerows(rows)
    print('wrote', out, f'({len(rows)} rows). Edit only the "danish" column; do not change the key or the {{{{ placeholders }}}}.')
    return 0

def set_path(tree, key, form, value):
    parts = key.split('.')[1:]            # drop "echo"
    node = tree
    for p in parts[:-1]: node = node[p]
    if form:
        node[parts[-1]][form] = value
    else:
        node[parts[-1]] = value

def import_csv(path):
    raw = open(DA, encoding='utf8').read()
    tree = json.loads(raw)
    echo = tree['echo']
    en = flatten(load(EN).get('echo', {}), 'echo')
    changed, problems = 0, []
    with open(path, encoding='utf-8-sig', newline='') as fh:
        for row in csv.DictReader(fh):
            key, form = (row['key'].split('#') + [None])[:2]
            if key not in en: problems.append(f'unknown key {key}'); continue
            val = (row['danish'] or '').strip()
            if not val: problems.append(f'{row["key"]}: empty Danish text, skipped'); continue
            ref = en[key][form] if form else en[key]
            if set(VAR_RE.findall(val)) - set(VAR_RE.findall(ref)):
                problems.append(f'{row["key"]}: uses a placeholder that English does not have, skipped'); continue
            cur = echo
            for p in key.split('.')[1:-1]: cur = cur[p]
            old = cur[key.split('.')[-1]][form] if form else cur[key.split('.')[-1]]
            if old != val:
                set_path(echo, key, form, val); changed += 1
    for p in problems: print('skipped:', p)
    out = json.dumps(tree, ensure_ascii=False, separators=(',', ':'))
    open(DA, 'w', encoding='utf8').write(out)
    print(f'updated {changed} Danish text(s) in locales/da.json')
    return check()

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if cmd == 'check': sys.exit(check())
    if cmd == 'export': sys.exit(export(sys.argv[2] if len(sys.argv) > 2 else 'translations.csv'))
    if cmd == 'import' and len(sys.argv) > 2: sys.exit(import_csv(sys.argv[2]))
    print(__doc__); sys.exit(2)
