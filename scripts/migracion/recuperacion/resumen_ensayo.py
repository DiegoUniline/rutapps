"""Resume la salida de un ENSAYO (texto con el JSON del RAISE) por empresa."""
import json, re, sys

txt = open(sys.argv[1], encoding='utf-8').read()
reps = []
for m in re.finditer(r'(ENSAYO_TOTAL \(se deshizo todo\)|ENSAYO \(se deshizo todo\)) (\[.*\]|\{.*\})', txt):
    j = json.loads(m.group(2))
    reps.extend(j if isinstance(j, list) else [j])
filas = {}
for r in reps:
    for e in r['empresas'] or []:
        filas[e['empresa'][:8]] = e
    if r.get('perfiles_inexistentes_en_null'):
        print('perfiles en null:', [(x['tabla'], x['campo'], x['valor'][:8]) for x in r['perfiles_inexistentes_en_null']])
tot = {}
for k in sorted(filas):
    e = filas[k]
    v, c = e['ventas'], e['cobros']
    row = dict(cli=e['clientes'], ven=v['n'], total=v['total'], saldo=v['saldo'], lin=e['venta_lineas'], cob=c['n'], cob_act=c['activos'],
               cob_canc=c['cancelados'], apl=c['aplicaciones'], ent=e['entregas'], el=e['entrega_lineas'], vis=e['visitas'], gas=e['gastos'],
               fol=len(e['folios_reasignados'] or []), dup=len(e['recapturadas_omitidas'] or []), conf=len(e['conflictos'] or []),
               prev=len(e['ventas_previas_afectadas'] or []), mov=e.get('movimientos_inventario'))
    print(k, e.get('nombre', ''), json.dumps(row))
    for kk, vv in row.items():
        if isinstance(vv, (int, float)):
            tot[kk] = round(tot.get(kk, 0) + vv, 2)
print('TOTAL', json.dumps(tot))
if '-v' in sys.argv:
    for k in sorted(filas):
        e = filas[k]
        for key in ('folios_reasignados', 'recapturadas_omitidas', 'conflictos', 'ventas_previas_afectadas', 'total_cambio', 'inventario'):
            if e.get(key):
                print(k, key, json.dumps(e[key], ensure_ascii=False))
