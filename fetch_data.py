import os
import json
from supabase import create_client, Client

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

def fetch_all():
    all_lines = []
    offset = 0
    limit = 1000
    while True:
        # Usamos query directo para poder hacer el join complejo
        res = supabase.rpc('get_sales_for_sweep', {
            'start_date': '2026-07-27',
            'p_limit': limit,
            'p_offset': offset
        }).execute()
        
        if not res.data:
            break
        all_lines.extend(res.data)
        if len(res.data) < limit:
            break
        offset += limit
    
    with open('sales_data.json', 'w') as f:
        json.dump(all_lines, f)

if __name__ == "__main__":
    # Primero creamos la RPC si no existe
    # Pero no podemos crear RPCs así de fácil sin permisos.
    # Usaremos el approach de tablas con range.
    all_lines = []
    offset = 0
    limit = 1000
    while True:
        res = supabase.table('venta_lineas').select(
            "id, cantidad, precio_unitario, descuento_pct, iva_pct, ieps_pct, total, subtotal, iva_monto, ieps_monto, precio_unitario_sin_redondeo, ventas!inner(id, folio, created_at, status)"
        ).filter('ventas.created_at', 'gte', '2026-07-27').filter('ventas.status', 'neq', 'cancelado').range(offset, offset + limit - 1).execute()
        
        if not res.data:
            break
        
        # Para cada línea, necesitamos las promociones
        line_ids = [l['id'] for l in res.data]
        promos_res = supabase.table('promocion_aplicada').select('*').in_('venta_linea_id', line_ids).execute()
        promos_map = {}
        for p in promos_res.data:
            if p['venta_linea_id'] not in promos_map:
                promos_map[p['venta_linea_id']] = []
            promos_map[p['venta_linea_id']].append(p)
            
        for l in res.data:
            l['linea_id'] = l['id']
            l['folio'] = l['ventas']['folio']
            l['linea_total'] = l['total']
            l['promocion_aplicada'] = promos_map.get(l['id'], [])
            all_lines.append(l)
            
        if len(res.data) < limit:
            break
        offset += limit
        
    with open('sales_data.json', 'w') as f:
        json.dump(all_lines, f)
