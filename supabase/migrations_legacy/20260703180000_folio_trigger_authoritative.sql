-- ============================================================================
-- Trigger de folio AUTORITARIO: la base SIEMPRE asigna el folio de venta e
-- IGNORA cualquier folio que mande el cliente.
-- ----------------------------------------------------------------------------
-- Motivo: aunque la app ya manda folio=null, durante el despliegue (o por PWA
-- en caché) pueden quedar equipos con la versión vieja que envían folios
-- erróneos o duplicados (VTA-4210, VTA-<hex>). Antes el trigger solo generaba
-- folio cuando NEW.folio venía vacío, así que respetaba esos folios malos.
--
-- Ahora el trigger SIEMPRE regenera el folio en INSERT (usa next_folio, que ya
-- tiene advisory lock anti-concurrencia). Así, venga como venga la venta, la
-- base le pone el consecutivo correcto. El trigger es BEFORE INSERT únicamente,
-- por lo que NO altera folios al editar ventas existentes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_folio_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- El folio SIEMPRE lo asigna la base (fuente única de verdad). Se ignora
  -- cualquier NEW.folio que traiga el cliente.
  IF NEW.tipo = 'saldo_inicial' THEN
    PERFORM pg_advisory_xact_lock(hashtext('folio:SAL'), hashtext(NEW.empresa_id::text));
    SELECT 'SAL-' || LPAD((COALESCE(MAX(
      CASE WHEN folio ~ '^SAL-[0-9]+$'
        THEN CAST(SUBSTRING(folio FROM 5) AS INT)
        ELSE 0
      END
    ), 0) + 1)::TEXT, 4, '0')
    INTO NEW.folio
    FROM public.ventas
    WHERE empresa_id = NEW.empresa_id;
  ELSE
    NEW.folio := next_folio(
      CASE WHEN NEW.tipo = 'pedido' THEN 'PED' ELSE 'VTA' END,
      NEW.empresa_id
    );
  END IF;
  RETURN NEW;
END;
$$;
