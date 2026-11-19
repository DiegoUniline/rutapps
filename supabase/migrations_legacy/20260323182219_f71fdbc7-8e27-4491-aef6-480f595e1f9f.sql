
-- Tables with direct empresa_id column
DROP POLICY IF EXISTS "Tenant isolation" ON public.ajustes_inventario;
CREATE POLICY "Tenant isolation" ON public.ajustes_inventario FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.almacenes;
CREATE POLICY "Tenant isolation" ON public.almacenes FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.auditorias;
CREATE POLICY "Tenant isolation" ON public.auditorias FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cancellation_requests;
CREATE POLICY "Tenant isolation" ON public.cancellation_requests FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cargas;
CREATE POLICY "Tenant isolation" ON public.cargas FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cfdis;
CREATE POLICY "Tenant isolation" ON public.cfdis FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.clasificaciones;
CREATE POLICY "Tenant isolation" ON public.clasificaciones FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cobradores;
CREATE POLICY "Tenant isolation" ON public.cobradores FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.compras;
CREATE POLICY "Tenant isolation" ON public.compras FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.descarga_ruta;
CREATE POLICY "Tenant isolation" ON public.descarga_ruta FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.devoluciones;
CREATE POLICY "Tenant isolation" ON public.devoluciones FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.entregas;
CREATE POLICY "Tenant isolation" ON public.entregas FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.gastos;
CREATE POLICY "Tenant isolation" ON public.gastos FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.lista_precios;
CREATE POLICY "Tenant isolation" ON public.lista_precios FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.listas;
CREATE POLICY "Tenant isolation" ON public.listas FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.marcas;
CREATE POLICY "Tenant isolation" ON public.marcas FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.movimientos_inventario;
CREATE POLICY "Tenant isolation" ON public.movimientos_inventario FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.optimizacion_rutas_log;
CREATE POLICY "Tenant isolation" ON public.optimizacion_rutas_log FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.pago_comisiones;
CREATE POLICY "Tenant isolation" ON public.pago_comisiones FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.pago_compras;
CREATE POLICY "Tenant isolation" ON public.pago_compras FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.producto_lotes;
CREATE POLICY "Tenant isolation" ON public.producto_lotes FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.promociones;
CREATE POLICY "Tenant isolation" ON public.promociones FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.proveedores;
CREATE POLICY "Tenant isolation" ON public.proveedores FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.roles;
CREATE POLICY "Tenant isolation" ON public.roles FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.stock_camion;
CREATE POLICY "Tenant isolation" ON public.stock_camion FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.tarifas;
CREATE POLICY "Tenant isolation" ON public.tarifas FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.tasas_ieps;
CREATE POLICY "Tenant isolation" ON public.tasas_ieps FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.tasas_iva;
CREATE POLICY "Tenant isolation" ON public.tasas_iva FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.traspasos;
CREATE POLICY "Tenant isolation" ON public.traspasos FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.unidades;
CREATE POLICY "Tenant isolation" ON public.unidades FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.vendedores;
CREATE POLICY "Tenant isolation" ON public.vendedores FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.visitas;
CREATE POLICY "Tenant isolation" ON public.visitas FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.whatsapp_config;
CREATE POLICY "Tenant isolation" ON public.whatsapp_config FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.whatsapp_log;
CREATE POLICY "Tenant isolation" ON public.whatsapp_log FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.whatsapp_templates;
CREATE POLICY "Tenant isolation" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.zonas;
CREATE POLICY "Tenant isolation" ON public.zonas FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

