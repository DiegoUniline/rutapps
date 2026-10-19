import re, json, sys
src = open(sys.argv[1]).read().split('\n')
# Only the first "public:" block (lines 15..10745 Tables, Views, Functions, Enums)
out = {'tables': {}, 'views': {}, 'functions': [], 'enums': {}}
section = None; cur = None; in_row = False; depth_row = 0
for i, line in enumerate(src):
    if i > 12180: break
    m = re.match(r'^    (Tables|Views|Functions|Enums|CompositeTypes): \{', line)
    if m: section = m.group(1); cur = None; continue
    if section in ('Tables', 'Views'):
        m = re.match(r'^      ([a-z0-9_]+): \{', line)
        if m: cur = m.group(1); (out['tables'] if section=='Tables' else out['views'])[cur] = {}; in_row = False; continue
        if re.match(r'^        Row: \{', line): in_row = True; continue
        if in_row and re.match(r'^        \}', line): in_row = False; continue
        if in_row:
            m = re.match(r'^          ([a-z0-9_]+):\s*(.*)$', line)
            if m: (out['tables'] if section=='Tables' else out['views'])[cur][m.group(1)] = m.group(2).strip()
    elif section == 'Functions':
        m = re.match(r'^      ([a-z0-9_]+):', line)
        if m and m.group(1) not in out['functions']: out['functions'].append(m.group(1))
    elif section == 'Enums':
        m = re.match(r'^      ([a-z0-9_]+):\s*(.*)$', line)
        if m: cur = m.group(1); out['enums'][cur] = re.findall(r'"([^"]+)"', m.group(2))
        elif cur:
            out['enums'][cur] += re.findall(r'"([^"]+)"', line)
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(len(out['tables']), 'tablas', sum(len(v) for v in out['tables'].values()), 'columnas', len(out['views']), 'vistas', len(out['functions']), 'funciones', len(out['enums']), 'enums')
