# Fase 2 — Tipos estrictos (guía para el equipo)

**Meta:** llegar a `strict: true` global en TypeScript (mata la causa #1 de bugs
silenciosos: `undefined`/`null` y `any`). Se hace **incremental**, sin romper el
CI ni producción.

## Cómo funciona

- `tsconfig.strict.json` corre el chequeo **estricto** solo sobre una lista
  curada de archivos (`include`). Hoy cubre la **lógica crítica de dinero/
  inventario** (posPricing, priceResolver, taxUtils, currency,
  paymentDistribution, saldoFavor, stockPresentacion, CompraForm/types).
- Corre **obligatorio** en el CI (paso "Typecheck estricto (núcleo crítico)"),
  aparte del `tsc` normal. Si un cambio rompe la seguridad de tipos de ese
  núcleo, el PR se pone **rojo**.
- El `tsconfig` principal sigue en `strict: false`, así que el resto del código
  no se ve afectado todavía.

## Correrlo localmente

```bash
npm run typecheck:strict
```

Debe salir **sin errores** (hoy: 0).

## Cómo sumar un archivo (el trabajo de la fase)

1. Agrega la ruta del archivo a `include` en `tsconfig.strict.json`.
2. Corre `npm run typecheck:strict`.
3. Arregla los errores que aparezcan **en ese archivo** (tipos de null/undefined,
   quitar `any`, etc.). **No cambies la lógica** — solo hazla type-safe.
4. Cuando quede en 0, commitea. Ese archivo queda **candado**: nadie puede
   volver a romperle los tipos sin que el CI lo marque.

**Orden sugerido** (de más crítico a menos): dinero/inventario → hooks de datos
→ componentes de venta/cobro → resto.

## Meta final

Cuando `include` cubra casi todo `src`, se prende `strict: true` en el
`tsconfig` principal y este archivo separado se puede retirar. A partir de ahí,
todo el proyecto queda con tipos estrictos y el CI lo protege.
