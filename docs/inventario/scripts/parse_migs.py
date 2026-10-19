import re, json, sys, os, glob
d = sys.argv[1]
ID = r'(?:public\.)?"?([a-z0-9_]+)"?'
ev = []  # (file, kind, a, b)
for f in sorted(glob.glob(os.path.join(d, '*.sql'))):
    name = os.path.basename(f)
    s = open(f, encoding='utf-8', errors='ignore').read()
    s = re.sub(r'--[^\n]*', ' ', s)
    s = re.sub(r'/\*.*?\*/', ' ', s, flags=re.S)
    low = s.lower()
    for m in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?' + ID, low): ev.append((name, 'create_table', m.group(1), None))
    for m in re.finditer(r'drop\s+table\s+(?:if\s+exists\s+)?' + ID, low): ev.append((name, 'drop_table', m.group(1), None))
    for m in re.finditer(r'alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?' + ID + r'\s+rename\s+to\s+' + ID, low): ev.append((name, 'rename_table', m.group(1), m.group(2)))
    for m in re.finditer(r'alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?' + ID + r'\s+rename\s+(?:column\s+)?"?([a-z0-9_]+)"?\s+to\s+"?([a-z0-9_]+)"?', low):
        if m.group(2) != 'to': ev.append((name, 'rename_column', m.group(1), f'{m.group(2)}->{m.group(3)}'))
    for m in re.finditer(r'alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?' + ID + r'([^;]*);', low):
        t, body = m.group(1), m.group(2)
        for c in re.finditer(r'drop\s+column\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?', body): ev.append((name, 'drop_column', t, c.group(1)))
        for c in re.finditer(r'add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?', body): ev.append((name, 'add_column', t, c.group(1)))
        for c in re.finditer(r'alter\s+column\s+"?([a-z0-9_]+)"?\s+(?:set\s+data\s+)?type\s+([a-z0-9_ ()\[\],]+?)(?:\s+using|,|$)', body): ev.append((name, 'alter_type', t, f'{c.group(1)}:{c.group(2).strip()}'))
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+' + ID, low): ev.append((name, 'create_function', m.group(1), None))
    for m in re.finditer(r'drop\s+function\s+(?:if\s+exists\s+)?' + ID, low): ev.append((name, 'drop_function', m.group(1), None))
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z0-9_]+)"?[^;]*?\son\s+' + ID, low): ev.append((name, 'create_trigger', m.group(2), m.group(1)))
    for m in re.finditer(r'drop\s+trigger\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\s+' + ID, low): ev.append((name, 'drop_trigger', m.group(2), m.group(1)))
    for m in re.finditer(r'alter\s+table\s+' + ID + r'\s+enable\s+row\s+level\s+security', low): ev.append((name, 'enable_rls', m.group(1), None))
    for m in re.finditer(r'alter\s+table\s+' + ID + r'\s+disable\s+row\s+level\s+security', low): ev.append((name, 'disable_rls', m.group(1), None))
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+' + ID, low): ev.append((name, 'create_view', m.group(1), None))
    for m in re.finditer(r'\b(delete\s+from|truncate)\s+' + ID, low): ev.append((name, 'data_delete', m.group(2), m.group(1).split()[0]))
    for m in re.finditer(r'\bupdate\s+' + ID + r'\s+set\b', low): ev.append((name, 'data_update', m.group(1), None))
json.dump(ev, open(sys.argv[2], 'w'))
from collections import Counter
print(Counter(k for _, k, _, _ in ev))
