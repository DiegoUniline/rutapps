DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.ventas WHERE cerrado_at IS NOT NULL LOOP
    PERFORM public.fn_recalc_venta_saldo(r.id);
  END LOOP;
END $$;