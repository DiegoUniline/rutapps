-- Kardex por ubicación: filtra movimientos por almacén origen O destino. Con estos dos índices
-- la BD combina ambos lados (BitmapOr) en vez de recorrer todos los movimientos de la empresa.
CREATE INDEX IF NOT EXISTS idx_movinv_emp_origen_created ON public.movimientos_inventario (empresa_id, almacen_origen_id, created_at) WHERE almacen_origen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movinv_emp_destino_created ON public.movimientos_inventario (empresa_id, almacen_destino_id, created_at) WHERE almacen_destino_id IS NOT NULL;
