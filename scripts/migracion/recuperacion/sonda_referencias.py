import sys, json
sys.path.insert(0, sys.argv[3])
import recuperar_base_vieja as R
class A: pass
a = A(); a.datos = sys.argv[1]; a.existentes = sys.argv[2]
d, ex = R.cargar(a)
por, x = R.agrupar(d, ex)
MAP = [('cliente_id', 'clientes'), ('almacen_id', 'almacenes'), ('producto_id', 'productos'), ('lote_id', 'lotes'), ('unidad_id', 'unidades'),
       ('lista_precio_id', 'lista_precios'), ('tarifa_id', 'tarifas'), ('turno_id', 'caja_turnos'), ('zona_id', 'zonas'),
       ('vendedor_id', 'profiles'), ('vendedor_ruta_id', 'profiles'), ('creado_por', 'profiles'), ('cobrador_id', 'profiles'), ('validado_por', 'profiles'),
       ('presentacion_id', 'producto_presentaciones'), ('promocion_id', 'promociones'), ('pedido_id', 'ventas'), ('venta_id', 'ventas'), ('empresa_id', 'empresas')]
own = {t: {r['id'] for e in por for r in por[e].get(t, [])} for t in R.TABLAS}
refs = {}
for e in por:
    for t, rows in por[e].items():
        for r in rows:
            for col, tab in MAP:
                v = r.get(col)
                if v and not (tab in own and v in own[tab]):
                    refs.setdefault(tab, set()).add(v[:8])
            if t in ('cobros', 'visitas', 'gastos') and r.get('user_id'):
                refs.setdefault('auth_users', set()).add(r['user_id'][:8])
parts = []
for t in sorted(refs):
    arr = ','.join(sorted(refs[t]))
    tab = 'auth.users' if t == 'auth_users' else 'public.' + t
    parts.append(f"select '{t}' t, {len(refs[t])} n, (select string_agg(x,',') from unnest(string_to_array('{arr}',',')) x where not exists(select 1 from {tab} z where left(z.id::text,8)=x)) faltan")
print('\nunion all '.join(parts) + ';')
