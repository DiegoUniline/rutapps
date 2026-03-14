import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Truck, Package, ChevronRight } from 'lucide-react';
import { useCargas, useDeleteCarga } from '@/hooks/useCargas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import TableSkeleton from '@/components/TableSkeleton';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'outline' },
  en_ruta: { label: 'En ruta', variant: 'default' },
  completada: { label: 'Completada', variant: 'secondary' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
};

export default function CargasListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const { data: cargas, isLoading } = useCargas(search, statusFilter);
  const deleteCarga = useDeleteCarga();

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5" /> Cargas
          </h1>
          <p className="text-sm text-muted-foreground">Gestiona las cargas de producto para cada ruta</p>
        </div>
        <Button onClick={() => navigate('/cargas/nuevo')} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nueva carga
        </Button>
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['todos', 'pendiente', 'en_ruta', 'completada'].map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
              {s === 'todos' ? 'Todos' : statusConfig[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!cargas || cargas.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin cargas registradas</TableCell></TableRow>
              )}
              {cargas?.map((c: any) => {
                const sc = statusConfig[c.status] ?? statusConfig.pendiente;
                const totalItems = (c.carga_lineas ?? []).reduce((s: number, l: any) => s + (l.cantidad_cargada ?? 0), 0);
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/cargas/${c.id}`)}>
                    <TableCell className="font-medium">{c.fecha}</TableCell>
                    <TableCell>{(c.vendedores as any)?.nombre ?? '—'}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Package className="h-3.5 w-3.5" /> {(c.carga_lineas ?? []).length} productos · {totalItems} uds
                      </span>
                    </TableCell>
                    <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
