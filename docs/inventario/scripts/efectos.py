import re, os, sys, json
d = sys.argv[1]
ID = r'(?:public\.)?"?([a-z0-9_]+)"?'
rows = []
for f in sorted(os.listdir(d)):
    if re.match(r'^\d{14}_[0-9a-f]{8}-', f) or not f.endswith('.sql'): continue
    v, name = f[:14], f[15:-4]
    s = open(os.path.join(d, f), encoding='utf-8', errors='ignore').read()
    s = re.sub(r'--[^\n]*', ' ', s); s = re.sub(r'/\*.*?\*/', ' ', s, flags=re.S); low = s.lower()
    objs = set()
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+' + ID, low): objs.add(('funcion', m.group(1), ''))
    for m in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?' + ID, low): objs.add(('tabla', m.group(1), ''))
    for m in re.finditer(r'alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?' + ID + r'([^;]*);', low):
        for c in re.finditer(r'add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?', m.group(2)): objs.add(('columna', m.group(1) + '.' + c.group(1), ''))
    for m in re.finditer(r"execute\s+format\(\s*'alter table (?:public\.)?%i add column if not exists ([a-z0-9_]+)", low):
        tb = re.search(r"array\[([^\]]+)\]", low)
        if tb:
            for t in re.findall(r"'([a-z0-9_]+)'", tb.group(1)): objs.add(('columna', t + '.' + m.group(1), ''))
    for m in re.finditer(r'create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?', low): objs.add(('indice', m.group(1), ''))
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z0-9_]+)"?[^;]*?\son\s+' + ID, low): objs.add(('trigger', m.group(1), m.group(2)))
    for m in re.finditer(r'create\s+policy\s+"([^"]+)"\s+on\s+' + ID, low): objs.add(('politica', m.group(1), m.group(2)))
    for m in re.finditer(r'drop\s+(function|table|index|trigger|policy)\s+(?:if\s+exists\s+)?"?([a-z0-9_ ]+?)"?(?:\s|\(|;)', low):
        k = {'function': 'funcion', 'table': 'tabla', 'index': 'indice', 'trigger': 'trigger', 'policy': 'politica'}[m.group(1)]
        objs = {o for o in objs if not (o[0] == k and o[1] == m.group(2).strip() and low.rfind('create', 0, m.start()) < m.start() and False)}
    for o in sorted(objs): rows.append([v, name, o[0], o[1], o[2]])
json.dump(rows, open(sys.argv[2], 'w'))
from collections import Counter
print(len(rows), Counter(r[2] for r in rows), len({r[0]+r[1] for r in rows}), 'migraciones con objetos')
