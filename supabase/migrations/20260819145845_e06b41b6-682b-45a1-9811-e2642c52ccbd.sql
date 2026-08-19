REVOKE EXECUTE ON FUNCTION public.fn_sugerencias_resurtido(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.enviar_solicitud_traspaso(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.aprobar_solicitud_traspaso(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.rechazar_solicitud_traspaso(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancelar_solicitud_traspaso(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.surtir_solicitud_traspaso(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fn_log_solicitud_traspaso(uuid, uuid, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_folio_solicitud_traspaso() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.fn_sugerencias_resurtido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_solicitud_traspaso(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_solicitud_traspaso(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_solicitud_traspaso(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_solicitud_traspaso(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.surtir_solicitud_traspaso(uuid, jsonb) TO authenticated;