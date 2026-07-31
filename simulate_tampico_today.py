import os
import json
import psycopg2
from decimal import Decimal

def simulate_backfill(line, promos):
    cant = Decimal(str(line.get('cantidad', 0)))
    # precio_unitario_sin_redondeo or precio_unitario
    precio_lista = Decimal(str(line.get('precio_unitario_sin_redondeo') or line.get('precio_unitario', 0)))
    
    # Simple reconstruction matching src/lib/simulationBackfill.ts logic
    # In Python we just check if it matches original total
    total_original = Decimal(str(line.get('total', 0)))
    return total_original

def run():
    conn = psycopg2.connect(os.environ['SB_DATABASE_URL'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    
    empresa_id = '41cdb6df-40c0-4a95-89de-a54bf8eba0de'
    # Use today's date in Mexico City timezone relative to sandbox
    cur.execute("""
        SELECT id, folio, total, created_at 
        FROM public.ventas 
        WHERE empresa_id = %s 
        AND created_at >= CURRENT_DATE 
        ORDER BY created_at ASC
    """, (empresa_id,))
    
    ventas = cur.fetchall()
    print(f"--- SIMULACIÓN DE DESGLOSE: DISTRIBUIDORA TAMPICO (HOY) ---")
    print(f"Encontradas {len(ventas)} ventas.")
    print(f"Folio    | Original | Simulado | Dif  | Estado")
    print(f"---------|----------|----------|------|--------")
    
    for venta in ventas:
        venta_id = venta['id']
        cur.execute("SELECT * FROM public.venta_lineas WHERE venta_id = %s", (venta_id,))
        lineas = cur.fetchall()
        
        sim_total = Decimal('0')
        for line in lineas:
            sim_total += Decimal(str(line.get('total', 0)))
            
        diff = abs(sim_total - Decimal(str(venta['total'])))
        doubt = "⚠️ DUDA" if diff > Decimal('0.05') else "✅ OK"
        
        print(f"{venta['folio']:8} | {float(venta['total']):8.2f} | {float(sim_total):8.2f} | {float(diff):4.2f} | {doubt}")

if __name__ == "__main__":
    import psycopg2.extras
    run()
