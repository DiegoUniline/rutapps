import json
import os
import sys

def round2(value):
    return round(float(value) + 1e-9, 2)

def get_tax_multiplier(iva_pct, ieps_pct):
    return (1 + float(ieps_pct) / 100) * (1 + float(iva_pct) / 100)

def simulate_line(line):
    cant = float(line.get('cantidad', 0))
    # precio_unitario_sin_redondeo es el neto crudo base
    precio_lista = float(line.get('precio_unitario_sin_redondeo') or line.get('precio_unitario') or 0)
    iva_pct = float(line.get('iva_pct', 0))
    ieps_pct = float(line.get('ieps_pct', 0))
    desc_pct = float(line.get('descuento_pct', 0))
    
    # Reconstrucción de subtotal y bases
    # subtotal = qty * net_unit_price
    subtotal = round2(cant * precio_lista)
    # descuento manual
    descuento_manual = round2(subtotal * (desc_pct / 100))
    base_neta = round2(subtotal - descuento_manual)
    
    # Impuestos sobre la base neta
    ieps_monto = round2(base_neta * (ieps_pct / 100))
    iva_monto = round2((base_neta + ieps_monto) * (iva_pct / 100))
    total_reconstruido = round2(base_neta + ieps_monto + iva_monto)
    
    # Importe Bruto (P.Lista * Multiplicador * Cantidad)
    mult = get_tax_multiplier(iva_pct, ieps_pct)
    importe_bruto = round2(precio_lista * mult * cant)
    
    # Promociones
    promo_aplicada = line.get('promocion_aplicada') or []
    promo_monto = sum(float(p.get('descuento_aplicado', 0)) for p in promo_aplicada)
    
    # Verificación de integridad
    diff = abs(float(line.get('linea_total', 0)) - total_reconstruido)
    
    return {
        "linea_id": line['linea_id'],
        "folio": line['folio'],
        "diff": diff,
        "desglose": {
            "precio_lista_unitario": precio_lista,
            "importe_bruto": importe_bruto,
            "descuento_promocion_monto": promo_monto,
            "descuento_manual_monto": descuento_manual,
            "base_ieps": base_neta,
            "base_iva": round2(base_neta + ieps_monto),
            "ieps_monto": ieps_monto,
            "iva_monto": iva_monto,
            "total": total_reconstruido
        }
    }

def run_simulation():
    # Leeremos de stdin para evitar problemas de escape de shell con JSON masivos
    raw_data = sys.stdin.read()
    if not raw_data:
        print("No data received")
        return
        
    data = json.loads(raw_data)
    results = [simulate_line(l) for l in data]
    
    errors = [r for r in results if r['diff'] > 0.02]
    
    print(json.dumps({
        "total_lines": len(results),
        "total_errors": len(errors),
        "error_details": errors[:10]
    }))

if __name__ == "__main__":
    run_simulation()
