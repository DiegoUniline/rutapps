# Plan de construcción — caja-chica
**Aprobado por el dueño:** 2026-11-12 (D-025)

| OT | Qué | Depende de | Listo cuando | Estado |
|---|---|---|---|---|
| OT-001 | Base de datos, seguridad y catálogos iniciales | — | Migración corre en rama; cajero no puede cancelar; 6 categorías creadas | ✅ |
| OT-002 | Saldo disponible y total del día | 001 | Muestra $3,000 − gastos registrados; cancelados no cuentan | ✅ |
| OT-003 | Lista con filtros (Hoy, Mes, Categoría) | 002 | Filtra correcto; paginación de 50; estado vacío | ✅ |
| OT-004 | Formulario de gasto + foto | 003 | Valida todas las reglas (monto, fecha, foto, saldo) | ✅ |
| OT-005 | Detalle, editar y cancelar | 004 | Editar solo el día; cancelar solo dueño con motivo | ✅ |
| OT-006 | Aviso de saldo bajo (banner + WhatsApp) | 002 | Un WhatsApp al cruzar $500; banner ámbar | ✅ |
| OT-007 | Pruebas QA y correcciones | todas | Todas las pruebas ✅ | 👉 en curso |
