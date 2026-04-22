-- Fix cobros where fecha is in UTC (ahead of empresa local date) by recalculating to empresa timezone
UPDATE cobros c
SET fecha = (c.created_at AT TIME ZONE COALESCE(e.zona_horaria, 'America/Mexico_City'))::date
FROM empresas e
WHERE e.id = c.empresa_id
  AND c.fecha > (c.created_at AT TIME ZONE COALESCE(e.zona_horaria, 'America/Mexico_City'))::date;