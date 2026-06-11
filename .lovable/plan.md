## Reorganización del sidebar (propuesta Claude)

Reordeno los grupos del sidebar para que cada entrada del menú sea **una vista única** y las pestañas internas vivan dentro de esa vista (no como ítems sueltos). Sólo toco `src/components/AppLayout.tsx` (navegación). **No se mueven rutas ni se borran páginas**; sólo se reordena y se ocultan duplicados del menú.

### Estructura final del sidebar

```text
Dashboard
Supervisor

Ventas
  ├─ Todas las ventas         /ventas
  ├─ Cobranza · CxC · Saldos  /ventas/cobranza         (badge "absorbido": CxC, Saldos)
  ├─ Promociones              /ventas/promociones
  ├─ Devoluciones             /ventas/devoluciones
  ├─ Liquidar ruta            /almacen/descargas
  └─ Comisiones               /comisiones              (badge "absorbido")

Punto de venta
  ├─ Abrir caja (POS)         /pos
  └─ Caja                     /pos/admin?tab=turnos    (badge: Turnos · Cortes · Depósitos · Retiros · Gastos)

Compras
  ├─ Órdenes de compra        /almacen/compras
  ├─ Compras sugeridas        /almacen/compras/sugeridas
  ├─ Pagos                    /finanzas/por-pagar      (badge: CxP · Pagos · Saldos proveedor)
  └─ Proveedores              /proveedores

Logística
  ├─ Pedidos                  /logistica/pedidos       (badge: Pendientes · Entregas)
  ├─ Jornadas de ruta         /logistica/jornadas
  ├─ Mapa                     /ventas/mapa-clientes    (toggle clientes/entregas dentro)
  └─ Reportes                 /logistica/reportes

Almacén
  ├─ Inventario               /almacen/inventario
  ├─ Inteligencia             /almacen/inteligencia
  ├─ Traspasos                /almacen/traspasos
  ├─ Control                  /almacen/ajustes         (badge: Ajustes · Conteos · Auditorías · Mermas)
  └─ Almacenes                /almacen/almacenes

Finanzas
  ├─ Aplicar pagos clientes   /finanzas/aplicar-pagos
  └─ Gastos                   /finanzas/gastos

Reportes                      /reportes                (badge: Generales · Personalizados)

──────────────────────────────
Configuración
  ├─ Catálogo (Categorías, Marcas, Unidades, Zonas)  /catalogos/clasificaciones
  ├─ Control (auditoría)                              /control
  └─ Administración (Usuarios, Metas, Vehículos,
                     Homologación, Saldos iniciales,
                     WhatsApp, General, Suscripción,
                     Tutoriales)                       /administracion/usuarios

Ayuda · Soporte               /soporte
Panel master                  /super-admin (solo super admin)
```

### Cambios concretos

1. **Ventas**: colapsa `Cuentas por cobrar` y `Saldos por cliente` dentro de `Cobranza · CxC · Saldos` (los ítems sueltos desaparecen del menú; las rutas siguen vivas). Quitar `Reporte diario` del sidebar (se accede desde Reportes).
2. **POS**: deja sólo `Abrir caja` y `Caja` (los 5 sub-items se convierten en tabs internos de la vista `/pos/admin`, que ya los soporta).
3. **Compras**: condensar las 3 entradas de finanzas-proveedor en una sola `Pagos`. Quitar `Productos` (vive en su propio acceso).
4. **Logística**: condensar `Pendientes` + `Entregas` en `Pedidos`. Unificar los dos mapas en `Mapa` (toggle dentro de la vista).
5. **Almacén**: agrupar Ajustes/Conteos/Auditorías/Mermas en una entrada `Control` (la vista expone tabs).
6. **Catálogo**: pasa a vivir bajo Configuración (es CRUD que se toca una vez).
7. **Comisiones**: se mantiene como entrada de Ventas. Los 7 sub-items actuales (`Avance`, `Generadas`, `Por volumen`, `Por pagar`, `Recibos`, `Esquemas`, `Reglas`) ya viven dentro de la vista `/comisiones`. **Esquemas y Reglas se quitan del sidebar** y se acceden desde un botón "Configurar" dentro de la vista (o desde Configuración → Comisiones más adelante).
8. **Configuración**: nueva sección "footer" del sidebar con 3 entradas (Catálogo, Control, Administración) — Administración mantiene todo el contenido que ya tiene.
9. **Badges "absorbido"**: chip verde junto a entradas que ahora contienen tabs antes sueltos (Cobranza, Caja, Pagos, Pedidos, Control almacén). Visible 2–4 semanas para reeducar.

### Alcance técnico

- Edito **únicamente** el array `navItems` y la sección final del sidebar en `src/components/AppLayout.tsx`.
- No toco rutas, hooks, ni componentes de página.
- No borro código ni archivos. Si quieres revertir basta con `View History`.

### Lo que NO incluyo en este paso

- Implementar los tabs internos nuevos que aún no existen (ej. tab Mapa con toggle, tab Pagos en Compras). Hoy las páginas individuales ya existen y abrirán la primera por defecto; los tabs se construyen después si te gusta el menú.
- Mover Esquemas/Reglas dentro de Configuración como vista (sólo los saco del sidebar, la ruta `/comisiones/esquemas` sigue funcionando).

### Si no te convence

Puedes revertir esta conversación con el botón de revertir abajo del mensaje, o desde el historial:

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
