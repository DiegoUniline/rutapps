import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

function useCuentasPagar(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cuentas-pagar', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Derive from compras that are confirmed/received but we treat total as owed
      let q = supabase
        .from('compras')
        .select('id, folio, fecha, total, status, proveedores(nombre), almacenes(nombre)')
        .eq('empresa_id', empresa!.id)
        .in('status', ['confirmada', 'recibida'])
        .order('fecha', { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(c => (c.folio ?? '').toLowerCase().includes(s) || ((c.proveedores as any)?.nombre ?? '').toLowerCase().includes(s));
      }
      return filtered;
    },
  });
}

export default function CuentasPagarPage() {
  const [search, setSearch] = useState('');
  const { data: cuentas, isLoading } = useCuentasPagar(search);

  const totalPorPagar = cuentas?.reduce((s, c) => s + (c.total ?? 0), 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <TrendingDown className="h-5 w-5" /> Cuentas por pagar
      </h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total por pagar</p>
          <p className="text-2xl font-bold text-destructive">$ {fmt(totalPorPagar)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Compras pendientes</p>
          <p className="text-2xl font-bold text-foreground">{cuentas?.length ?? 0}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar proveedor o folio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Proveedor</TableHead>
              <TableHead className="text-[11px]">Almacén</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px] text-center">Estado</TableHead>
              <TableHead className="text-[11px] text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas?.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-[11px]">{c.folio ?? c.id.slice(0, 8)}</TableCell>
                <TableCell className="font-medium text-[12px]">{(c.proveedores as any)?.nombre ?? '—'}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground">{(c.almacenes as any)?.nombre ?? '—'}</TableCell>
                <TableCell className="text-[12px]">{c.fecha}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.status === 'recibida' ? 'default' : 'outline'} className="text-[10px]">
                    {c.status === 'recibida' ? 'Recibida' : 'Confirmada'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-bold text-destructive">$ {fmt(c.total ?? 0)}</TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && cuentas?.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin cuentas por pagar</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
