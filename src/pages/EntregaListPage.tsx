import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Search, Plus, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SearchableSelect from '@/components/SearchableSelect';
import { useEntregasList, useVendedoresList } from '@/hooks/useEntregas';
import { fmtDate, cn } from '@/lib/utils';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  listo: { label: 'Listo', variant: 'default' },
  hecho: { label: 'Hecho', variant: 'outline' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
};

export default function EntregaListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  const { data: entregas, isLoading } = useEntregasList(search, vendedorFilter, statusFilter);
  const { data: vendedores } = useVendedoresList();

  const counts = {
    total: entregas?.length ?? 0,
    borrador: entregas?.filter(e => (e as any).status === 'borrador').length ?? 0,
    listo: entregas?.filter(e => (e as any).status === 'listo').length ?? 0,
    hecho: entregas?.filter(e => (e as any).status === 'hecho').length ?? 0,
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5" /> Entregas
        </h1>
        <Button size="sm" onClick={() => navigate('/entregas/nuevo')}>
          <Plus className="h-4 w-4 mr-1" /> Crear entrega manual
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: counts.total },
          { label: 'Borrador', value: counts.borrador },
          { label: 'Listo', value: counts.listo },
          { label: 'Hecho', value: counts.hecho },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-bold text-foreground">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por folio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="min-w-[180px]">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Vendedor</label>
          <SearchableSelect
            options={[{ value: 'todos', label: 'Todos' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))]}
            value={vendedorFilter}
            onChange={setVendedorFilter}
            placeholder="Vendedor..."
          />
        </div>
        <div className="min-w-[150px]">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
          <SearchableSelect
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'borrador', label: 'Borrador' },
              { value: 'listo', label: 'Listo' },
              { value: 'hecho', label: 'Hecho' },
              { value: 'cancelado', label: 'Cancelado' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Status..."
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Pedido origen</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px] text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
            )}
            {!isLoading && (entregas ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No hay entregas
                </TableCell>
              </TableRow>
            )}
            {(entregas ?? []).map((e: any) => {
              const badge = STATUS_BADGE[e.status] ?? STATUS_BADGE.borrador;
              return (
                <TableRow
                  key={e.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/entregas/${e.id}`)}
                >
                  <TableCell className="font-mono text-[11px] font-bold py-2">{e.folio ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{e.ventas?.folio ?? '—'}</TableCell>
                  <TableCell className="text-[12px] font-medium py-2">{e.clientes?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{e.vendedores?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{fmtDate(e.fecha)}</TableCell>
                  <TableCell className="text-center py-2">
                    <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
