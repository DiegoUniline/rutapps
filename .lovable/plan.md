

## Liberar "Iniciar jornada" como configuración por empresa

Hoy el bloqueo de jornada está cableado a un solo `empresa_id` (la tuya, de prueba). Para no romper la operación de quienes ya están vendiendo hoy, lo convertimos en **una opción configurable por empresa**, apagada por defecto, y cada cliente decide si la activa.

### Cambios

**1. Base de datos** — agregar columna a `empresas`:
- `requiere_jornada_ruta` (boolean, default `false`)
- `requiere_jornada_desde` (date, nullable) — opcional, para que el cliente diga "aplica a partir de mañana"

**2. Página de Configuración** (`src/pages/ConfiguracionPage.tsx`)
- Nueva sección "App móvil de ruta" con:
  - Switch: **"Exigir iniciar jornada (vehículo + KM + foto del odómetro)"**
  - Si está activo, selector de fecha: **"Aplica a partir de"** (default: mañana)
  - Texto explicativo: "Cuando esté activo, los vendedores no podrán vender, entregar ni cobrar hasta iniciar su jornada en la app móvil."

**3. Hook de configuración** — pequeño hook `useEmpresaJornadaConfig()` que lee `requiere_jornada_ruta` y `requiere_jornada_desde` desde `empresas`, con cache de React Query (`['empresa-jornada', empresaId]`).

**4. `MobileLayout.tsx`** — reemplazar la constante hardcoded `EMPRESA_PRUEBA_JORNADA` por la config de la empresa:
- `requireJornada = config.requiere_jornada_ruta && (!config.requiere_jornada_desde || hoy >= requiere_jornada_desde)`
- El resto de la lógica (overlay, rutas permitidas) queda igual.

**5. `RutaClientesEntregas.tsx`** — mismo cambio: el banner de jornada se muestra cuando `requireJornada` es true, no por `empresa_id` hardcoded.

### Comportamiento resultante

- **Por defecto (todas las empresas)**: el banner y el bloqueo NO aparecen → no rompe a nadie.
- **Tu empresa de prueba**: el migration deja `requiere_jornada_ruta = true` y `requiere_jornada_desde = mañana` para mantener el comportamiento actual sin interrupción hoy.
- **Cualquier cliente** que quiera la función entra a Configuración, activa el switch, elige fecha → desde esa fecha, sus vendedores deben iniciar jornada para operar.

### Archivos a tocar

- Migration: `ALTER TABLE empresas ADD COLUMN requiere_jornada_ruta boolean DEFAULT false, ADD COLUMN requiere_jornada_desde date;` + UPDATE para tu empresa.
- `src/hooks/useEmpresaJornadaConfig.ts` (nuevo)
- `src/pages/ConfiguracionPage.tsx` (sección nueva)
- `src/components/MobileLayout.tsx` (quitar hardcode, usar hook)
- `src/pages/ruta/RutaClientesEntregas.tsx` (quitar hardcode, usar hook)

