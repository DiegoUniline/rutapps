import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, Search, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  onSelectEmpresa: (empresaId: string, tab?: 'pagos') => void;
}

const fmtMXN = (v: number) =>
  `$${(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Row = {
  id: string;
  fecha: string;
  empresa_id: string;
  empresa_nombre: string;
  factura: string;
  monto: number;
  metodo: string;
  origen: 'automatico' | 'manual';
  referencia: string | null;
};

export default function AdminPagosTab({ onSelectEmpresa }: Props) {
  const [search, setSearch] = useState('');
  const [metodo, setMetodo] = useState<string>('todos');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-pagos-global'],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      for (;;) {
        const { data, error } = await supabase
          .from('facturas')
          .select('id, fecha_pago, fecha_emision, numero_factura, total, metodo_pago, stripe_payment_intent_id, referencia_pago, empresa_id, empresas(nombre)')
          .eq('estado', 'pagada')
          .order('fecha_pago', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return all.map<Row>((f) => ({
        id: f.id,
        fecha: f.fecha_pago || f.fecha_emision,
        empresa_id: f.empresa_id,
        empresa_nombre: (f.empresas as any)?.nombre || '—',
        factura: f.numero_factura || 'sin folio',
        monto: Number(f.total || 0),
        metodo: f.metodo_pago || (f.stripe_payment_intent_id ? 'stripe' : 'manual'),
        origen: f.stripe_payment_intent_id && !f.metodo_pago ? 'automatico' : 'manual',
        referencia: f.referencia_pago,
      }));
    },
  });

  const metodos = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.metodo));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (metodo !== 'todos' && r.metodo !== metodo) return false;
      if (!q) return true;
      return (
        r.empresa_nombre.toLowerCase().includes(q) ||
        r.factura.toLowerCase().includes(q) ||
        (r.referencia || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, metodo]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.monto, 0), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Pagos registrados
          </h1>
          <p className="text-xs text-muted-foreground">Todas las facturas pagadas de la plataforma</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">Total filtrado</div>
            <div className="text-lg font-bold tabular-nums">{fmtMXN(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">Pagos</div>
            <div className="text-lg font-bold tabular-nums">{filtered.length}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa, factura o referencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={metodo} onValueChange={setMetodo}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Método" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los métodos</SelectItem>
            {metodos.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando pagos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Sin pagos</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {p.fecha ? format(new Date(p.fecha), 'dd/MM/yyyy') : '—'}
                      </TableCell>
                      <TableCell className="font-medium">{p.empresa_nombre}</TableCell>
                      <TableCell className="text-sm">{p.factura}</TableCell>
                      <TableCell><Badge variant="outline">{p.metodo}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={p.origen === 'automatico' ? 'default' : 'secondary'}>
                          {p.origen === 'automatico' ? 'Automático' : 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.referencia || '—'}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{fmtMXN(p.monto)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSelectEmpresa(p.empresa_id, 'pagos')}
                          className="gap-1.5"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ver empresa
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
