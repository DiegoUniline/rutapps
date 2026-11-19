-- Bloquear cancelar / volver a borrador un pedido que tiene entregas activas.
--
-- Contexto: en un pedido, el stock lo descuenta la ENTREGA (surtido/cargado/hecho),
-- no la venta. Si se cancela el pedido sin cancelar sus entregas, el stock queda
-- descontado y nunca regresa (bug de "adeudo de inventario" / stock negativo).
--
-- Regla: un pedido con entregas NO canceladas no se puede cancelar ni volver a
-- borrador. Primero hay que cancelar/reversar sus entregas (el flujo de entregas
-- ya revierte el stock correctamente, con sus decisiones: bodega vs camión).
--
-- Este trigger es la RED DE SEGURIDAD a nivel BD: cubre cualquier camino (app,
-- sync, API). La app además muestra un mensaje amable antes de llegar aquí.

CREATE OR REPLACE FUNCTION public.bloquear_cancelar_pedido_con_entregas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_entregas text;
BEGIN
  -- Solo nos importa al INTENTAR cancelar o volver a borrador.
  IF NEW.status::text NOT IN ('cancelado', 'borrador') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  -- ¿Tiene entregas que NO estén canceladas?
  SELECT string_agg(folio, ', ' ORDER BY folio)
    INTO v_entregas
  FROM public.entregas
  WHERE pedido_id = NEW.id
    AND status::text <> 'cancelado';

  IF v_entregas IS NOT NULL THEN
    RAISE EXCEPTION
      'Este pedido tiene entregas activas (%). Cancela o reversa primero sus entregas antes de % la venta.',
      v_entregas,
      CASE WHEN NEW.status::text = 'cancelado' THEN 'cancelar' ELSE 'regresar a borrador' END
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_cancelar_pedido_con_entregas ON public.ventas;
CREATE TRIGGER trg_bloquear_cancelar_pedido_con_entregas
  BEFORE UPDATE OF status ON public.ventas
  FOR EACH ROW
  EXECUTE FUNCTION public.bloquear_cancelar_pedido_con_entregas();
