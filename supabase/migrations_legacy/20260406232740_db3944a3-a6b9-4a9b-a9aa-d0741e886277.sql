
-- Drop the duplicate overload (the one with different parameter order)
DROP FUNCTION IF EXISTS public.surtir_linea_entrega(uuid, uuid, numeric, uuid, uuid, uuid, uuid);
