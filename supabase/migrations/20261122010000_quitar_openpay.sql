-- D-053: Openpay nunca se usó. Se quita su única tabla (links de suscripción Openpay).
-- Sin vistas, funciones ni crons que dependan de ella; la recarga del corte omite sus datos.
DROP TABLE IF EXISTS public.payment_links;
