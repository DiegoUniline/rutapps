-- RutApp · REVERSA de 20261020150000_rls_initplan.sql (solo si hiciera falta)
-- Restaura el texto original de las 281 políticas, tomado de la vista previa de producción del 2026-10-19.
-- Todo o nada. Requiere CONFIRMO del dueño.
BEGIN;
ALTER POLICY "admin_trial_crm_activities_super_admin" ON public."admin_trial_crm_activities" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "admin_trial_crm_deletions_super_admin" ON public."admin_trial_crm_deletions" USING (is_super_admin(auth.uid()));
ALTER POLICY "admin_trial_crm_leads_super_admin" ON public."admin_trial_crm_leads" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Active app users only" ON public."ajustes_inventario" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."ajustes_inventario" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."almacenes" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."almacenes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."auditoria_entradas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."auditoria_entradas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM (auditoria_lineas al
     JOIN auditorias a ON ((a.id = al.auditoria_id)))
  WHERE ((al.id = auditoria_entradas.auditoria_linea_id) AND (a.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM (auditoria_lineas al
     JOIN auditorias a ON ((a.id = al.auditoria_id)))
  WHERE ((al.id = auditoria_entradas.auditoria_linea_id) AND (a.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."auditoria_escaneos" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant insert scans" ON public."auditoria_escaneos" WITH CHECK ((EXISTS ( SELECT 1
   FROM auditorias a
  WHERE ((a.id = auditoria_escaneos.auditoria_id) AND (a.empresa_id = get_my_empresa_id()) AND (a.status = ANY (ARRAY['pendiente'::status_auditoria, 'en_proceso'::status_auditoria]))))));
ALTER POLICY "Tenant isolation" ON public."auditoria_escaneos" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM auditorias a
  WHERE ((a.id = auditoria_escaneos.auditoria_id) AND (a.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM auditorias a
  WHERE ((a.id = auditoria_escaneos.auditoria_id) AND (a.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."auditoria_lineas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."auditoria_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM auditorias a
  WHERE ((a.id = auditoria_lineas.auditoria_id) AND (a.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM auditorias a
  WHERE ((a.id = auditoria_lineas.auditoria_id) AND (a.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Tenant read auditoria_lineas" ON public."auditoria_lineas" USING ((EXISTS ( SELECT 1
   FROM auditorias a
  WHERE ((a.id = auditoria_lineas.auditoria_id) AND ((a.empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))))));
ALTER POLICY "Active app users only" ON public."auditorias" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."auditorias" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant read auditorias" ON public."auditorias" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins manage billing templates" ON public."billing_message_templates" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins manage billing_notifications" ON public."billing_notifications" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Only super admins can delete broadcasts" ON public."broadcast_messages" USING ((EXISTS ( SELECT 1
   FROM super_admins
  WHERE (super_admins.user_id = auth.uid()))));
ALTER POLICY "Only super admins can insert broadcasts" ON public."broadcast_messages" WITH CHECK ((EXISTS ( SELECT 1
   FROM super_admins
  WHERE (super_admins.user_id = auth.uid()))));
ALTER POLICY "Users manage own reads" ON public."broadcast_reads" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
ALTER POLICY "caja_mov_delete_empresa" ON public."caja_movimientos" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "caja_mov_insert_empresa" ON public."caja_movimientos" WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "caja_mov_select_empresa" ON public."caja_movimientos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "caja_mov_update_empresa" ON public."caja_movimientos" USING ((empresa_id = get_my_empresa_id())) WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "caja_turnos_delete_empresa" ON public."caja_turnos" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "caja_turnos_insert_empresa" ON public."caja_turnos" WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "caja_turnos_select_empresa" ON public."caja_turnos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "caja_turnos_update_empresa" ON public."caja_turnos" USING ((empresa_id = get_my_empresa_id())) WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Super admins view all" ON public."cancellation_requests" USING (is_super_admin(auth.uid()));
ALTER POLICY "Tenant isolation" ON public."cancellation_requests" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."carga_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cargas c
  WHERE ((c.id = carga_lineas.carga_id) AND (c.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cargas c
  WHERE ((c.id = carga_lineas.carga_id) AND (c.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Tenant isolation" ON public."carga_pedidos" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cargas c
  WHERE ((c.id = carga_pedidos.carga_id) AND (c.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cargas c
  WHERE ((c.id = carga_pedidos.carga_id) AND (c.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."cargas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cargas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cfdi_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cfdis c
  WHERE ((c.id = cfdi_lineas.cfdi_id) AND (c.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cfdis c
  WHERE ((c.id = cfdi_lineas.cfdi_id) AND (c.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Tenant isolation" ON public."cfdi_pago_documentos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cfdi_pagos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cfdis" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."clasificaciones" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "cliente_orden_ruta_tenant_isolation" ON public."cliente_orden_ruta" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cliente_pedido_sugerido" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = cliente_pedido_sugerido.cliente_id) AND (c.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = cliente_pedido_sugerido.cliente_id) AND (c.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."clientes" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."clientes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cobradores" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."cobro_aplicaciones" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cobro_aplicaciones" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = cobro_aplicaciones.cobro_id) AND (c.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = cobro_aplicaciones.cobro_id) AND (c.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Super admin can manage cobro_reintentos" ON public."cobro_reintentos" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Active app users only" ON public."cobros" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cobros" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "esquemas_modify_empresa" ON public."comision_esquemas" USING ((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
ALTER POLICY "esquemas_select_empresa" ON public."comision_esquemas" USING ((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
ALTER POLICY "commission_audit_super_admin_select" ON public."commission_audit_log" USING (is_super_admin(auth.uid()));
ALTER POLICY "commission_client_attributions_super_admin_select" ON public."commission_client_attributions" USING (is_super_admin(auth.uid()));
ALTER POLICY "commission_people_super_admin_all" ON public."commission_people" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Tenant isolation" ON public."compra_linea_lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."compra_lineas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."compra_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM compras c
  WHERE ((c.id = compra_lineas.compra_id) AND (c.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM compras c
  WHERE ((c.id = compra_lineas.compra_id) AND (c.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."compras" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."compras" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "consumo_datos_insert_propio" ON public."consumo_datos" WITH CHECK (((user_id = auth.uid()) AND ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))));
ALTER POLICY "consumo_datos_select_empresa" ON public."consumo_datos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "consumo_datos_update_propio" ON public."consumo_datos" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
ALTER POLICY "conteo_entradas_empresa" ON public."conteo_entradas" USING ((conteo_linea_id IN ( SELECT cl.id
   FROM (conteo_lineas cl
     JOIN conteos_fisicos cf ON ((cf.id = cl.conteo_id)))
  WHERE (cf.empresa_id = get_my_empresa_id())))) WITH CHECK ((conteo_linea_id IN ( SELECT cl.id
   FROM (conteo_lineas cl
     JOIN conteos_fisicos cf ON ((cf.id = cl.conteo_id)))
  WHERE (cf.empresa_id = get_my_empresa_id()))));
ALTER POLICY "conteo_lineas_empresa" ON public."conteo_lineas" USING ((conteo_id IN ( SELECT conteos_fisicos.id
   FROM conteos_fisicos
  WHERE (conteos_fisicos.empresa_id = get_my_empresa_id())))) WITH CHECK ((conteo_id IN ( SELECT conteos_fisicos.id
   FROM conteos_fisicos
  WHERE (conteos_fisicos.empresa_id = get_my_empresa_id()))));
ALTER POLICY "conteos_empresa" ON public."conteos_fisicos" USING ((empresa_id = get_my_empresa_id())) WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Tenant isolation lineas" ON public."cotizacion_lineas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."cotizaciones" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "cupon_usos_insert_empresa" ON public."cupon_usos" WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "cupon_usos_select_empresa" ON public."cupon_usos" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "cupon_usos_super_admin" ON public."cupon_usos" USING (is_super_admin(auth.uid()));
ALTER POLICY "Partner ve sus cupones" ON public."cupones" USING (((partner_id = get_my_partner_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "cupones_delete_super_admin" ON public."cupones" USING (is_super_admin(auth.uid()));
ALTER POLICY "cupones_insert_super_admin" ON public."cupones" WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "cupones_update_super_admin" ON public."cupones" USING (is_super_admin(auth.uid()));
ALTER POLICY "Users delete own AI reco" ON public."dashboard_ai_recomendaciones" USING ((user_id = auth.uid()));
ALTER POLICY "Users insert own AI reco" ON public."dashboard_ai_recomendaciones" WITH CHECK (((user_id = auth.uid()) AND (empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "Users view own empresa AI reco" ON public."dashboard_ai_recomendaciones" USING ((empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
ALTER POLICY "Active app users only" ON public."descarga_ruta" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."descarga_ruta" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."descarga_ruta_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM descarga_ruta d
  WHERE ((d.id = descarga_ruta_lineas.descarga_id) AND (d.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM descarga_ruta d
  WHERE ((d.id = descarga_ruta_lineas.descarga_id) AND (d.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Tenant isolation" ON public."devolucion_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM devoluciones d
  WHERE ((d.id = devolucion_lineas.devolucion_id) AND (d.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM devoluciones d
  WHERE ((d.id = devolucion_lineas.devolucion_id) AND (d.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Tenant devol motivo config" ON public."devolucion_motivo_config" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."devoluciones" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."devoluciones" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "distancia_cache empresa access" ON public."distancia_cache" USING ((empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
ALTER POLICY "empresa_addons insert by empresa or admin" ON public."empresa_addons" WITH CHECK ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "empresa_addons read by own empresa" ON public."empresa_addons" USING ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "empresa_addons update super admin only" ON public."empresa_addons" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Partners can view referred empresas" ON public."empresas" USING ((EXISTS ( SELECT 1
   FROM (partner_atribuciones pa
     JOIN partners p ON ((p.id = pa.partner_id)))
  WHERE ((pa.empresa_id = empresas.id) AND (p.user_id = auth.uid())))));
ALTER POLICY "Super admins can insert empresas" ON public."empresas" WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins can update all empresas" ON public."empresas" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins can view all empresas" ON public."empresas" USING (is_super_admin(auth.uid()));
ALTER POLICY "Users can update their empresa" ON public."empresas" USING ((id = get_my_empresa_id())) WITH CHECK ((id = get_my_empresa_id()));
ALTER POLICY "Users can view their empresa" ON public."empresas" USING ((id = get_my_empresa_id()));
ALTER POLICY "Active app users only" ON public."entrega_lineas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."entrega_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM entregas e
  WHERE ((e.id = entrega_lineas.entrega_id) AND (e.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM entregas e
  WHERE ((e.id = entrega_lineas.entrega_id) AND (e.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."entregas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."entregas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Only Diego can delete invoices" ON public."facturas" USING (is_diego_super_admin(auth.uid()));
ALTER POLICY "Only Diego can insert invoices" ON public."facturas" WITH CHECK (is_diego_super_admin(auth.uid()));
ALTER POLICY "Only Diego can update invoices" ON public."facturas" USING (is_diego_super_admin(auth.uid())) WITH CHECK (is_diego_super_admin(auth.uid()));
ALTER POLICY "Users can read own company invoices or Diego can read all" ON public."facturas" USING (((empresa_id = get_my_empresa_id()) OR is_diego_super_admin(auth.uid())));
ALTER POLICY "feature_flags_admin_all" ON public."feature_flags" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Active app users only" ON public."gastos" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."gastos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant manage import_job_lineas" ON public."import_job_lineas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant manage import_jobs" ON public."import_jobs" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "internal_commission_entries_admin_all" ON public."internal_commission_entries" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "internal_commission_entries_self_read" ON public."internal_commission_entries" USING ((EXISTS ( SELECT 1
   FROM platform_team_members tm
  WHERE ((tm.person_id = internal_commission_entries.person_id) AND (tm.user_id = auth.uid()) AND (tm.status = ANY (ARRAY['invited'::text, 'active'::text]))))));
ALTER POLICY "internal_commission_payouts_admin_all" ON public."internal_commission_payouts" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "internal_commission_payouts_self_read" ON public."internal_commission_payouts" USING ((EXISTS ( SELECT 1
   FROM platform_team_members tm
  WHERE ((tm.person_id = internal_commission_payouts.person_id) AND (tm.user_id = auth.uid()) AND (tm.status = ANY (ARRAY['invited'::text, 'active'::text]))))));
ALTER POLICY "manage_own_reads" ON public."internal_notification_reads" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
ALTER POLICY "delete_same_empresa" ON public."internal_notifications" USING ((empresa_id = ( SELECT COALESCE(p.super_admin_override_empresa_id, p.empresa_id) AS "coalesce"
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
ALTER POLICY "select_same_empresa" ON public."internal_notifications" USING ((empresa_id = ( SELECT COALESCE(p.super_admin_override_empresa_id, p.empresa_id) AS "coalesce"
   FROM profiles p
  WHERE (p.user_id = auth.uid())
 LIMIT 1)));
ALTER POLICY "Active app users only" ON public."lista_precios" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."lista_precios" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."lista_precios_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM lista_precios lp
  WHERE ((lp.id = lista_precios_lineas.lista_precio_id) AND (lp.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM lista_precios lp
  WHERE ((lp.id = lista_precios_lineas.lista_precio_id) AND (lp.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."listas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."listas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "lotes_delete" ON public."lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "lotes_insert" ON public."lotes" WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "lotes_select" ON public."lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "lotes_update" ON public."lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins can insert maintenance log" ON public."maintenance_log" WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins can view maintenance log" ON public."maintenance_log" USING (is_super_admin(auth.uid()));
ALTER POLICY "Tenant isolation" ON public."marcas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "merma_linea_lotes empresa" ON public."merma_linea_lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation merma_lineas" ON public."merma_lineas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation merma_motivos" ON public."merma_motivos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation mermas" ON public."mermas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "metas_venta tenant access" ON public."metas_venta" USING (((empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."movimientos_inventario" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."movimientos_inventario" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Users manage own views" ON public."notification_views" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
ALTER POLICY "Super admins manage all notifications" ON public."notifications" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Users read own tenant notifications" ON public."notifications" USING (((empresa_id = get_my_empresa_id()) OR (empresa_id IS NULL)));
ALTER POLICY "Admins ven recargas de su empresa" ON public."optimizacion_recargas" USING ((empresa_id IN ( SELECT p.empresa_id
   FROM profiles p
  WHERE (p.user_id = auth.uid()))));
ALTER POLICY "Tenant isolation" ON public."optimizacion_rutas_log" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins can read otp_codes" ON public."otp_codes" USING (is_super_admin(auth.uid()));
ALTER POLICY "Tenant isolation" ON public."pago_comisiones" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."pago_compras" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Partner ve sus atribuciones" ON public."partner_atribuciones" USING (((partner_id = get_my_partner_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admin gestiona atribuciones" ON public."partner_atribuciones" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Partner ve sus comisiones" ON public."partner_comisiones" USING (((partner_id = get_my_partner_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admin gestiona comisiones" ON public."partner_comisiones" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Solo super admin gestiona niveles" ON public."partner_niveles" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Partner ve sus pagos" ON public."partner_pagos" USING (((partner_id = get_my_partner_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admin gestiona pagos" ON public."partner_pagos" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "super_admin_delete_solicitudes" ON public."partner_solicitudes" USING ((EXISTS ( SELECT 1
   FROM super_admins sa
  WHERE (sa.user_id = auth.uid()))));
ALTER POLICY "super_admin_select_solicitudes" ON public."partner_solicitudes" USING ((EXISTS ( SELECT 1
   FROM super_admins sa
  WHERE (sa.user_id = auth.uid()))));
ALTER POLICY "super_admin_update_solicitudes" ON public."partner_solicitudes" USING ((EXISTS ( SELECT 1
   FROM super_admins sa
  WHERE (sa.user_id = auth.uid()))));
ALTER POLICY "Partner ve sus datos" ON public."partners" USING (((user_id = auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admin gestiona partners" ON public."partners" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins manage payment_links" ON public."payment_links" USING (is_super_admin(auth.uid()));
ALTER POLICY "platform_team_member_audit_admin_read" ON public."platform_team_member_audit_log" USING (is_super_admin(auth.uid()));
ALTER POLICY "platform_team_members_admin_all" ON public."platform_team_members" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "platform_team_members_self_read" ON public."platform_team_members" USING ((user_id = auth.uid()));
ALTER POLICY "Tenant isolation" ON public."producto_almacen_config" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant manage producto_equivalencias" ON public."producto_equivalencias" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation presentaciones" ON public."producto_presentaciones" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."producto_proveedores" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM productos p
  WHERE ((p.id = producto_proveedores.producto_id) AND (p.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM productos p
  WHERE ((p.id = producto_proveedores.producto_id) AND (p.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."productos" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."productos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins can view all profiles" ON public."profiles" USING (is_super_admin(auth.uid()));
ALTER POLICY "Users can insert own profile" ON public."profiles" WITH CHECK ((user_id = auth.uid()));
ALTER POLICY "Users can update empresa profiles" ON public."profiles" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Users can update own profile" ON public."profiles" USING ((user_id = auth.uid()));
ALTER POLICY "Users can view empresa profiles" ON public."profiles" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Users can view own profile" ON public."profiles" USING ((user_id = auth.uid()));
ALTER POLICY "Tenant isolation" ON public."promocion_aplicada" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = promocion_aplicada.venta_id) AND (v.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = promocion_aplicada.venta_id) AND (v.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."promociones" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."promociones" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."proveedores" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."proveedores" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins can manage ads" ON public."publicidad_anuncios" USING ((EXISTS ( SELECT 1
   FROM super_admins
  WHERE (super_admins.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM super_admins
  WHERE (super_admins.user_id = auth.uid()))));
ALTER POLICY "Super admins see all views" ON public."publicidad_vistas" USING ((EXISTS ( SELECT 1
   FROM super_admins
  WHERE (super_admins.user_id = auth.uid()))));
ALTER POLICY "Users insert their own views" ON public."publicidad_vistas" WITH CHECK ((user_id = auth.uid()));
ALTER POLICY "Users see their own views" ON public."publicidad_vistas" USING ((user_id = auth.uid()));
ALTER POLICY "Empresa members manage reportes_personalizados" ON public."reportes_personalizados" USING ((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
ALTER POLICY "Tenant isolation" ON public."role_permisos" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM roles r
  WHERE ((r.id = role_permisos.role_id) AND (r.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM roles r
  WHERE ((r.id = role_permisos.role_id) AND (r.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Tenant isolation" ON public."roles" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "polyline_cache empresa access" ON public."ruta_polyline_cache" USING ((empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))) WITH CHECK ((empresa_id = ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
ALTER POLICY "Active app users only" ON public."ruta_sesiones" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "ruta_sesiones_delete_empresa" ON public."ruta_sesiones" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "ruta_sesiones_insert_empresa" ON public."ruta_sesiones" WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "ruta_sesiones_select_empresa" ON public."ruta_sesiones" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "ruta_sesiones_update_empresa" ON public."ruta_sesiones" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "solicitud_compra_eventos_empresa_all" ON public."solicitud_compra_eventos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "solicitud_compra_lineas_empresa_all" ON public."solicitud_compra_lineas" USING ((EXISTS ( SELECT 1
   FROM solicitudes_compra s
  WHERE ((s.id = solicitud_compra_lineas.solicitud_id) AND ((s.empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM solicitudes_compra s
  WHERE ((s.id = solicitud_compra_lineas.solicitud_id) AND ((s.empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))))));
ALTER POLICY "Tenant insert" ON public."solicitud_traspaso_historial" WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant read" ON public."solicitud_traspaso_historial" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation via padre" ON public."solicitud_traspaso_lineas" USING ((EXISTS ( SELECT 1
   FROM solicitudes_traspaso s
  WHERE ((s.id = solicitud_traspaso_lineas.solicitud_id) AND ((s.empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM solicitudes_traspaso s
  WHERE ((s.id = solicitud_traspaso_lineas.solicitud_id) AND ((s.empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))))));
ALTER POLICY "Tenant isolation" ON public."solicitud_traspaso_surtidos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "solicitudes_compra_empresa_all" ON public."solicitudes_compra" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins full access solicitudes" ON public."solicitudes_pago" USING (is_super_admin(auth.uid()));
ALTER POLICY "Users can create solicitudes" ON public."solicitudes_pago" WITH CHECK (((empresa_id = get_my_empresa_id()) AND (user_id = auth.uid())));
ALTER POLICY "Users can view own empresa solicitudes" ON public."solicitudes_pago" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Tenant isolation" ON public."solicitudes_traspaso" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."stock_almacen" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."stock_almacen" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_apartado_delete" ON public."stock_apartado" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_apartado_insert" ON public."stock_apartado" WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_apartado_select" ON public."stock_apartado" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_apartado_update" ON public."stock_apartado" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."stock_camion" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_lotes_delete" ON public."stock_lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_lotes_insert" ON public."stock_lotes" WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_lotes_select" ON public."stock_lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "stock_lotes_update" ON public."stock_lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins manage plans" ON public."subscription_plans" USING ((EXISTS ( SELECT 1
   FROM super_admins sa
  WHERE (sa.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM super_admins sa
  WHERE (sa.user_id = auth.uid()))));
ALTER POLICY "Empresa can read own subscription" ON public."subscriptions" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Super admins manage subscriptions" ON public."subscriptions" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins full access on super_admins" ON public."super_admins" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Tenant isolation" ON public."tarifa_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM tarifas t
  WHERE ((t.id = tarifa_lineas.tarifa_id) AND (t.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM tarifas t
  WHERE ((t.id = tarifa_lineas.tarifa_id) AND (t.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."tarifas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."tarifas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."tasas_ieps" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "tasas_isr_ret_read" ON public."tasas_isr_ret" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "tasas_isr_ret_write" ON public."tasas_isr_ret" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Tenant isolation" ON public."tasas_iva" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "tasas_iva_ret_read" ON public."tasas_iva_ret" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "tasas_iva_ret_write" ON public."tasas_iva_ret" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Empresa admin ve tienda clientes" ON public."tienda_clientes" USING ((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
ALTER POLICY "Empresa admin manage tienda config" ON public."tienda_config" USING (((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins manage all movimientos" ON public."timbres_movimientos" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Users can view their empresa movimientos" ON public."timbres_movimientos" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Super admins manage all saldos" ON public."timbres_saldo" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Users can view their empresa saldo" ON public."timbres_saldo" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "traspaso_linea_lotes_tenant" ON public."traspaso_linea_lotes" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."traspaso_lineas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."traspaso_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM traspasos t
  WHERE ((t.id = traspaso_lineas.traspaso_id) AND (t.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM traspasos t
  WHERE ((t.id = traspaso_lineas.traspaso_id) AND (t.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."traspasos" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."traspasos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Super admins can manage blacklist" ON public."trial_blacklist" USING (is_super_admin(auth.uid()));
ALTER POLICY "Only owner can delete tutorial videos" ON public."tutorial_videos" USING (((auth.uid() = '387501a7-d172-4310-9e83-1a7f9fc37cac'::uuid) OR is_super_admin(auth.uid())));
ALTER POLICY "Only owner can insert tutorial videos" ON public."tutorial_videos" WITH CHECK (((auth.uid() = '387501a7-d172-4310-9e83-1a7f9fc37cac'::uuid) OR is_super_admin(auth.uid())));
ALTER POLICY "Only owner can update tutorial videos" ON public."tutorial_videos" USING (((auth.uid() = '387501a7-d172-4310-9e83-1a7f9fc37cac'::uuid) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."unidades" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Users delete own favorites" ON public."user_favorites" USING ((auth.uid() = user_id));
ALTER POLICY "Users insert own favorites" ON public."user_favorites" WITH CHECK ((auth.uid() = user_id));
ALTER POLICY "Users update own favorites" ON public."user_favorites" USING ((auth.uid() = user_id));
ALTER POLICY "Users view own favorites" ON public."user_favorites" USING ((auth.uid() = user_id));
ALTER POLICY "Tenant isolation" ON public."user_roles" USING ((is_super_admin(auth.uid()) OR (user_role_empresa_id(user_id) = get_my_empresa_id()))) WITH CHECK ((is_super_admin(auth.uid()) OR (user_role_empresa_id(user_id) = get_my_empresa_id())));
ALTER POLICY "vehiculos_delete_empresa" ON public."vehiculos" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "vehiculos_insert_empresa" ON public."vehiculos" WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "vehiculos_select_empresa" ON public."vehiculos" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "vehiculos_update_empresa" ON public."vehiculos" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "vu_company_select" ON public."vendedor_ubicaciones" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "vu_self_delete" ON public."vendedor_ubicaciones" USING ((user_id = auth.uid()));
ALTER POLICY "vu_self_update" ON public."vendedor_ubicaciones" USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (empresa_id = get_my_empresa_id())));
ALTER POLICY "vu_self_upsert" ON public."vendedor_ubicaciones" WITH CHECK (((user_id = auth.uid()) AND (empresa_id = get_my_empresa_id())));
ALTER POLICY "Empresa puede leer su historial" ON public."vendedor_ubicaciones_historial" USING ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Usuario inserta su propio punto" ON public."vendedor_ubicaciones_historial" WITH CHECK (((user_id = auth.uid()) AND (empresa_id = get_my_empresa_id())));
ALTER POLICY "Tenant isolation" ON public."vendedores" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."venta_comisiones" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = venta_comisiones.venta_id) AND (v.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = venta_comisiones.venta_id) AND (v.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Tenant isolation" ON public."venta_historial" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "vll_empresa_all" ON public."venta_linea_lotes" USING ((empresa_id = get_my_empresa_id())) WITH CHECK ((empresa_id = get_my_empresa_id()));
ALTER POLICY "Active app users only" ON public."venta_lineas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."venta_lineas" USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = venta_lineas.venta_id) AND (v.empresa_id = get_my_empresa_id())))))) WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM ventas v
  WHERE ((v.id = venta_lineas.venta_id) AND (v.empresa_id = get_my_empresa_id()))))));
ALTER POLICY "Active app users only" ON public."ventas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."ventas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "empresa puede ver sus descuadres" ON public."ventas_descuadre_auditoria" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Active app users only" ON public."visitas" USING ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid()))) WITH CHECK ((is_active_app_user(auth.uid()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."visitas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "wa_bot_numbers delete by empresa" ON public."wa_bot_authorized_numbers" USING ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "wa_bot_numbers insert by empresa" ON public."wa_bot_authorized_numbers" WITH CHECK ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "wa_bot_numbers read by empresa" ON public."wa_bot_authorized_numbers" USING ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "wa_bot_numbers update by empresa" ON public."wa_bot_authorized_numbers" USING ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))))) WITH CHECK ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "wa_bot_logs read by empresa" ON public."wa_bot_logs" USING ((is_super_admin(auth.uid()) OR (empresa_id IN ( SELECT profiles.empresa_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid())))));
ALTER POLICY "Super admins full access campaign sends" ON public."wa_campaign_sends" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins full access campaigns" ON public."wa_campaigns" USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Super admins can delete wa_optouts" ON public."wa_optouts" USING ((EXISTS ( SELECT 1
   FROM super_admins
  WHERE (super_admins.user_id = auth.uid()))));
ALTER POLICY "Super admins can insert wa_optouts" ON public."wa_optouts" WITH CHECK ((EXISTS ( SELECT 1
   FROM super_admins
  WHERE (super_admins.user_id = auth.uid()))));
ALTER POLICY "Super admins read wa_optouts" ON public."wa_optouts" USING (is_super_admin(auth.uid()));
ALTER POLICY "Tenant isolation" ON public."whatsapp_config" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."whatsapp_log" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."whatsapp_templates" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
ALTER POLICY "Tenant isolation" ON public."zonas" USING (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))) WITH CHECK (((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid())));
COMMIT;