-- Child tables (no empresa_id, use EXISTS) - add super_admin bypass
DROP POLICY IF EXISTS "Tenant isolation" ON public.auditoria_entradas;
CREATE POLICY "Tenant isolation" ON public.auditoria_entradas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM auditoria_lineas al JOIN auditorias a ON a.id = al.auditoria_id WHERE al.id = auditoria_entradas.auditoria_linea_id AND a.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM auditoria_lineas al JOIN auditorias a ON a.id = al.auditoria_id WHERE al.id = auditoria_entradas.auditoria_linea_id AND a.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.auditoria_escaneos;
CREATE POLICY "Tenant isolation" ON public.auditoria_escaneos FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM auditorias a WHERE a.id = auditoria_escaneos.auditoria_id AND a.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM auditorias a WHERE a.id = auditoria_escaneos.auditoria_id AND a.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.auditoria_lineas;
CREATE POLICY "Tenant isolation" ON public.auditoria_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM auditorias a WHERE a.id = auditoria_lineas.auditoria_id AND a.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM auditorias a WHERE a.id = auditoria_lineas.auditoria_id AND a.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.carga_lineas;
CREATE POLICY "Tenant isolation" ON public.carga_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cargas c WHERE c.id = carga_lineas.carga_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cargas c WHERE c.id = carga_lineas.carga_id AND c.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.carga_pedidos;
CREATE POLICY "Tenant isolation" ON public.carga_pedidos FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cargas c WHERE c.id = carga_pedidos.carga_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cargas c WHERE c.id = carga_pedidos.carga_id AND c.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cfdi_lineas;
CREATE POLICY "Tenant isolation" ON public.cfdi_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cfdis c WHERE c.id = cfdi_lineas.cfdi_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cfdis c WHERE c.id = cfdi_lineas.cfdi_id AND c.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cliente_pedido_sugerido;
CREATE POLICY "Tenant isolation" ON public.cliente_pedido_sugerido FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM clientes c WHERE c.id = cliente_pedido_sugerido.cliente_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM clientes c WHERE c.id = cliente_pedido_sugerido.cliente_id AND c.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.cobro_aplicaciones;
CREATE POLICY "Tenant isolation" ON public.cobro_aplicaciones FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cobros c WHERE c.id = cobro_aplicaciones.cobro_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM cobros c WHERE c.id = cobro_aplicaciones.cobro_id AND c.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.compra_lineas;
CREATE POLICY "Tenant isolation" ON public.compra_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_lineas.compra_id AND c.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_lineas.compra_id AND c.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.descarga_ruta_lineas;
CREATE POLICY "Tenant isolation" ON public.descarga_ruta_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM descarga_ruta d WHERE d.id = descarga_ruta_lineas.descarga_id AND d.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM descarga_ruta d WHERE d.id = descarga_ruta_lineas.descarga_id AND d.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.devolucion_lineas;
CREATE POLICY "Tenant isolation" ON public.devolucion_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM devoluciones d WHERE d.id = devolucion_lineas.devolucion_id AND d.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM devoluciones d WHERE d.id = devolucion_lineas.devolucion_id AND d.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.entrega_lineas;
CREATE POLICY "Tenant isolation" ON public.entrega_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM entregas e WHERE e.id = entrega_lineas.entrega_id AND e.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM entregas e WHERE e.id = entrega_lineas.entrega_id AND e.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.lista_precios_lineas;
CREATE POLICY "Tenant isolation" ON public.lista_precios_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM lista_precios lp WHERE lp.id = lista_precios_lineas.lista_precio_id AND lp.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM lista_precios lp WHERE lp.id = lista_precios_lineas.lista_precio_id AND lp.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.producto_proveedores;
CREATE POLICY "Tenant isolation" ON public.producto_proveedores FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM productos p WHERE p.id = producto_proveedores.producto_id AND p.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM productos p WHERE p.id = producto_proveedores.producto_id AND p.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.producto_tarifas;
CREATE POLICY "Tenant isolation" ON public.producto_tarifas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM productos p WHERE p.id = producto_tarifas.producto_id AND p.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM productos p WHERE p.id = producto_tarifas.producto_id AND p.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.promocion_aplicada;
CREATE POLICY "Tenant isolation" ON public.promocion_aplicada FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM ventas v WHERE v.id = promocion_aplicada.venta_id AND v.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM ventas v WHERE v.id = promocion_aplicada.venta_id AND v.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.role_permisos;
CREATE POLICY "Tenant isolation" ON public.role_permisos FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM roles r WHERE r.id = role_permisos.role_id AND r.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM roles r WHERE r.id = role_permisos.role_id AND r.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.tarifa_lineas;
CREATE POLICY "Tenant isolation" ON public.tarifa_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM tarifas t WHERE t.id = tarifa_lineas.tarifa_id AND t.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM tarifas t WHERE t.id = tarifa_lineas.tarifa_id AND t.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.traspaso_lineas;
CREATE POLICY "Tenant isolation" ON public.traspaso_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM traspasos t WHERE t.id = traspaso_lineas.traspaso_id AND t.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM traspasos t WHERE t.id = traspaso_lineas.traspaso_id AND t.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.user_roles;
CREATE POLICY "Tenant isolation" ON public.user_roles FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM roles r WHERE r.id = user_roles.role_id AND r.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM roles r WHERE r.id = user_roles.role_id AND r.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.venta_comisiones;
CREATE POLICY "Tenant isolation" ON public.venta_comisiones FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM ventas v WHERE v.id = venta_comisiones.venta_id AND v.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM ventas v WHERE v.id = venta_comisiones.venta_id AND v.empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "Tenant isolation" ON public.venta_lineas;
CREATE POLICY "Tenant isolation" ON public.venta_lineas FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM ventas v WHERE v.id = venta_lineas.venta_id AND v.empresa_id = get_my_empresa_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM ventas v WHERE v.id = venta_lineas.venta_id AND v.empresa_id = get_my_empresa_id()));
