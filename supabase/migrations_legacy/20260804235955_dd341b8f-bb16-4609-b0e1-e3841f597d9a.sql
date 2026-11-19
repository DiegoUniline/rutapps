REVOKE ALL ON FUNCTION public.validate_traspaso_linea_lote() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_traspaso_linea_lote() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirmar_traspaso(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_traspaso(uuid, uuid) TO authenticated, service_role;