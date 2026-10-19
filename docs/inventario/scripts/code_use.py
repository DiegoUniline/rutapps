import re, json, sys, os
root = sys.argv[1]; ty = json.load(open(sys.argv[2]))
T = set(ty['tables']) | set(ty['views']); F = set(ty['functions'])
use = {}  # table -> {files}
rpc = {}
colrefs = []  # (table, col, file, line)
for base in ('src', 'supabase/functions'):
    for dp, dn, fn in os.walk(os.path.join(root, base)):
        if 'integrations/supabase' in dp: continue
        for f in fn:
            if not f.endswith(('.ts', '.tsx')) or f.endswith(('.test.ts', '.test.tsx')): continue
            p = os.path.join(dp, f); rel = os.path.relpath(p, root)
            s = open(p, encoding='utf-8', errors='ignore').read()
            for m in re.finditer(r"\.from\(\s*['\"`]([a-zA-Z0-9_]+)['\"`]", s):
                t = m.group(1); use.setdefault(t, set()).add(rel)
                # chain window: until next ';' or 1500 chars
                win = s[m.end(): m.end() + 1500]
                cut = re.search(r";\s*\n|\.from\(", win); win = win[:cut.start()] if cut else win
                line = s[:m.start()].count('\n') + 1
                for c in re.finditer(r"\.(?:eq|neq|gt|gte|lt|lte|in|is|ilike|like|order|not|contains|overlaps)\(\s*['\"]([a-z0-9_]+)['\"]", win):
                    colrefs.append((t, c.group(1), rel, line))
                sm = re.search(r"\.select\(\s*(['\"`])(.*?)\1", win, re.S)
                if sm and '(' not in sm.group(2) and ':' not in sm.group(2) and '$' not in sm.group(2):
                    for c in sm.group(2).split(','):
                        c = c.strip()
                        if c and c != '*' and re.fullmatch(r'[a-z0-9_]+', c): colrefs.append((t, c, rel, line))
            for m in re.finditer(r"\.rpc\(\s*['\"`]([a-zA-Z0-9_]+)['\"`]", s):
                rpc.setdefault(m.group(1), set()).add(rel)
res = {
  'tables_used': {t: sorted(v) for t, v in sorted(use.items())},
  'rpc_used': {t: sorted(v) for t, v in sorted(rpc.items())},
  'code_tables_missing_in_types': sorted(t for t in use if t not in T),
  'code_rpc_missing_in_types': sorted(r for r in rpc if r not in F),
  'types_tables_unused': sorted(t for t in ty['tables'] if t not in use),
  'types_functions_unused_by_code': sorted(f for f in F if f not in rpc),
}
bad = sorted({(t, c, f, l) for t, c, f, l in colrefs if t in ty['tables'] and c not in ty['tables'][t]})
res['col_refs_missing'] = bad
res['col_refs_checked'] = len(colrefs)
first = {}
for t, c, f, l in colrefs:
    first.setdefault((t, c), f'{f}:{l}')
res['col_refs_all'] = [[t, c, w] for (t, c), w in sorted(first.items()) if t in T]
json.dump(res, open(sys.argv[3], 'w'), indent=1)
for k in ('code_tables_missing_in_types', 'code_rpc_missing_in_types', 'types_tables_unused'):
    print(k, len(res[k]), res[k])
print('tablas usadas', len(use), 'rpc usadas', len(rpc), 'refs de columna revisadas', len(colrefs))
print('columnas referenciadas inexistentes', len(bad))
for b in bad[:60]: print(' ', b)
