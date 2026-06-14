# Jarvis WhatsApp Bot: Agente Inteligente con Datos Reales

Objetivo: que Jarvis responda **siempre con datos reales** del sistema (ventas, clientes, saldos, stock, cobros, pedidos), entienda lenguaje natural y contexto conversacional, y muestre unidades correctas.

## A. Fix de unidades (rápido)

Helper único `unitFor(p)` en `wa-bot-webhook/index.ts`:
- Si `p.es_granel === true` → usar `p.unidad_granel || "kg"`
- Si no → usar siglas de `p.unidades?.siglas` / `p.unidad` (ej. `PZA`, `CAJ`) con fallback `"pzs"`

Aplicar en las 4 zonas de stock: `buildStockMessage`, `buildLowStockMessage`, tool `consultar_stock_disponible`, tool `consultar_producto`. Añadir `es_granel, unidad, unidades:unidades(siglas)` al `.select(...)` de cada query de `productos`.

## B. Agente AI real (núcleo)

Reescribir el flujo del webhook para que el LLM sea **el cerebro**, no un fallback.

### B1. Modelo y gateway
- Endpoint: `https://ai.gateway.lovable.dev/v1/chat/completions`
- Header: `Authorization: Bearer ${LOVABLE_API_KEY}`
- Modelo: `google/gemini-3-flash-preview` (default Lovable AI)
- Tool calling estilo OpenAI (`tools`, `tool_choice: "auto"`)
- Loop de hasta 5 pasos hasta que el modelo devuelva mensaje final sin `tool_calls`

### B2. Tools expuestas al LLM (todas devuelven JSON, no markdown)
Cada tool ya existe en el webhook; sólo cambia que retornen objetos:
1. `buscar_clientes(query, solo_con_saldo)` → usa RPC `wa_clientes_saldos`
2. `consultar_cliente(query)` → ficha + últimas 10 ventas + saldo real
3. `consultar_saldos(limit)` → top deudores (RPC)
4. `cuentas_por_cobrar(limit)` → idem orientado a cobranza
5. `consultar_ventas(periodo, vendedor?, cliente?)` → totales y conteo por día/semana/mes
6. `consultar_venta(folio)` → detalle por folio (V-xxxx)
7. `consultar_pedidos(estado, fecha?)` → pendientes / entregados / cancelados
8. `consultar_stock_disponible(query)` → stock por almacén con unidad correcta
9. `consultar_producto(query)` → ficha producto + precio + stock total
10. `productos_bajo_stock(limit)` → debajo de mínimo
11. `consultar_cobros(periodo, vendedor?)` → cobros recibidos
12. `consultar_gastos(periodo)` → gastos del período
13. `resumen_dia()` → ventas, cobros, gastos, pedidos pendientes de hoy
14. `top_vendedores(periodo, limit)` → ranking
15. `top_productos(periodo, limit)` → más vendidos
16. `generar_reporte_pdf(tipo, periodo)` → atajo al flujo PDF existente

Todas filtran por `empresa_id` del número autorizado y respetan zona horaria de la empresa.

### B3. Contexto conversacional
- Cargar últimos 6 mensajes de `wa_bot_logs` para ese teléfono+empresa
- Inyectarlos como historial `user`/`assistant` para que entienda referencias ("y de ese cliente…", "ahora en pesos", "del mes pasado")

### B4. System prompt (Jarvis)
- Identidad: "Jarvis, asistente del sistema RutApp de {empresa.nombre}"
- Reglas duras:
  - **Prohibido inventar datos.** Si una tool no devuelve resultados, decirlo explícito.
  - Siempre usar las tools para cualquier cifra, nombre, folio o saldo.
  - Español MX, montos con `$` y separador de miles, fechas DD/MM/YYYY.
  - Mostrar unidad real del producto.
  - Si el usuario pide "reporte" o "PDF" → llamar `generar_reporte_pdf`.
  - Respuestas concisas estilo WhatsApp (sin markdown pesado).

### B5. Shortcuts (mínimos, antes del LLM)
Sólo dos atajos deterministas:
- Regex de folio `V-?\d+` → `consultar_venta` directo
- "menú", "ayuda", "hola" → mensaje de bienvenida

Todo lo demás va al LLM.

### B6. Errores
- 429 → "Demasiadas consultas, intenta en unos segundos"
- 402 → "Se agotaron los créditos de IA, contacta al administrador"
- Tool error → se devuelve al LLM para que reformule (no se oculta)

## C. Verificación

Probar en `wa_bot_logs`:
- "¿cuánto stock tengo de coca?" → "Coca Cola 600ml: 10,149 PZA"
- "¿quién me debe más?" → top 5 reales por `wa_clientes_saldos`
- "ventas de hoy" → total + conteo reales
- "y de ayer" → entiende contexto temporal
- "detalle de V-1234" → ficha real
- "reporte PDF de ventas de la semana" → genera PDF

## Archivos a tocar

- `supabase/functions/wa-bot-webhook/index.ts` (refactor mayor: agent loop + unitFor + tools JSON)

Sin cambios de DB (la RPC `wa_clientes_saldos` ya existe). `LOVABLE_API_KEY` ya está provisionado.
