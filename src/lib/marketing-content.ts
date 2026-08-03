import {
  ShoppingCart, Users, Package, Wallet, Truck, CreditCard, FileText, Award, Brain, LineChart,
} from 'lucide-react';

export const BRAND = {
  primary: '#0060e8',
  primarySoft: '#e6efff',
  accent: '#fe8c1a',
  ink: '#0a1530',
  ink2: '#3b4863',
  muted: '#6b7791',
  line: '#eef0f5',
  surface: '#f7f8fb',
};

export type Module = {
  slug: string;
  icon: any;
  t: string;
  d: string;
  star: { t: string; d: string };
  features: string[];
  why: string;
};

export const MODULES: Module[] = [
  {
    slug: 'ventas', icon: ShoppingCart, t: 'Ventas', d: 'POS, preventa y pedidos',
    star: { t: 'Rutero de preventa', d: 'Cada vendedor abre su ruta del día y captura pedidos en segundos: producto sugerido por cliente, precios y promociones aplicadas automáticamente.' },
    features: ['POS con búsqueda por código de barras','Preventa con pedidos sugeridos por cliente','Venta directa con entrega inmediata','Promociones nxm y % acumulables','Listas de precios por cliente o zona','Crédito con validación en tiempo real'],
    why: 'El vendedor deja de improvisar: ve qué pide normalmente cada cliente, qué dejó de comprar y a qué precio.',
  },
  {
    slug: 'cobranza', icon: Wallet, t: 'Cobranza', d: 'FIFO y multi-folio',
    star: { t: 'Cobro multi-folio FIFO', d: 'Un solo pago aplica automáticamente a las facturas más viejas. El recibo se imprime térmico o se manda por WhatsApp al instante.' },
    features: ['Aplicación FIFO automática','Múltiples folios en un mismo cobro','Recibos térmicos y por WhatsApp','Liquidación de ruta con efectivo esperado','Saldo anterior y nuevo en cada documento','Cancelación con desligado de aplicaciones'],
    why: 'Cero confusión sobre qué se pagó. El cobrador no decide a mano qué aplicar.',
  },
  {
    slug: 'inventario', icon: Package, t: 'Inventario', d: 'Multi-almacén · Kardex',
    star: { t: 'Kardex granular en vivo', d: 'Cada movimiento (venta, compra, traspaso, ajuste) queda registrado con folio, hora y usuario. Auditas el stock minuto a minuto.' },
    features: ['Múltiples almacenes con stock independiente','Traspasos con bloqueo de fila','Conteos físicos con reconciliación','Productos a granel (3 decimales)','Presentaciones (caja, paquete, pieza)','Permitir venta con stock negativo (opcional)'],
    why: 'Sabes en qué almacén, en qué camión y desde cuándo está cada unidad.',
  },
  {
    slug: 'logistica', icon: Truck, t: 'Logística', d: 'Cargas, surtido y rutas',
    star: { t: 'Surtido de pedidos', d: 'El bodeguero ve el concentrado del día: cuánto producto sale total, por ruta, por vendedor. Carga el camión con la cantidad exacta y descuenta del almacén automáticamente.' },
    features: ['Concentrado de surtido por día y ruta','Orden de carga con confirmación','Descarga con diferencias y motivos','Optimización de ruta con GPS (vecino + 2-opt)','Entrega con firma y foto','Liquidación inmutable al cierre de ruta'],
    why: 'El camión sale con lo justo. Las diferencias quedan documentadas con motivo.',
  },
  {
    slug: 'compras', icon: CreditCard, t: 'Compras', d: 'Órdenes y proveedores',
    star: { t: 'Compras sugeridas con IA', d: 'El sistema analiza venta histórica, stock mínimo, días de cobertura y tiempo de entrega del proveedor. Te dice qué pedir, cuánto y a quién — listo para enviar la orden.' },
    features: ['Sugerencias de compra por IA','Órdenes a proveedores con recepción parcial','Pagos a proveedores con FIFO','Cuentas por pagar y estado de cuenta','Costos con o sin impuestos','Proveedor preferido por producto'],
    why: 'Dejas de comprar de más o quedarte sin producto los días pico.',
  },
  {
    slug: 'clientes', icon: Users, t: 'Clientes', d: 'CRM con historial',
    star: { t: 'Ficha 360° del cliente', d: 'Ves su historial de compras, saldo, última visita, ubicación GPS, productos que más pide y los que dejó de comprar. Todo en una pantalla.' },
    features: ['Alta con GPS y foto de fachada','Frecuencia y día de visita','Límite y días de crédito','Pedido sugerido por cliente','Estado de cuenta público (link)','Catálogo compartible por WhatsApp'],
    why: 'Cada cliente es una ficha viva, no una fila en Excel.',
  },
  {
    slug: 'finanzas', icon: LineChart, t: 'Finanzas', d: 'CxC · CxP · Gastos',
    star: { t: 'Estado de cuenta en tiempo real', d: 'Por cliente, por proveedor, por vendedor: saldo anterior, movimientos y saldo nuevo. Auditable y exportable.' },
    features: ['Cuentas por cobrar y por pagar','Gastos con foto del ticket','Multimoneda con conversión automática','Saldos iniciales sin afectar inventario','Reportes contables exportables','Caja y turnos con corte'],
    why: 'Sabes cuánto te deben, cuánto debes y cuánto entró hoy — sin esperar al contador.',
  },
  {
    slug: 'comisiones', icon: Award, t: 'Comisiones', d: 'Reglas por vendedor',
    star: { t: 'Comisiones por producto y meta', d: 'Define % por producto, por categoría o por meta cumplida. El sistema calcula la comisión por venta cobrada (no facturada).' },
    features: ['Comisión por producto o categoría','Calculada sobre venta cobrada','Metas mensuales por vendedor','Reporte de seguimiento de metas','Esquemas por equipo','Visible para el vendedor en su app'],
    why: 'El vendedor sabe qué empujar y cuánto va a ganar en tiempo real.',
  },
  {
    slug: 'reportes', icon: FileText, t: 'Reportes', d: 'Operativos y auditables',
    star: { t: 'Control y auditoría', d: 'Detecta descuentos excesivos, ventas bajo costo, anomalías de cobro y vendedores inactivos. El dueño deja de auditar a mano.' },
    features: ['Dashboard supervisor con 8 KPIs','Reporte diario consolidado','Detalle por producto y por vendedor','Control de fraude y descuentos','Exportable a Excel y PDF','Filtros avanzados multi-criterio'],
    why: 'Auditas en segundos lo que antes tardaba días.',
  },
  {
    slug: 'ia', icon: Brain, t: 'IA', d: 'Asesor inteligente',
    star: { t: 'Asesor Rutapp IA', d: 'Analiza tu operación todos los días y te suelta acciones concretas: qué comprar, qué cliente está en riesgo, qué vendedor destaca y qué movimientos son sospechosos.' },
    features: ['Sugerencias de reposición de stock','Detección de clientes en riesgo de fuga','Identificación de vendedores destacados','Anomalías en ventas y cobros','Predicción de demanda','Resumen diario accionable'],
    why: 'Tienes un analista trabajando 24/7 sin contratarlo.',
  },
];

