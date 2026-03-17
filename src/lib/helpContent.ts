import type { HelpSection } from '@/components/HelpButton';

/** Instrucciones contextuales para cada módulo del sistema */

export const HELP = {
  dashboard: {
    title: '¿Cómo usar el Dashboard?',
    sections: [
      { title: '¿Qué es?', content: 'El dashboard muestra un resumen en tiempo real de ventas, cobranza, entregas y stock. Es tu centro de control diario.' },
      { title: 'Filtros de fecha', content: 'Usa los filtros de fecha en la parte superior para ver datos de hoy, esta semana, este mes o un rango personalizado.' },
      { title: 'Indicadores', content: 'Cada tarjeta muestra un KPI clave: ventas totales, cobranza, clientes atendidos, etc. El color indica si el valor está en buen rango o necesita atención.' },
    ] as HelpSection[],
  },

  productos: {
    title: '¿Cómo gestionar Productos?',
    sections: [
      { title: '¿Qué es?', content: 'Aquí administras tu catálogo de productos: precios, costos, stock, impuestos, unidades de medida y más.' },
      { title: 'Crear producto', content: 'Haz clic en "+ Nuevo" para crear un producto. Solo el nombre y código son obligatorios; el sistema genera un código automáticamente si no lo escribes.' },
      { title: 'Importación masiva', content: 'Usa el botón "Importar" para cargar productos desde un archivo Excel (.xlsx) o CSV. Descarga primero la plantilla, llénala y súbela. El sistema crea automáticamente marcas y categorías que no existan.' },
      { title: 'Impuestos', content: 'En la pestaña "Impuestos" del producto puedes activar IVA e IEPS con sus tasas correspondientes.' },
      { title: 'Estado', content: 'Un producto puede estar Activo, Inactivo o Borrador. Solo los activos aparecen en ventas y cargas.' },
    ] as HelpSection[],
  },

  clientes: {
    title: '¿Cómo gestionar Clientes?',
    sections: [
      { title: '¿Qué es?', content: 'Módulo para administrar tu cartera de clientes: datos de contacto, dirección, crédito, zona, vendedor asignado y facturación.' },
      { title: 'Crear cliente', content: 'Haz clic en "+ Nuevo". Solo el nombre es obligatorio. El código se genera automáticamente.' },
      { title: 'Importación masiva', content: 'Usa "Importar" para cargar clientes desde Excel o CSV. Las zonas y vendedores que no existan se crean automáticamente.' },
      { title: 'Crédito', content: 'Activa la opción "Crédito" en el cliente para permitir ventas a crédito con límite y días de crédito.' },
      { title: 'GPS / Ubicación', content: 'Agrega la ubicación GPS del cliente para visualizarlo en el mapa y optimizar rutas de entrega.' },
      { title: 'Facturación', content: 'En la pestaña de facturación puedes configurar el RFC, razón social y datos fiscales del cliente para emitir CFDIs.' },
    ] as HelpSection[],
  },

  ventas: {
    title: '¿Cómo funcionan las Ventas?',
    sections: [
      { title: '¿Qué es?', content: 'Aquí ves todas las ventas y pedidos del sistema. Puedes filtrar por fecha, estado, vendedor y tipo (pedido o venta directa).' },
      { title: 'Nueva venta', content: 'Clic en "+ Nuevo" → selecciona cliente, agrega productos, define cantidades y precios. Puedes elegir entre venta directa (entrega inmediata) o pedido (para programar entrega).' },
      { title: 'Estados', content: 'Borrador → Confirmado → Entregado → Facturado. También puede cancelarse. El estado avanza automáticamente al completar entregas o facturar.' },
      { title: 'Condición de pago', content: 'Contado: se cobra al momento. Crédito: genera cuenta por cobrar con plazo de días.' },
      { title: 'Exportar', content: 'Usa el botón de exportar para descargar la lista en Excel o PDF.' },
    ] as HelpSection[],
  },

  cargas: {
    title: '¿Cómo funcionan las Cargas?',
    sections: [
      { title: '¿Qué es?', content: 'Una carga es el inventario que se sube a un camión o ruta para vender. Controla qué productos lleva cada vendedor.' },
      { title: 'Crear carga', content: 'Clic en "+ Nuevo" → selecciona almacén origen, vendedor destino y agrega los productos con sus cantidades.' },
      { title: 'Flujo', content: 'Pendiente → En ruta → Completada. Al confirmar la carga, el stock se mueve del almacén al vendedor.' },
      { title: 'Pedidos incluidos', content: 'Puedes incluir pedidos pendientes en la carga para que el vendedor los entregue en ruta.' },
    ] as HelpSection[],
  },

  inventario: {
    title: '¿Cómo funciona el Inventario?',
    sections: [
      { title: '¿Qué es?', content: 'Vista consolidada del stock por almacén y por ruta/vendedor. Muestra las existencias actuales de todos los productos.' },
      { title: 'Columnas', content: 'Almacén: stock en bodega. Rutas: stock en camión de cada vendedor. Total: suma de todo.' },
      { title: 'Búsqueda', content: 'Filtra por código o nombre de producto para encontrar rápidamente lo que buscas.' },
    ] as HelpSection[],
  },

  ajustesInventario: {
    title: '¿Cómo hacer Ajustes de Inventario?',
    sections: [
      { title: '¿Qué es?', content: 'Permite corregir el stock del sistema cuando no coincide con el conteo físico. Puedes hacerlo producto por producto o de forma masiva con un archivo Excel.' },
      { title: 'Ajuste manual', content: '1. Selecciona un almacén\n2. Busca el producto\n3. Escribe la cantidad real en la columna "Cantidad real"\n4. Indica un motivo\n5. Clic en "Aplicar ajustes"' },
      { title: 'Ajuste masivo con plantilla', content: '1. Selecciona almacén\n2. Clic en "Descargar plantilla" → se descarga un Excel con los productos y su stock actual\n3. Llena la columna "Cantidad nueva" con lo que contaste\n4. Clic en "Cargar archivo" y sube el Excel\n5. Revisa los cambios y clic en "Aplicar ajustes"' },
      { title: 'Reiniciar a ceros', content: 'El botón rojo "Reiniciar a ceros" pone TODO el stock en 0. Útil para inicio de operaciones o cierre de ejercicio. Se registra quién lo hizo y por qué.' },
      { title: 'Historial', content: 'La pestaña "Historial" muestra todos los ajustes realizados con fecha, producto, cantidades anteriores/nuevas y motivo.' },
    ] as HelpSection[],
  },

  traspasos: {
    title: '¿Cómo funcionan los Traspasos?',
    sections: [
      { title: '¿Qué es?', content: 'Un traspaso mueve productos de un almacén a otro, o de un almacén a una ruta. Genera movimientos de inventario automáticos.' },
      { title: 'Crear traspaso', content: '1. Clic en "+ Nuevo"\n2. Selecciona almacén origen y destino\n3. Agrega productos y cantidades\n4. Confirma el traspaso' },
      { title: 'Validación', content: 'El sistema valida que haya suficiente stock en el almacén origen antes de confirmar.' },
    ] as HelpSection[],
  },

  auditorias: {
    title: '¿Cómo funcionan las Auditorías?',
    sections: [
      { title: '¿Qué es?', content: 'Una auditoría es un conteo físico formal con flujo de aprobación. Permite comparar el stock del sistema con el conteo real y aprobar/rechazar diferencias.' },
      { title: 'Flujo', content: '1. Crear auditoría → seleccionar almacén y filtros\n2. Realizar conteo físico (interfaz tipo carrito)\n3. Revisar resultados y diferencias\n4. Aprobar o rechazar ajustes selectivamente' },
      { title: 'Diferencia con Ajuste', content: 'El ajuste es rápido y directo. La auditoría es un proceso formal con supervisión y aprobación.' },
    ] as HelpSection[],
  },

  cobranza: {
    title: '¿Cómo funciona la Cobranza?',
    sections: [
      { title: '¿Qué es?', content: 'Módulo para registrar cobros de clientes y aplicarlos a ventas pendientes de pago.' },
      { title: 'Registrar cobro', content: '1. Selecciona el cliente\n2. Ingresa el monto cobrado\n3. Elige método de pago (efectivo, transferencia, etc.)\n4. El sistema aplica el cobro automáticamente a las ventas pendientes más antiguas' },
      { title: 'Saldo', content: 'Cada venta a crédito tiene un saldo pendiente que se reduce con los cobros aplicados.' },
    ] as HelpSection[],
  },

  cuentasCobrar: {
    title: '¿Cómo ver Cuentas por Cobrar?',
    sections: [
      { title: '¿Qué es?', content: 'Vista de todas las ventas a crédito con saldo pendiente. Muestra el monto total adeudado por cliente, días de antigüedad y fechas de vencimiento.' },
      { title: 'Filtros', content: 'Filtra por cliente, vendedor, rango de fechas o antigüedad del adeudo.' },
      { title: 'Acciones', content: 'Desde aquí puedes ver el detalle de cada venta, registrar un cobro o enviar un recordatorio por WhatsApp.' },
    ] as HelpSection[],
  },

  cuentasPagar: {
    title: '¿Cómo ver Cuentas por Pagar?',
    sections: [
      { title: '¿Qué es?', content: 'Vista de todas las compras a crédito con saldo pendiente hacia tus proveedores.' },
      { title: 'Registrar pago', content: 'Selecciona la compra y registra el pago parcial o total con método de pago y referencia.' },
    ] as HelpSection[],
  },

  gastos: {
    title: '¿Cómo registrar Gastos?',
    sections: [
      { title: '¿Qué es?', content: 'Registro de gastos operativos: gasolina, peajes, comidas, reparaciones, etc. Cada gasto se asocia a un vendedor y fecha.' },
      { title: 'Crear gasto', content: 'Clic en "+ Nuevo" → llena concepto, monto, fecha y opcionalmente una foto del comprobante.' },
      { title: 'Desde ruta', content: 'Los vendedores en ruta también pueden registrar gastos desde la app móvil, que se sincronizan automáticamente.' },
    ] as HelpSection[],
  },

  comisiones: {
    title: '¿Cómo funcionan las Comisiones?',
    sections: [
      { title: '¿Qué es?', content: 'Cálculo automático de comisiones por vendedor basado en las ventas realizadas en un período.' },
      { title: 'Configuración', content: 'Las comisiones se configuran a nivel de producto: tipo (porcentaje o monto fijo) y valor. Solo aplican a productos que tengan comisión activada.' },
      { title: 'Corte', content: 'Selecciona un período y vendedor para calcular el total de comisiones. Puedes registrar el pago de comisiones.' },
    ] as HelpSection[],
  },

  reportes: {
    title: '¿Cómo usar los Reportes?',
    sections: [
      { title: '¿Qué es?', content: 'Panel de reportes con métricas de ventas, productos más vendidos, rendimiento por vendedor, clientes top, cargas y más.' },
      { title: 'Filtros', content: 'Todos los reportes se filtran por rango de fechas. Algunos permiten filtrar por vendedor o almacén.' },
      { title: 'Exportar', content: 'Cada reporte tiene opción de exportar a Excel o PDF.' },
    ] as HelpSection[],
  },

  compras: {
    title: '¿Cómo funcionan las Compras?',
    sections: [
      { title: '¿Qué es?', content: 'Registro de compras a proveedores. Al confirmar una compra, el stock se incrementa automáticamente en el almacén seleccionado.' },
      { title: 'Crear compra', content: '1. Clic en "+ Nuevo"\n2. Selecciona proveedor y almacén\n3. Agrega productos con cantidad y precio de compra\n4. Confirma para actualizar el inventario' },
      { title: 'Crédito', content: 'Las compras a crédito generan una cuenta por pagar con plazo en días.' },
    ] as HelpSection[],
  },

  tarifas: {
    title: '¿Cómo funcionan las Tarifas?',
    sections: [
      { title: '¿Qué es?', content: 'Las tarifas permiten manejar precios diferenciados por cliente, ruta o grupo de productos. Cada tarifa define reglas de cálculo de precios.' },
      { title: 'Tipos', content: 'General: aplica a todos. Por cliente: precio especial para un cliente. Por ruta: precios para una zona.' },
      { title: 'Líneas de tarifa', content: 'Cada tarifa tiene líneas que definen: a qué productos aplica, tipo de cálculo (margen sobre costo, descuento sobre precio o precio fijo) y valores.' },
    ] as HelpSection[],
  },

  configuracion: {
    title: '¿Cómo configurar mi empresa?',
    sections: [
      { title: '¿Qué es?', content: 'Configuración general de tu empresa: nombre, RFC, dirección, logo, datos que aparecen en tickets y documentos impresos.' },
      { title: 'Logo', content: 'Sube el logo de tu empresa para que aparezca en tickets, PDFs y facturas.' },
      { title: 'Ticket', content: 'Configura qué datos mostrar en los tickets de venta: nombre, RFC, dirección, teléfono, notas al pie, etc.' },
    ] as HelpSection[],
  },

  usuarios: {
    title: '¿Cómo gestionar Usuarios?',
    sections: [
      { title: '¿Qué es?', content: 'Administración de usuarios del sistema: crear cuentas, asignar roles y permisos, vincular a vendedores y almacenes.' },
      { title: 'Crear usuario', content: 'Invita un nuevo usuario con su correo. Se le enviará un enlace para establecer contraseña.' },
      { title: 'Roles y permisos', content: 'Cada usuario tiene un rol que define qué módulos puede ver y qué acciones puede realizar (ver, crear, editar, eliminar).' },
      { title: 'Acceso a ruta', content: 'Activa "Acceso a ruta móvil" en el rol para que el usuario pueda usar la app de vendedor en campo.' },
    ] as HelpSection[],
  },

  lotes: {
    title: '¿Cómo funcionan los Lotes?',
    sections: [
      { title: '¿Qué es?', content: 'Control de lotes para productos con trazabilidad: fecha de producción, caducidad y cantidad por lote.' },
      { title: 'Requisito', content: 'El producto debe tener activada la opción "Manejar lotes" para poder registrar lotes.' },
      { title: 'Crear lote', content: 'Clic en "+ Nuevo" → selecciona producto, almacén, número de lote, fechas y cantidad.' },
    ] as HelpSection[],
  },

  entregas: {
    title: '¿Cómo funcionan las Entregas?',
    sections: [
      { title: '¿Qué es?', content: 'Las entregas son el surtido y despacho de pedidos a clientes. Se generan automáticamente al confirmar un pedido o se pueden crear manualmente.' },
      { title: 'Flujo', content: 'Borrador → Asignada → Cargada → En camino → Entregada. El estado avanza conforme se prepara y envía la mercancía.' },
      { title: 'Asignar ruta', content: 'Asigna la entrega a un vendedor/repartidor para que aparezca en su app de ruta.' },
    ] as HelpSection[],
  },

  descargas: {
    title: '¿Cómo funcionan las Descargas de Ruta?',
    sections: [
      { title: '¿Qué es?', content: 'La descarga de ruta es el proceso de verificar qué regresó el vendedor al almacén: producto sobrante, efectivo cobrado y diferencias.' },
      { title: 'Proceso', content: '1. El vendedor termina su ruta\n2. Se crea la descarga vinculada a su carga\n3. Se cuentan los productos devueltos\n4. Se registra el efectivo entregado\n5. El supervisor aprueba o rechaza' },
      { title: 'Diferencias', content: 'Si hay diferencias en producto o efectivo, se registran con motivo para auditoría.' },
    ] as HelpSection[],
  },

  facturacion: {
    title: '¿Cómo funciona la Facturación?',
    sections: [
      { title: '¿Qué es?', content: 'Módulo para emitir CFDIs (facturas electrónicas) timbradas ante el SAT. Requiere configurar datos fiscales del emisor.' },
      { title: 'Configuración inicial', content: '1. Configura los datos del emisor: RFC, razón social, régimen fiscal y código postal\n2. Sube los certificados CSD (archivo .cer y .key) con su contraseña' },
      { title: 'Emitir factura', content: '1. Crea un nuevo CFDI\n2. Selecciona el cliente (debe tener datos fiscales)\n3. Agrega las líneas a facturar (puedes vincular a ventas)\n4. Clic en "Timbrar" para emitir ante el SAT' },
      { title: 'Cancelar', content: 'Las facturas timbradas se pueden cancelar ante el SAT desde el botón "Cancelar CFDI".' },
    ] as HelpSection[],
  },

  catalogos: {
    title: '¿Cómo funcionan los Catálogos?',
    sections: [
      { title: '¿Qué es?', content: 'Los catálogos son listas de referencia que se usan en todo el sistema: marcas, categorías, proveedores, unidades de medida, tasas de impuestos, listas de precios y almacenes.' },
      { title: 'Editar', content: 'Haz clic en cualquier valor para editarlo directamente en la tabla. Los cambios se guardan automáticamente.' },
      { title: 'Agregar', content: 'Usa la fila vacía al final de la tabla para agregar nuevos registros.' },
      { title: 'Eliminar', content: 'Clic en el ícono de basura para eliminar. No se pueden eliminar registros que estén en uso por productos, clientes u otras tablas.' },
    ] as HelpSection[],
  },

  whatsapp: {
    title: '¿Cómo configurar WhatsApp?',
    sections: [
      { title: '¿Qué es?', content: 'Integración para enviar tickets, facturas, estados de cuenta y recordatorios de cobro directamente por WhatsApp a tus clientes.' },
      { title: 'Configuración', content: 'Configura el número de WhatsApp Business y la API key para habilitar el envío automático.' },
      { title: 'Uso', content: 'Desde cualquier documento (venta, factura, estado de cuenta) puedes usar el botón de WhatsApp para enviarlo al cliente.' },
    ] as HelpSection[],
  },

  promociones: {
    title: '¿Cómo funcionan las Promociones?',
    sections: [
      { title: '¿Qué es?', content: 'Define promociones y descuentos especiales para tus productos: descuento por volumen, 2x1, precios especiales por tiempo limitado, etc.' },
      { title: 'Crear promoción', content: 'Define nombre, productos que aplican, tipo de descuento, vigencia y condiciones.' },
      { title: 'En ventas', content: 'Las promociones activas se aplican automáticamente al agregar productos en la venta si cumplen las condiciones.' },
    ] as HelpSection[],
  },

  mapa: {
    title: '¿Cómo usar el Mapa?',
    sections: [
      { title: '¿Qué es?', content: 'Visualización geográfica de clientes, rutas y ventas en un mapa interactivo.' },
      { title: 'Mapa de clientes', content: 'Muestra la ubicación de todos los clientes con GPS registrado. Puedes filtrar por zona o vendedor.' },
      { title: 'Mapa de ventas', content: 'Muestra dónde se han realizado ventas en un período, con indicadores de monto.' },
      { title: 'Rutas', content: 'Visualiza las rutas asignadas y optimiza el orden de visitas.' },
    ] as HelpSection[],
  },
} as const;
