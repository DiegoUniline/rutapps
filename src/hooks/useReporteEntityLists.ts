import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/supabasePaginate';
import type { MSOption } from '@/components/reportes/EntityMultiSelect';

interface EntityListsResult {
  clientes: MSOption[];
  vendedores: MSOption[];
  cobradores: MSOption[];
  almacenes: MSOption[];
  proveedores: MSOption[];
  zonas: MSOption[];
  categorias: MSOption[];
  marcas: MSOption[];
  listasPrecio: MSOption[];
}

export const METODOS_PAGO: MSOption[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'deposito', label: 'Depósito' },
];

export const CONDICIONES_PAGO: MSOption[] = [
  { id: 'contado', label: 'Contado' },
  { id: 'credito', label: 'Crédito' },
];

export function useReporteEntityLists(empresaId?: string, enabled = true) {
  return useQuery<EntityListsResult>({
    queryKey: ['reportes-entity-lists', empresaId],
    enabled: !!empresaId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [clientes, profiles, almacenes, proveedores, zonas, categorias, marcas, tarifas] = await Promise.all([
        fetchAllPages<any>((from, to) =>
          supabase.from('clientes').select('id, codigo, nombre').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase.from('profiles').select('id, nombre, estado').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase.from('proveedores').select('id, nombre, rfc').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase.from('zonas').select('id, nombre').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase.from('marcas').select('id, nombre').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
        fetchAllPages<any>((from, to) =>
          supabase.from('tarifas').select('id, nombre').eq('empresa_id', empresaId!).order('nombre').range(from, to)),
      ]);
      const profOpts: MSOption[] = profiles.map(p => ({ id: p.id, label: p.nombre || '—' }));
      return {
        clientes: clientes.map(c => ({ id: c.id, label: c.nombre, sub: c.codigo ?? undefined })),
        vendedores: profOpts,
        cobradores: profOpts,
        almacenes: almacenes.map(a => ({ id: a.id, label: a.nombre })),
        proveedores: proveedores.map(p => ({ id: p.id, label: p.nombre, sub: p.rfc ?? undefined })),
        zonas: zonas.map(z => ({ id: z.id, label: z.nombre })),
        categorias: categorias.map(c => ({ id: c.id, label: c.nombre })),
        marcas: marcas.map(m => ({ id: m.id, label: m.nombre })),
        listasPrecio: tarifas.map(t => ({ id: t.id, label: t.nombre })),
      };
    },
  });
}
