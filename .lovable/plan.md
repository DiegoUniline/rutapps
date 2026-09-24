# Restaurar encabezado y doble columna en el concentrado

## Objetivo
Recuperar el formato anterior del PDF de **Concentrado / Hoja de surtido**, manteniendo intactos los cálculos y filtros actuales.

## Cambios
- Restaurar en el encabezado de cada grupo:
  - empresa y logo;
  - rango y tipo de fecha;
  - filtros aplicados;
  - cantidad de pedidos y productos;
  - tipo de cantidad mostrada (requerido o pendiente);
  - folios de los pedidos;
  - espacios para **Recibe** y **Fecha**.
- Distribuir la lista de productos en **dos columnas por página** para aprovechar mejor la hoja, conservando número, producto, cantidad requerida/pendiente y espacio de entrega.
- Repetir el encabezado al continuar en páginas adicionales y conservar una página nueva por grupo.
- Cuando los folios no quepan en el encabezado, enviarlos a un listado final del grupo para evitar recortes.
- Restaurar también en Excel los datos de encabezado que fueron retirados, sin alterar sus cantidades.

## Verificación
- Actualizar las pruebas del PDF y Excel para validar encabezado, doble columna, folios largos, decimales y varias páginas.
- Ejecutar la revisión de tipos y las pruebas específicas del concentrado.
