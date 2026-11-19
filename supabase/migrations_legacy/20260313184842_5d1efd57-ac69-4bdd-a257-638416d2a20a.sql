
-- Auto-folio function for any table prefix per empresa
CREATE OR REPLACE FUNCTION public.next_folio(prefix TEXT, p_empresa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INT;
BEGIN
  -- Get the max numeric suffix for this prefix+empresa
  IF prefix = 'VTA' THEN
    SELECT COALESCE(MAX(
      CASE WHEN folio ~ ('^' || prefix || '-[0-9]+$')
        THEN CAST(SUBSTRING(folio FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.ventas
    WHERE empresa_id = p_empresa_id;
  ELSIF prefix = 'CLI' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ ('^' || prefix || '-[0-9]+$')
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.clientes
    WHERE empresa_id = p_empresa_id;
  ELSIF prefix = 'PROD' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ ('^' || prefix || '-[0-9]+$')
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.productos
    WHERE empresa_id = p_empresa_id;
  ELSE
    next_num := 1;
  END IF;

  RETURN prefix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- Auto-assign folio on ventas insert
CREATE OR REPLACE FUNCTION public.auto_folio_venta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    NEW.folio := next_folio(
      CASE WHEN NEW.tipo = 'pedido' THEN 'PED' ELSE 'VTA' END,
      NEW.empresa_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_folio_venta
  BEFORE INSERT ON public.ventas
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_folio_venta();

-- Auto-assign codigo on clientes insert
CREATE OR REPLACE FUNCTION public.auto_codigo_cliente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := next_folio('CLI', NEW.empresa_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_codigo_cliente
  BEFORE INSERT ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_codigo_cliente();
