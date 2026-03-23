export const productoBasico = {
  id: 'prod-001',
  codigo: 'P001',
  nombre: 'Agua 500ml',
  costo: 5,
  precio_principal: 10,
  tiene_iva: true,
  iva_pct: 16,
  tiene_ieps: false,
  ieps_pct: 0,
  ieps_tipo: 'porcentaje' as const,
  clasificacion_id: 'cat-001',
  cantidad: 100,
};

export const productoConIeps = {
  ...productoBasico,
  id: 'prod-002',
  codigo: 'P002',
  nombre: 'Refresco 600ml',
  costo: 8,
  precio_principal: 15,
  tiene_ieps: true,
  ieps_pct: 8,
};

export const productoSinImpuestos = {
  ...productoBasico,
  id: 'prod-003',
  codigo: 'P003',
  nombre: 'Canasta básica',
  tiene_iva: false,
  iva_pct: 0,
};

export const productoCuota = {
  ...productoBasico,
  id: 'prod-004',
  codigo: 'P004',
  nombre: 'Cerveza 355ml',
  costo: 12,
  precio_principal: 25,
  tiene_ieps: true,
  ieps_pct: 3.5,
  ieps_tipo: 'cuota' as const,
};
