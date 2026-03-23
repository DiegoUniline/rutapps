export const ventaBorrador = {
  id: 'vta-001',
  folio: 'V-001',
  empresa_id: 'emp-001',
  cliente_id: 'cli-001',
  vendedor_id: 'vend-001',
  fecha: '2026-03-23',
  status: 'borrador',
  condicion_pago: 'contado',
  subtotal: 100,
  iva_total: 16,
  total: 116,
  saldo_pendiente: 116,
  notas: '',
};

export const ventaLineas = [
  {
    id: 'vl-001',
    venta_id: 'vta-001',
    producto_id: 'prod-001',
    cantidad: 10,
    precio_unitario: 10,
    subtotal: 100,
    iva_monto: 16,
    total: 116,
    descuento_pct: 0,
  },
];

export const ventaConfirmada = {
  ...ventaBorrador,
  id: 'vta-002',
  folio: 'V-002',
  status: 'confirmado',
  saldo_pendiente: 0,
};
