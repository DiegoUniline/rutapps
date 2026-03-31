import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { usePermisos } from '@/hooks/usePermisos';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { StatusChip } from '@/components/StatusChip';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 50;

export default function ProveedoresListPage() {
  const navigate = useNavigate();
  const { hasPermiso } = usePermisos();
  const canCreate = hasPermiso('catalogo.proveedores', 'crear');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: proveedores, isLoading } = useQuery({
    queryKey: ['proveedores-full', search],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase.from('proveedores')
        .select('id, nombre, contacto, telefono, email, ciudad, estado, condicion_pago, status')
        .order('nombre');
      if (search) q = q.or(`nombre.ilike.%${search}%,contacto.ilike.%${search}%,email.ilike.%${search}%,telefono.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const total = proveedores?.length ?? 0;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = proveedores?.slice(from - 1, to) ?? [];

  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Proveedores</h1>
        <button onClick={() => navigate('/proveedores/nuevo')} className="btn-odoo-primary flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar proveedor..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input-odoo pl-8 w-full"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Nombre</th>
                <th className="th-odoo text-left">Contacto</th>
                <th className="th-odoo text-left">Teléfono</th>
                <th className="th-odoo text-left">Email</th>
                <th className="th-odoo text-left">Ciudad</th>
                <th className="th-odoo text-left">Pago</th>
                <th className="th-odoo text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map(p => (
                <tr
                  key={p.id}
                  className="border-b border-table-border last:border-0 hover:bg-table-hover cursor-pointer transition-colors"
                  onClick={() => navigate(`/proveedores/${p.id}`)}
                >
                  <td className="py-2 px-3 font-medium text-foreground">{p.nombre}</td>
                  <td className="py-2 px-3 text-muted-foreground">{p.contacto ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{p.telefono ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{p.email ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {[p.ciudad, p.estado].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground capitalize">{p.condicion_pago ?? 'contado'}</td>
                  <td className="py-2 px-3 text-center">
                    <StatusChip status={p.status ?? 'activo'} />
                  </td>
                </tr>
              ))}
              {pageData.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Sin proveedores</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGE_SIZE && (
        <OdooPagination from={from} to={to} total={total}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => p + 1)} />
      )}
    </div>
  );
}
