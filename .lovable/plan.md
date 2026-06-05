# Plan: Homologación de catálogo por código origen + Importación

Funcionalidad **global** (disponible para todas las empresas del SaaS, aislada por `empresa_id`) basada en la propuesta UNL-2026-001.

## 1. Modelo de datos

Aprovechamos que `productos` ya tiene `codigo` (interno) y agregamos soporte explícito al **código origen externo** + tabla de equivalencias.

```text
productos
  + codigo_origen TEXT NULL          -- código del sistema externo (índice único por empresa cuando no es null)

producto_equivalencias               -- NUEVA: mapea N códigos externos a un producto interno
  id, empresa_id, producto_id (FK productos)
  codigo_externo TEXT, sistema_origen TEXT NULL, notas TEXT NULL
  UNIQUE (empresa_id, codigo_externo, sistema_origen)

import_jobs                          -- NUEVA: encabezado de cada importación
  id, empresa_id, tipo ('homologacion_catalogo')
  archivo_nombre, total_filas, matched, sin_coincidencia, errores
  status ('procesando' | 'completado' | 'fallido')
  resumen JSONB, created_by, created_at

import_job_lineas                    -- NUEVA: detalle por fila importada
  id, job_id, fila_num, codigo_externo, descripcion_externa
  producto_id NULL, match_tipo ('exacto' | 'parcial' | 'duplicado' | 'sin_match' | 'error')
  mensaje TEXT, raw JSONB
```

RLS por `empresa_id` (patrón estándar del proyecto) + GRANTs estándar.

## 2. UI nueva — Configuración › Importación / Homologación

Nueva sección en el sidebar de **Configuración** (visible solo con permiso `import_catalogo`):

1. **Equivalencias de código origen**
   - Lista paginada de `producto_equivalencias` con búsqueda por código externo / producto interno.
   - Alta/edición/borrado manual.
   - Acción “Generar desde catálogo” → llena `codigo_externo = productos.codigo_origen` para los productos que ya tengan el campo.

2. **Nueva importación**
   - Upload **Excel/CSV** (drag & drop, reutiliza patrón de `mass-import-catalog`).
   - Mapeo de columnas: `codigo_externo`, `descripcion`, `cantidad`, `precio` (configurable, recuerda última selección).
   - **Preview** con primeras 50 filas y conteo de matches antes de confirmar.
   - Botón “Importar” crea `import_jobs` + ejecuta el cruce.

3. **Reporte de resultados** (vista del `import_job`)
   - KPIs: Total / Matched / Sin coincidencia / Errores / Duplicados.
   - Tabla de `import_job_lineas` con filtros por `match_tipo`.
   - Acciones por fila sin match: **Crear producto**, **Vincular a producto existente** (crea `producto_equivalencias`), **Ignorar**.
   - Exportar reporte a Excel.

## 3. Lógica de cruce (homologación)

Resuelta 100% en cliente con la utilidad existente `fetchAllPages` sobre `productos` + `producto_equivalencias`:

1. **Match exacto** por `codigo_externo` en `producto_equivalencias`.
2. Si no, **match exacto** por `productos.codigo_origen`.
3. Si no, **match exacto** por `productos.codigo` (SKU interno).
4. Si no, **match parcial** por nombre normalizado (lowercase, sin acentos) → marca `parcial` para revisión manual.
5. **Duplicados**: misma fila externa apareciendo >1 vez en el archivo.
6. **Errores**: filas con `codigo_externo` vacío o tipos inválidos.

Cada match exitoso vía paso 2-4 propone (no obligatorio) crear la equivalencia automáticamente — checkbox “Auto-vincular matches resueltos” en el preview.

## 4. Permisos y navegación

- Nuevo módulo lógico `import_catalogo` (view/edit/delete) en `roles-permissions`.
- Entrada en Configuración: **Importación de catálogo**.
- Super Admin (`diego.leon@uniline.mx`) tiene acceso global como siempre.

## 5. Entregables vs propuesta

- [x] 2.1 Homologación por código origen (tabla equivalencias + cruce + manejo de parciales/duplicados/sin match).
- [x] 2.2 Proceso de importación con validación + normalización + reporte.
- [ ] 2.3 Layout de ventas a detalle por ticket → **excluido** según tu respuesta.

## Archivos a tocar (estimado)

- `supabase/migrations/...` (nuevas tablas + RLS + grants + columna `productos.codigo_origen`)
- `src/pages/configuracion/ImportCatalogoPage.tsx` (nueva, con tabs Equivalencias / Nueva importación / Historial)
- `src/components/import-catalogo/UploadStep.tsx`, `MapColumnsStep.tsx`, `PreviewStep.tsx`, `ResultReport.tsx`
- `src/hooks/useEquivalencias.ts`, `useImportJobs.ts`
- `src/lib/catalogMatcher.ts` (algoritmo de cruce, testeable)
- `src/components/AppSidebar.tsx` (entrada en Configuración)
- `src/lib/permissions.ts` (módulo `import_catalogo`)
- `src/version.ts`

¿Procedo o quieres ajustar algo (p. ej. ¿lo quieres en Productos en vez de Configuración, o incluir también campos como `unidad`/`marca` en el mapeo)?
