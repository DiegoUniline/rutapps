export const clienteContado = {
  id: 'cli-001',
  nombre: 'Tienda Don Juan',
  codigo: 'C001',
  empresa_id: 'emp-001',
  credito: false,
  limite_credito: 0,
  dias_credito: 0,
  telefono: '5551234567',
  email: 'donjuan@test.com',
  status: 'activo' as const,
};

export const clienteCredito = {
  ...clienteContado,
  id: 'cli-002',
  nombre: 'Abarrotes María',
  codigo: 'C002',
  credito: true,
  limite_credito: 50000,
  dias_credito: 30,
};

export const clienteInactivo = {
  ...clienteContado,
  id: 'cli-003',
  nombre: 'Tienda Cerrada',
  codigo: 'C003',
  status: 'inactivo' as const,
};
