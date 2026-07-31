import json
import sys
import os

# Helper to load from tool-results
def load_data(file_path):
    # This is a bit tricky since I can't directly 'open' tool-results from python.
    # I should have the data passed in via stdin.
    data = json.load(sys.stdin)
    return data

def round2(value):
    return round(float(value) + 1e-9, 2)

def get_tax_multiplier(iva_pct, ieps_pct):
    return (1 + float(ieps_pct) / 100) * (1 + float(iva_pct) / 100)

def simulate_line(line):
    cant = float(line.get('cantidad', 0))
    precio_lista = float(line.get('precio_unitario_sin_redondeo') or line.get('precio_unitario') or 0)
    iva_pct = float(line.get('iva_pct', 0))
    ieps_pct = float(line.get('ieps_pct', 0))
    desc_pct = float(line.get('descuento_pct', 0))
    
    subtotal = round2(cant * precio_lista)
    descuento_manual = round2(subtotal * (desc_pct / 100))
    base_neta = round2(subtotal - descuento_manual)
    
    ieps_monto = round2(base_neta * (ieps_pct / 100))
    iva_monto = round2((base_neta + ieps_monto) * (iva_pct / 100))
    total_reconstruido = round2(base_neta + ieps_monto + iva_monto)
    
    mult = get_tax_multiplier(iva_pct, ieps_pct)
    importe_bruto = round2(precio_lista * mult * cant)
    
    promo_aplicada = line.get('promocion_aplicada') or []
    # json_agg returns a string or list depending on the caller
    if isinstance(promo_aplicada, str):
        promo_aplicada = json.loads(promo_aplicada)
    
    promo_monto = sum(float(p.get('descuento_aplicado', 0)) for p in (promo_aplicada or []))
    
    orig_total = float(line.get('linea_total', 0))
    diff = abs(orig_total - total_reconstruido)
    
    return {
        "linea_id": line['linea_id'],
        "folio": line['folio'],
        "diff": diff,
        "fields": {
            "precio_lista_unitario": precio_lista,
            "importe_bruto": importe_bruto,
            "descuento_promocion_monto": promo_monto,
            "descuento_manual_monto": descuento_manual,
            "descuento_total_monto": round2(promo_monto + descuento_manual),
            "base_ieps": base_neta,
            "base_iva": round2(base_neta + ieps_monto),
            "ieps_monto": ieps_monto,
            "iva_monto": iva_monto,
            "impuestos_totales": round2(ieps_monto + iva_monto),
            "objeto_impuesto": '02' if (iva_monto > 0 or ieps_monto > 0) else '01'
        }
    }

def main():
    data = json.load(sys.stdin)
    results = [simulate_line(l) for l in data]
    
    # Validation
    errors = [r for r in results if r['diff'] > 0.05] # Tolerancia pequeña por redondeos legacy
    
    if errors:
        print(f"Validation FAILED: {len(errors)} errors found.")
        for e in errors[:5]:
            print(f"Folio {e['folio']} ID {e['linea_id']}: diff={e['diff']}")
    else:
        print(f"Validation SUCCESS: {len(results)} lines checked.")
        # Generar SQL para el barrido
        print("-- SQL BARRIDO --")
        for r in results:
            fields = r['fields']
            sets = ", ".join([f"{k} = {v}" if not isinstance(v, str) else f"{k} = '{v}'" for k, v in fields.items()])
            print(f"UPDATE public.venta_lineas SET {sets} WHERE id = '{r['linea_id']}';")

if __name__ == "__main__":
    main()
