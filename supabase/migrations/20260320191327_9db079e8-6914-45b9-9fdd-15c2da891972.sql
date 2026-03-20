DROP POLICY IF EXISTS "Public read productos for audits" ON public.productos;

CREATE POLICY "Anon read productos via audit"
ON public.productos
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM auditoria_lineas al
    JOIN auditorias a ON a.id = al.auditoria_id
    WHERE al.producto_id = productos.id
    AND a.status IN ('pendiente', 'en_proceso')
  )
);