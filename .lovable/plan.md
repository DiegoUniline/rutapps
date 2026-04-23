

## Iniciar Ruta — Vehículos, KM y trazabilidad de jornada

Hoy el flujo de ruta tiene **Carga** (qué llevas) y **Descarga/Liquidación** (cuánto entregas en efectivo). Falta la pieza intermedia: **un evento explícito de "Iniciar ruta"** con vehículo, kilometraje, ubicación y foto, que cierre al liquidar con KM final. Eso permite saber con certeza qué entregas están "en ruta" y medir uso de vehículo por jornada.

### Qué construiremos

**1. Catálogo de Vehículos** (escritorio, dentro de Configuración)
- CRUD con: alias, placa, marca/modelo, tipo (camioneta/moto/auto), capacidad, KM actual, status (activo/mantenimiento/baja), foto opcional.
- Asignación: un vehículo puede tener un repartidor asignado por defecto (opcional). En cada jornada se confirma.

**2. Sesión de Ruta (Jornada)** — nueva tabla `ruta_sesiones`
Registra el ciclo de vida de cada salida del vendedor:
- `vehiculo_id`, `vendedor_id`, `carga_id` (opcional), `fecha`
- Apertura: `inicio_at`, `km_inicio`, `lat_inicio`, `lng_inicio`, `foto_inicio_url`, `notas_inicio`
- Cierre: `fin_at`, `km_fin`, `lat_fin`, `lng_fin`, `foto_fin_url`, `notas_fin`
- Calculado: `km_recorridos` (km_fin − km_inicio)
- `status`: `en_ruta` | `cerrada` | `cancelada`

**3. Móvil (`/ruta`) — pantalla "Iniciar ruta"**
Antes de poder vender/entregar, si no hay sesión activa del día:
- Selecciona vehículo asignado (o de la lista disponible).
- Captura **KM inicial** (validado contra el último KM registrado del vehículo).
- Toma **foto del odómetro** (subida a Storage `ruta-fotos`).
- Captura GPS automático.
- Botón "Iniciar ruta" → crea la sesión, marca vehículo como en uso.

**4. Liquidación (cierre)**
La pantalla actual de Descarga/Liquidación añadirá arriba:
- Campo **KM final** + **foto del odómetro final** + GPS al cerrar.
- Muestra resumen: KM recorridos, horas en ruta, vehículo usado.
- Al enviar liquidación: cierra la sesión y actualiza `vehiculos.km_actual`.

**5. Integración con Entregas**
- Mientras exista `ruta_sesiones.status = 'en_ruta'` para el vendedor, sus entregas asignadas se consideran **"En ruta"** (badge azul en `/logistica/entregas` y en el listado de pedidos).
- Estados visibles: `Pendiente` (sin sesión) → `En ruta` (sesión activa) → `Entregado`.

**6. Escritorio — Reporte de Jornadas**
Nueva vista en Logística → "Jornadas de ruta":
- Tabla con: fecha, vendedor, vehículo, hora inicio/fin, KM inicio/fin, KM recorridos, # entregas, fotos.
- Filtros por fecha, vendedor, vehículo.
- Mapa con punto inicio y punto fin de cada jornada.

### Detalles técnicos

**Migraciones SQL:**
```text
- vehiculos (id, empresa_id, alias, placa, marca, modelo, tipo, 
             capacidad_kg, km_actual, foto_url, vendedor_default_id, 
             status, created_at)
- ruta_sesiones (id, empresa_id, vehiculo_id, vendedor_id, carga_id?, fecha,
                 inicio_at, km_inicio, lat_inicio, lng_inicio, foto_inicio_url, notas_inicio,
                 fin_at, km_fin, lat_fin, lng_fin, foto_fin_url, notas_fin,
                 km_recorridos GENERATED, status, created_at)
- Storage bucket: ruta-fotos (public read, RLS por empresa)
- RLS: aislamiento por empresa_id en ambas tablas
- Trigger: al cerrar sesión, actualizar vehiculos.km_actual = km_fin
- Trigger: validar km_fin >= km_inicio y km_inicio >= vehiculos.km_actual
```

**Hooks/Componentes nuevos:**
- `useVehiculos` (CRUD desktop)
- `useRutaSesion` (sesión activa del día + abrir/cerrar)
- `RutaIniciarPage.tsx` (móvil, captura KM + foto + GPS)
- `VehiculosPage.tsx` (escritorio, catálogo)
- `JornadasRutaPage.tsx` (escritorio, reporte)
- Guard en `/ruta/*`: si no hay sesión abierta, banner "Iniciar ruta" arriba del dashboard (no bloquea, solo invita).

**Modificaciones:**
- `RutaDescarga.tsx` → añadir bloque KM final + foto antes del conteo de efectivo.
- `EntregaListPage.tsx` → considerar `ruta_sesiones` para badge "En ruta".
- Sidebar → agregar "Vehículos" en Configuración y "Jornadas" en Logística.

### Flujo del usuario (vendedor móvil)

```text
1. Abre /ruta → ve banner "Iniciar ruta" si no hay sesión hoy
2. Toca → pantalla con: vehículo, KM inicial, foto odómetro, GPS auto
3. Confirma → entra al dashboard normal, ya puede vender/entregar
4. Trabaja todo el día (entregas marcadas como "En ruta")
5. Al final del día → Liquidación
   - Captura KM final + foto + GPS
   - Cuenta efectivo (flujo actual)
   - Envía → sesión cerrada, KM actualizado en vehículo
```

### Preguntas para confirmar antes de implementar

1. **Foto del odómetro**: ¿obligatoria o opcional? (recomiendo obligatoria para auditoría).
2. **Sin sesión iniciada**: ¿bloqueamos ventas/entregas o solo mostramos aviso? (recomiendo solo aviso al inicio para no romper operaciones existentes).
3. **Vehículo asignado**: ¿un vendedor puede usar cualquier vehículo o solo el que tiene asignado por defecto?
4. **Múltiples sesiones por día**: ¿permitimos cerrar una y abrir otra (ej. cambio de turno) o máximo una por día?

