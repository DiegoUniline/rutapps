---
name: Code quality standards
description: Reglas de calidad que todo código nuevo o modificado debe cumplir. Tipado sin `any`, sin `console.log` en producción, archivos acotados, y tests para lógica de dinero.
type: architecture
---

# Estándar de calidad de código

Objetivo: que cada cambio suba la calidad del repo, no que la baje. Aplica a
**todo archivo que se cree o se toque**. No es necesario arreglar el código
viejo de golpe (la deuda se limpia al pasar por cada archivo), pero el código
nuevo sí cumple desde el primer commit.

## Tipado (lo más importante)

- **Prohibido `any` y `as any` en código nuevo.** Si no se conoce la forma,
  usar `unknown` y validar/estrechar, o definir un `type`/`interface`.
- Para datos de Supabase, usar los tipos generados en
  `src/integrations/supabase/types.ts` (`Tables<'ventas'>`, `Row`, `Insert`,
  `Update`) en vez de tipar a mano o con `any`.
- Tipar los `props` de cada componente con un `interface` explícito.
- Evitar el casting `as Tipo` salvo cuando sea genuinamente necesario; preferir
  type guards.

## Logs

- **Nada de `console.log` en código que llega a producción.** Quitarlos antes
  de terminar el cambio. Para errores reales usar el manejo de errores ya
  existente (toasts `sonner`, captura en `try/catch` con mensaje al usuario),
  no `console.error` suelto.

## Tamaño y estructura de archivos

- Un componente/página que pasa de ~400 líneas debe partirse: extraer
  subcomponentes a su carpeta (`sections/`, `components/`) y la lógica a hooks
  (`hooks/use*.ts`), como ya se hace en `src/pages/dashboard/`.
- Un hook o util con más de ~200 líneas probablemente hace demasiado: separar
  responsabilidades.
- Reutilizar lo que ya existe (`src/lib/`, componentes `ui/`, helpers de PDF,
  `fetchAllPages`, `empresaGuard`) antes de escribir algo nuevo.

## Tests

- Toda lógica de **dinero, impuestos, saldos, comisiones, stock o precios**
  nueva o modificada lleva su test en `src/test/*.test.ts` (Vitest). Ya hay
  ejemplos: `taxUtils`, `posPricing`, `priceResolver`, `saldoCliente`,
  `compraCalc`, `currency`.
- Un cambio que corrige un bug de cálculo agrega primero un test que lo
  reproduce.

## Antes de dar por terminado un cambio

- `npm test` pasa.
- `npm run build` pasa.
- No se introdujeron `any` nuevos ni `console.log`.
- Se respetan las demás memorias (multi-tenant `empresa_id`, paginación
  `fetchAllPages`, estándar de PDFs B/N).
