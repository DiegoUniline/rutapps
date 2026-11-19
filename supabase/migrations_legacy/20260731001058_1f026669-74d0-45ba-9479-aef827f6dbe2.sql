
-- Backfill de registros de promoción faltantes para ventas de hoy (todas las empresas)
-- Solo inserta el registro informativo; NO toca precios, totales, saldos ni inventario.
with sales as (
  select v.id, v.empresa_id from ventas v
  where (v.created_at at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date
    and v.status::text not in ('cancelada','cancelado')
),
p as (
  select * from promociones where activa and tipo='producto_gratis' and producto_gratis_id is not null
),
gift_lines as (
  select s.id venta_id, p.id promo_id, p.nombre, l.id linea_id, l.cantidad, l.precio_unitario
  from sales s
  join p on p.empresa_id = s.empresa_id
  join venta_lineas l on l.venta_id = s.id and l.producto_id = p.producto_gratis_id
  where coalesce(l.total,0) = 0 and coalesce(l.precio_unitario,0) > 0
    and not exists (select 1 from promocion_aplicada pa where pa.venta_id = s.id and pa.promocion_id = p.id)
)
insert into promocion_aplicada (venta_id, venta_linea_id, promocion_id, descripcion, descuento_aplicado)
select venta_id, linea_id, promo_id, cantidad || '× gratis — ' || nombre, round(cantidad * precio_unitario, 2)
from gift_lines;
