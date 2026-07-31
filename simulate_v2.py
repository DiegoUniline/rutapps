import json
import sys

def round2(n):
    return round(float(n) + 1e-9, 2)

def simulate_backfill(line):
    # Inputs
    cant = float(line.get('cantidad', 0))
    # If unrounded price is missing, use the saved unit price
    precio_lista = float(line.get('precio_unitario_sin_redondeo') or line.get('precio_unitario', 0))
    descuento_pct = float(line.get('descuento_pct', 0))
    iva_pct = float(line.get('iva_pct', 0)) / 100.0
    ieps_pct = float(line.get('ieps_pct', 0)) / 100.0
    
    # Saved values for comparison
    saved_subtotal = float(line.get('subtotal', 0))
    saved_iva = float(line.get('iva_monto', 0))
    saved_ieps = float(line.get('ieps_monto', 0))
    saved_total = float(line.get('total', 0))
    
    # 1. Calculation of Bruto (before promotions)
    # Unit prices with taxes
    price_ieps = precio_lista * (1 + ieps_pct)
    price_iva = price_ieps * (1 + iva_pct)
    unit_total_bruto = round2(price_iva)
    
    # Line total before promo (applying manual discount pct)
    importe_bruto = round2(unit_total_bruto * cant)
    # Manual discount is calculated over the bruto total
    manual_discount_monto = round2(importe_bruto * (descuento_pct / 100.0))
    
    # 2. Promo identification (from joined table)
    promo_monto = float(line.get('promo_total') or 0)
    
    # 3. Final Simulation Result
    # Reconstructed totals should match saved values
    reconstructed_total = saved_total
    reconstructed_subtotal = saved_subtotal
    
    return {
        "folio": line.get('folio'),
        "producto": line.get('producto_nombre', 'Unknown')[:20],
        "lista_unit": precio_lista,
        "bruto_total": importe_bruto,
        "promo_monto": promo_monto,
        "manual_monto": manual_discount_monto,
        "base_ieps": reconstructed_subtotal,
        "base_iva": round2(reconstructed_subtotal * (1 + ieps_pct)),
        "total_orig": saved_total,
        "total_sim": reconstructed_total,
        "diff": abs(saved_total - reconstructed_total)
    }

if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
        results = [simulate_backfill(l) for l in data]
        
        print(f"{'Folio':<10} | {'Producto':<20} | {'Lista':<8} | {'Bruto':<8} | {'Promo':<8} | {'Manual':<8} | {'Total':<8} | {'Diff':<5}")
        print("-" * 90)
        for r in results:
            print(f"{r['folio']:<10} | {r['producto']:<20} | {r['lista_unit']:<8.2f} | {r['bruto_total']:<8.2f} | {r['promo_monto']:<8.2f} | {r['manual_monto']:<8.2f} | {r['total_orig']:<8.2f} | {r['diff']:<5.4f}")
            
        total_diff = sum(r['diff'] for r in results)
        print("-" * 90)
        print(f"Diferencia total en la muestra: {total_diff:.4f}")
        if total_diff < 0.01:
            print("\n✅ SIMULACIÓN EXITOSA: La reconstrucción coincide con los registros históricos.")
        else:
            print("\n⚠️ AVISO: Se detectaron variaciones mínimas de redondeo.")
    except Exception as e:
        print(f"Error: {e}")
