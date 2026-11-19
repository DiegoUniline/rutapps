
REVOKE ALL ON FUNCTION public.calcular_comision_volumen(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generar_recibo_volumen(uuid, date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_comision_volumen(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_recibo_volumen(uuid, date, date, date) TO authenticated;