export const CURRENCIES = [
  { code: 'MXN', label: '🇲🇽 Peso mexicano',   symbol: '$',   rate: 1,       locale: 'es-MX', decimals: 0 },
  { code: 'USD', label: '🇺🇸 Dólar (USD)',      symbol: '$',   rate: 0.055,   locale: 'en-US', decimals: 2 },
  { code: 'EUR', label: '🇪🇺 Euro',             symbol: '€',   rate: 0.051,   locale: 'es-ES', decimals: 2 },
  { code: 'GTQ', label: '🇬🇹 Quetzal',          symbol: 'Q',   rate: 0.43,    locale: 'es-GT', decimals: 2 },
  { code: 'CLP', label: '🇨🇱 Peso chileno',     symbol: '$',   rate: 51,      locale: 'es-CL', decimals: 0 },
  { code: 'ARS', label: '🇦🇷 Peso argentino',   symbol: '$',   rate: 55,      locale: 'es-AR', decimals: 0 },
  { code: 'COP', label: '🇨🇴 Peso colombiano',  symbol: '$',   rate: 230,     locale: 'es-CO', decimals: 0 },
  { code: 'PEN', label: '🇵🇪 Sol peruano',      symbol: 'S/',  rate: 0.20,    locale: 'es-PE', decimals: 2 },
  { code: 'BOB', label: '🇧🇴 Boliviano',        symbol: 'Bs',  rate: 0.38,    locale: 'es-BO', decimals: 2 },
];

export const fmtCur = (mxn: number, c: typeof CURRENCIES[number]) => {
  const v = mxn * c.rate;
  return `${c.symbol}${v.toLocaleString(c.locale, { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals })}`;
};

export const PLANS = [
  { slug: 'individual', name: 'Individual', price: 450, users: 1, popular: false, capacitacion: '30 min de capacitación al contratar' },
  { slug: 'equipo', name: 'Equipo', price: 900, users: 3, popular: true, capacitacion: '1 hora de capacitación al contratar' },
  { slug: 'empresa', name: 'Empresa', price: 1500, users: 5, popular: false, capacitacion: '2 horas de capacitación al contratar' },
];

export const GIROS = [
  { slug: 'abarrotes', t: 'Abarrotes', d: 'Distribuidoras de abarrotes con preventa, ruta y crédito.' },
  { slug: 'refresqueras', t: 'Refresqueras', d: 'Refrescos, aguas y bebidas con entrega inmediata y envases.' },
  { slug: 'panaderias', t: 'Panaderías', d: 'Reparto de pan a tiendas con devolución y caducidad.' },
  { slug: 'limpieza', t: 'Limpieza', d: 'Productos de limpieza por mayoreo con listas por cliente.' },
  { slug: 'lacteos', t: 'Lácteos', d: 'Distribución de lácteos en frío con caducidades cortas.' },
  { slug: 'botanas', t: 'Botanas', d: 'Botanas y frituras con preventa y reparto diario.' },
  { slug: 'agua', t: 'Agua purificada', d: 'Garrafones y envases retornables con saldo de envase.' },
];
