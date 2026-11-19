-- Nuevos datos fiscales del cliente: dirección fiscal y forma de pago SAT.

alter table public.clientes
  add column if not exists facturama_direccion_fiscal text,
  add column if not exists facturama_forma_pago text;

comment on column public.clientes.facturama_direccion_fiscal
  is 'Dirección fiscal completa del cliente/receptor para facturación.';

comment on column public.clientes.facturama_forma_pago
  is 'Clave SAT de forma de pago preferida del cliente/receptor (ej. 01, 03, 04, 28, 99).';
