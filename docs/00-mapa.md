# Mapa del sistema — RutApp

SaaS multiempresa (`empresa_id`) de venta en ruta. React + TS + Supabase + PWA offline. Detalle de cada proceso en [04-FLUJOS-DE-NEGOCIO.md](./04-FLUJOS-DE-NEGOCIO.md).

| módulo | doc principal | relacionados |
|---|---|---|
| Catálogo de productos | 04 §1 | precios, inventario, lotes, CFDI |
| Motor de precios / tarifas / listas | 04 §2 | venta, promociones, comisiones |
| Promociones | 04 §3 | precios, venta |
| Venta y pedido | 04 §4 | inventario, cobranza, caja, CFDI, comisiones, ticket |
| Inventario (almacén y camión) | 04 §5 · `.lovable/memory/architecture/inventory-db-triggers.md` | venta, compras, traspasos, mermas, conteos |
| Lotes y caducidad | 04 §6 | inventario, mermas |
| Logística: carga, pedido, entrega, descarga | 04 §7 | inventario camión, venta |
| Cobranza y saldos | 04 §8 | venta, caja, estado de cuenta |
| Ruta móvil (PWA offline) | 04 §9 | todos los anteriores, sincronización |
| Facturación CFDI y suscripciones | 04 §10 | venta, cobranza, billing |
| Reportes, dashboard y control | 04 §11 | todos |
| Canales públicos (catálogo, tienda, cotización, estado de cuenta) | 04 §12 | productos, venta, cobranza |

Esquema: [02](./02-ESQUEMA-BASE-DE-DATOS.md) · Rutas: [03](./03-MAPA-DE-RUTAS.md) · Seguridad/RLS: [05](./05-SEGURIDAD-Y-LLAVES.md) · Arquitectura: [01](./01-ARQUITECTURA.md).
