ALTER PUBLICATION supabase_realtime ADD TABLE public.venta_lineas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.entrega_lineas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cobro_aplicaciones;
ALTER TABLE public.venta_lineas REPLICA IDENTITY FULL;
ALTER TABLE public.entrega_lineas REPLICA IDENTITY FULL;
ALTER TABLE public.cobro_aplicaciones REPLICA IDENTITY FULL;