## Cambio
Aplicar un estilo unificado al tab activo en todas las barras de tabs del proyecto: fondo azul (primary) con texto blanco y bordes redondeados, en lugar del subrayado actual.

## Archivos a modificar
- `src/pages/comisiones/ComisionesLayoutPage.tsx` — barra de tabs de Comisiones (Avance, Generadas, Por volumen, Por pagar, Recibos, Esquemas, Reglas).
- `src/components/CobranzaTabs.tsx` — tabs de Cobranza / CxC / Saldos.
- `src/components/PedidosTabs.tsx` — tabs de Pendientes / Entregas.

## Estilos
- Tab activo: `bg-primary text-primary-foreground rounded-md px-3 py-1.5`
- Tab inactivo: `text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md px-3 py-1.5`
- Quitar el `border-b-2` del activo para evitar mezcla visual.
- Mantener el contenedor con `border-b` para conservar la línea divisoria inferior y el scroll horizontal.

No se toca lógica, rutas, prefetching ni queries — solo clases de Tailwind.
