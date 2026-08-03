# Documentación técnica de RutApp

Guía completa para un programador que entra al proyecto por primera vez.

| Documento | Contenido |
|---|---|
| [01 · Arquitectura general](./01-ARQUITECTURA.md) | Stack, estructura de carpetas, multi-tenant, auth y permisos, capa de datos, convenciones de código. |
| [02 · Esquema de base de datos](./02-ESQUEMA-BASE-DE-DATOS.md) | **Autogenerado.** Las 153 tablas, cada campo, tipo, nulabilidad, llaves foráneas y quién referencia a quién. Funciones RPC y enums. |
| [03 · Mapa de rutas](./03-MAPA-DE-RUTAS.md) | **Autogenerado.** Cada URL → componente → archivo donde nace la vista. |
| [04 · Flujos de negocio](./04-FLUJOS-DE-NEGOCIO.md) | Cómo funciona por dentro: precios, impuestos, promociones, venta, inventario, lotes, cobranza, ruta móvil offline, facturación. |

## Regenerar la documentación automática

```bash
bunx tsx scripts/gen-docs-schema.ts
```

Corre esto **después de cada migración** de base de datos (los tipos de
`src/integrations/supabase/types.ts` se regeneran solos al aplicar la migración) y
después de agregar rutas nuevas en `src/App.tsx`.

## Documentos vivos adicionales

- `.lovable/memory/` — memoria del proyecto: decisiones de arquitectura, reglas de
  negocio y restricciones acordadas. Es lectura obligada antes de tocar
  precios, inventario o permisos.
- `docs/FASE2-tipos-estrictos.md` — plan de endurecimiento de tipos.
