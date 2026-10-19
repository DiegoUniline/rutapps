# Preguntas
(Extracto: 4 de 23)

### P-001 · visión · ALTA · RESPONDIDA
**Contexto:** define si la base de datos lleva empresa en cada tabla.
**Pregunta:** ¿La app es solo para tu restaurante o la rentarás a otros?
**Opciones:** A) Solo mío B) Rentarla a otros
**Recomendación:** A — es más simple y rápido; si después la rentas, se migra.
**Impacto en datos:** con B, todas las tablas llevan `empresa_id` y seguridad por empresa.
**Respuesta:** A) Solo mío → D-001

### P-008 · caja-chica · ALTA · RESPONDIDA
**Contexto:** campos propuestos de GASTOS.
**Pregunta:** ¿Cuáles QUITAS? (sin marcar = se quedan todos)
**Opciones:** fecha, concepto, categoría, monto, método, comprobante, notas · Other
**Recomendación:** quedarse con todos.
**Impacto en datos:** columnas de `gastos`.
**Respuesta:** quita "notas"; Other: "agrega quién recibió el dinero" → confirmado "Entendí: 1) se quita notas 2) se agrega recibio" → D-008

### P-015 · caja-chica · MEDIA · RESPONDIDA
**Contexto:** el SAT pide comprobante para deducir; sin foto no hay evidencia.
**Pregunta:** COMPROBANTE: ¿obligatorio arriba de cierto monto?
**Opciones:** A) Sí, desde $200 B) Siempre C) Nunca
**Recomendación:** A — no frena gastos chicos (hielo, propinas) y protege los grandes.
**Impacto en datos:** CHECK `monto < 200 or comprobante_url is not null`.
**Respuesta:** A → D-015

### P-021 · caja-chica · MEDIA · RESPONDIDA
**Contexto:** el WhatsApp puede fallar (número, servicio caído).
**Pregunta:** Si falla el envío del WhatsApp de saldo bajo, ¿qué hago?
**Opciones:** A) Solo queda el banner en la app B) Reintentar cada hora C) Avisar por correo
**Recomendación:** A — el banner ya avisa a quien esté usando la app.
**Impacto en datos:** ninguno extra.
**Respuesta:** A → D-023
