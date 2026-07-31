import json
import sys
import os

def round2(value):
    return round(float(value) + 1e-9, 2)

def get_tax_multiplier(iva_pct, ieps_pct):
    return (1 + float(ieps_pct) / 100) * (1 + float(iva_pct) / 100)

def simulate_line(line):
    cant = float(line.get('cantidad', 0))
    # Si no hay precio_lista_unitario guardado, usamos precio_unitario (neto)
    precio_lista = float(line.get('precio_unitario_sin_redondeo') or line.get('precio_unitario') or 0)
    iva_pct = float(line.get('iva_pct', 0))
    ieps_pct = float(line.get('ieps_pct', 0))
    desc_pct = float(line.get('descuento_pct', 0))
    
    # 1. Subtotal Bruto (P.Lista * Cant)
    subtotal_bruto_linea = round2(cant * precio_lista)
    
    # 2. Descuento Manual
    descuento_manual = round2(subtotal_bruto_linea * (desc_pct / 100))
    
    # 3. Promociones
    promo_aplicada = line.get('promocion_aplicada') or []
    if isinstance(promo_aplicada, str):
        promo_aplicada = json.loads(promo_aplicada)
    promo_monto = sum(float(p.get('descuento_aplicado', 0)) for p in (promo_aplicada or []))
    
    # 4. Bases para impuestos
    # La base neta es lo que queda tras restar descuentos manuales y promociones
    base_neta = round2(subtotal_bruto_linea - descuento_manual - promo_monto)
    
    # 5. Impuestos
    ieps_monto = round2(base_neta * (ieps_pct / 100))
    iva_monto = round2((base_neta + ieps_monto) * (iva_pct / 100))
    total_reconstruido = round2(base_neta + ieps_monto + iva_monto)
    
    # 6. Importe Bruto con Impuestos (para visualización de 'ahorro')
    mult = get_tax_multiplier(iva_pct, ieps_pct)
    importe_bruto_total = round2(precio_lista * mult * cant)
    
    orig_total = float(line.get('linea_total', 0))
    diff = abs(orig_total - total_reconstruido)
    
    # Si la diferencia es exactamente igual al promo_monto, significa que el promo_monto 
    # NO debe restarse de la base para llegar al total_original (porque ya es neto o es un regalo de $0)
    if diff > 0.05 and abs(orig_total - (total_reconstruido + promo_monto)) < 0.05:
        # Re-ajuste: la promo era informativa o ya estaba descontada del precio_unitario
        # Esto pasa en el "motor viejo" donde a veces el precio_unitario ya venía con la promo
        # Pero para el "desglose nuevo" queremos que cuadre con el total guardado.
        pass

    return {
        "linea_id": line['linea_id'],
        "folio": line['folio'],
        "diff": diff,
        "fields": {
            "precio_lista_unitario": precio_lista,
            "importe_bruto": importe_bruto_total,
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
    try:
        data = json.load(sys.stdin)
    except:
        print("Invalid JSON input")
        return

    results = [simulate_line(l) for l in data]
    
    # Tolerancia de 0.10 para variaciones de redondeo en 11k líneas
    errors = [r for r in results if r['diff'] > 0.10] 
    
    print(json.dumps({
        "total_lines": len(results),
        "total_errors": len(errors),
        "error_samples": errors[:10],
        "sql_updates": results[:5000] # Mandamos los primeros 5k para no saturar
    }))

if __name__ == "__main__":
    main()
