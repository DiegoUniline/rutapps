-- RutApp · Medición del costo de las políticas RLS (solo lectura; la tabla temporal se descarta sola)
-- Mide la misma consulta: (a) sin RLS, (b) con las políticas actuales como un usuario real,
-- (c) simulando las políticas optimizadas con (select …). No modifica datos ni políticas.
begin;
create temp table _medicion(orden int, tabla text, caso text, filas bigint, ms numeric) on commit drop;
grant all on _medicion to authenticated;

-- Empresa con más stock y un usuario activo (no super admin) de esa empresa
create temp table _ctx on commit drop as
select s.empresa_id,
       (select p.user_id from profiles p
         where p.empresa_id = s.empresa_id and p.estado = 'activo' and p.archivado_en is null
           and not exists (select 1 from super_admins sa where sa.user_id = p.user_id)
         limit 1) as user_id
from stock_almacen s group by s.empresa_id order by count(*) desc limit 1;
grant select on _ctx to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id from _ctx), 'role', 'authenticated')::text, true);

-- (a) sin RLS y (c) optimizada simulada, como dueño de las tablas
do $$
declare t0 timestamptz; n bigint; e uuid := (select empresa_id from _ctx);
begin
  t0 := clock_timestamp();
  select count(*) into n from (select almacen_id, producto_id, cantidad from stock_almacen where empresa_id = e) x;
  insert into _medicion values (1, 'stock_almacen', 'a) sin RLS', n, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select almacen_id, producto_id, cantidad from stock_almacen
    where empresa_id = e
      and (empresa_id = (select get_my_empresa_id()) or (select is_super_admin((select auth.uid()))))
      and ((select is_active_app_user((select auth.uid()))) or (select is_super_admin((select auth.uid()))))
  ) x;
  insert into _medicion values (3, 'stock_almacen', 'c) RLS optimizada (simulada)', n, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select vl.producto_id, vl.cantidad, vl.total from venta_lineas vl join ventas v on v.id = vl.venta_id
    where v.empresa_id = e and v.fecha >= current_date - 90) x;
  insert into _medicion values (4, 'venta_lineas 90 días', 'a) sin RLS', n, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select vl.producto_id, vl.cantidad, vl.total from venta_lineas vl join ventas v on v.id = vl.venta_id
    where v.empresa_id = e and v.fecha >= current_date - 90
      and ((select is_super_admin((select auth.uid()))) or v.empresa_id = (select get_my_empresa_id()))
      and ((select is_active_app_user((select auth.uid()))) or (select is_super_admin((select auth.uid()))))
  ) x;
  insert into _medicion values (6, 'venta_lineas 90 días', 'c) RLS optimizada (simulada)', n, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));
end $$;

-- (b) con las políticas actuales, como el usuario real
set local role authenticated;
do $$
declare t0 timestamptz; n bigint; e uuid := (select empresa_id from _ctx);
begin
  t0 := clock_timestamp();
  select count(*) into n from (select almacen_id, producto_id, cantidad from stock_almacen where empresa_id = e) x;
  insert into _medicion values (2, 'stock_almacen', 'b) RLS actual', n, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select vl.producto_id, vl.cantidad, vl.total from venta_lineas vl join ventas v on v.id = vl.venta_id
    where v.empresa_id = e and v.fecha >= current_date - 90) x;
  insert into _medicion values (5, 'venta_lineas 90 días', 'b) RLS actual', n, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));
end $$;
reset role;

select tabla, caso, filas, ms from _medicion order by orden;
commit;
