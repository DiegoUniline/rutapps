
REVOKE EXECUTE ON FUNCTION public.validar_stock_cotizacion(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_stock_cotizacion(uuid, uuid) TO authenticated, service_role;
