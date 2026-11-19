DO $$
DECLARE
    r RECORD;
    v_importe_bruto NUMERIC;
    v_precio_lista NUMERIC;
    v_desc_manual NUMERIC;
BEGIN
    FOR r IN 
        SELECT 
            vl.id, 
            vl.cantidad, 
            COALESCE(vl.precio_unitario_sin_redondeo, vl.precio_unitario) as precio_lista_base,
            vl.total,
            vl.subtotal,
            vl.ieps_monto,
            vl.iva_monto
        FROM public.venta_lineas vl
        JOIN public.ventas v ON v.id = vl.venta_id
        WHERE v.empresa_id = '41cdb6df-40c0-4a95-89de-a54bf8eba0de' -- Distribuidora Tampico
          AND vl.importe_bruto IS NULL
          AND vl.total > 0
    LOOP
        v_precio_lista := ROUND(r.precio_lista_base, 2);
        v_importe_bruto := ROUND(v_precio_lista * r.cantidad, 2);
        v_desc_manual := GREATEST(0, ROUND(v_importe_bruto - r.total, 2));

        UPDATE public.venta_lineas
        SET 
            precio_lista_unitario = v_precio_lista,
            importe_bruto = v_importe_bruto,
            descuento_promocion_monto = 0,
            base_descuento_manual = v_importe_bruto,
            descuento_manual_monto = v_desc_manual,
            descuento_total_monto = v_desc_manual,
            base_ieps = ROUND(r.subtotal, 2),
            base_iva = ROUND(r.subtotal + r.ieps_monto, 2),
            impuestos_totales = ROUND(r.ieps_monto + r.iva_monto, 2),
            objeto_impuesto = CASE WHEN (r.iva_monto > 0 OR r.ieps_monto > 0) THEN '02' ELSE '01' END
        WHERE id = r.id;
    END LOOP;
END $$;