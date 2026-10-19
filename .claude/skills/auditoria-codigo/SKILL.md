---
name: auditoria-codigo
description: Checklist y búsquedas concretas para encontrar fallas en un sistema existente (Supabase/React/Lovable o Apps Script/AppSheet) y medir cuánto se conoce de cada campo y proceso. Úsala al auditar o antes de tocar un módulo poco documentado.
---

# Auditoría de código

## Cómo medir conocimiento
Por cada elemento (campo, regla, proceso, permiso):
- ✅ visto en BD Y en el código que lo usa, con `archivo:línea`.
- 🟡 solo en uno de los dos, o deducido por nombre.
- ❓ sin evidencia.
- ⚠️ BD, front, backend o lo que dijo el dueño se contradicen.

## Búsquedas base (Supabase / React)
```bash
# tablas y columnas definidas
grep -n "create table\|alter table\|add column" supabase/migrations/*.sql
# uso de cada tabla en el código
grep -rn "from('<tabla>')\|from(\"<tabla>\")" src supabase/functions
# escrituras
grep -rnE "\.(insert|update|upsert|delete)\(" src supabase/functions
# RPC
grep -rn "\.rpc(" src supabase/functions
# service role fuera del backend
grep -rn "service_role\|SERVICE_ROLE" src
# catch vacíos / errores silenciados
grep -rnE "catch *\([^)]*\) *\{ *\}" src
grep -rn "console.error" src | head -50
# dinero en float
grep -n "float\|real\|double precision" supabase/migrations/*.sql
# deletes físicos
grep -rn "\.delete()" src supabase/functions
```

## Checklist de fallas (severidad por defecto)
| Falla | Sev |
|---|---|
| Tabla sin RLS o política sin filtro por empresa | ALTA |
| Query/función que puede devolver datos de otra empresa | ALTA |
| service_role en front o en función sin validar empresa | ALTA |
| Dinero en float / cálculo de totales distinto en front y BD | ALTA |
| Proceso de cobro/cierre/cancelación en pasos sueltos sin transacción | ALTA |
| Documento cerrado editable | ALTA |
| Concurrencia sin UNIQUE/lock (doble cobro, doble reserva, folio max()+1) | ALTA |
| DELETE físico sobre registros con historial | ALTA |
| Validación solo en front (falta NOT NULL/CHECK/FK/UNIQUE) | MEDIA |
| Estados sin CHECK | MEDIA |
| Campo usado en código que no existe en BD (o types.ts desactualizado) | MEDIA |
| catch vacío / error no mostrado | MEDIA |
| Columna sin uso | BAJA |
| Trigger/función sin documentar | BAJA–MEDIA |

## Apps Script / AppSheet
```bash
grep -rn "getRange\|getValues\|setValues\|appendRow\|deleteRow" *.gs
grep -rn "getSheetByName" *.gs           # hojas por nombre: si se renombran, rompe
grep -rnE "\[[0-9]+\]" *.gs              # columnas por índice: si se mueven, rompe
grep -rn "UrlFetchApp" *.gs              # llamadas a API AppSheet / externas
grep -rn "PropertiesService\|ApplicationKey\|apikey" *.gs  # llaves expuestas
```
Fallas típicas: columnas por índice fijo, hojas por nombre sin validar, sin LockService en escrituras concurrentes, sin manejo de cuota/timeout (6 min), llaves en el código, deleteRow en ciclo hacia adelante, triggers duplicados.

## Salida
- /docs/modulos/<m>.md con evidencia.
- Cada falla → /docs/riesgos.md: `R-XXX · SEV · módulo · descripción · evidencia · impacto · sugerencia (no aplicada)`.
- Lo que el código no puede responder (intención) → pregunta P-XXX.
