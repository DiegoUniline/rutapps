-- RutApp · ¿Las fallas silenciosas R-001…R-004 y el hueco 20260909040000 afectan datos reales hoy? Solo SELECT.
select 'R-002 facturas de suscripción por mes' as revision, to_char(date_trunc('month', fecha_emision), 'YYYY-MM') as detalle, count(*)::text as valor
from facturas where fecha_emision >= date_trunc('month', now()) - interval '5 months'
group by 2
union all
select 'R-003 ventas vencidas con saldo (el POS las muestra en 0)', 'clientes: ' || count(distinct cliente_id), count(*)::text
from ventas where status <> 'cancelado' and saldo_pendiente > 0 and fecha_vencimiento < current_date
union all
select 'R-004 ventas con descuento > 15 % (control vacío)', 'últimos 90 días', count(*)::text
from ventas where status <> 'cancelado' and fecha >= current_date - 90
  and coalesce(descuento_total, 0) > 0.15 * (coalesce(total, 0) + coalesce(descuento_total, 0))
union all
select 'R-001 ventas con CFDI que hoy se podrían borrar', 'cfdis no cancelados', count(distinct v.id)::text
from ventas v join cfdis c on c.venta_id = v.id where c.status <> 'cancelado'
union all
select 'Hueco 20260909040000 entregas hechas sin fecha_entrega', to_char(date_trunc('month', created_at), 'YYYY-MM'), count(*)::text
from entregas where status = 'hecho' and fecha_entrega is null and created_at >= now() - interval '3 months'
group by 2
order by 1, 2;
