import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Database } from '@/integrations/supabase/types';
import { SortableTableHead, useSortState, useSortableTable, ordenarFilas } from '@/hooks/useSortableTable';

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
type CommissionRow = Database['public']['Tables']['partner_comisiones']['Row'] & { empresas: { nombre: string } | null };
type PaymentRow = Database['public']['Tables']['partner_pagos']['Row'];

export default function PartnerComisiones() {
  const { data: partner } = usePartner();

  const { data: comisiones } = useQuery<CommissionRow[]>({
    queryKey: ['partner-comisiones', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase
        .from('partner_comisiones')
        .select('*, empresas:empresa_id(nombre)')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false });
      return (data || []) as unknown as CommissionRow[];
    },
    enabled: !!partner?.id,
  });

  const { data: pagos } = useQuery<PaymentRow[]>({
    queryKey: ['partner-pagos', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase.from('partner_pagos').select('*').eq('partner_id', partner.id).order('pagado_en', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  const { sort, toggle: toggleSort } = useSortState('partner-comisiones');
  const valorComision = (c: CommissionRow, key: string) => {
    if (key === 'empresa') return c.tipo === 'bono_nivel' ? 'Bono de nivel' : c.empresas?.nombre;
    if (key === 'monto_factura') return c.tipo === 'bono_nivel' ? null : Number(c.monto_factura);
    if (key === 'neto') return c.tipo === 'bono_nivel' ? null : Number(c.partner_pct) - Number(c.cupon_pct);
    if (key === 'monto_comision') return Number(c.monto_comision);
    return (c as any)[key];
  };
  const { sorted: pagosOrd, sort: sortPagos, toggle: togglePagos } = useSortableTable(pagos ?? [], (p, key) =>
    key === 'monto' ? Number(p.monto) : (p as any)[key], undefined, 'partner-pagos');

  const renderTable = (rows: CommissionRow[]) => (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="periodo" sort={sort} onToggle={toggleSort}>Periodo</SortableTableHead>
            <SortableTableHead sortKey="empresa" sort={sort} onToggle={toggleSort}>Empresa</SortableTableHead>
            <SortableTableHead sortKey="monto_factura" sort={sort} onToggle={toggleSort}>Factura</SortableTableHead>
            <SortableTableHead sortKey="neto" sort={sort} onToggle={toggleSort}>% Neto</SortableTableHead>
            <SortableTableHead sortKey="monto_comision" sort={sort} onToggle={toggleSort} align="right" className="text-right">Comisión</SortableTableHead>
            <SortableTableHead sortKey="status" sort={sort} onToggle={toggleSort}>Status</SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenarFilas(rows, sort, valorComision).map(c => (
            <TableRow key={c.id}>
              <TableCell>{c.periodo}</TableCell>
              <TableCell>{c.tipo === 'bono_nivel' ? <Badge className="bg-amber-100 text-amber-800">Bono de nivel</Badge> : c.empresas?.nombre || '—'}</TableCell>
              <TableCell>{c.tipo === 'bono_nivel' ? '—' : fmt(Number(c.monto_factura))}</TableCell>
              <TableCell>{c.tipo === 'bono_nivel' ? c.notas || 'Bono único' : <>{c.partner_pct}% − {c.cupon_pct}% = <strong>{Number(c.partner_pct) - Number(c.cupon_pct)}%</strong></>}</TableCell>
              <TableCell className="text-right font-bold">{fmt(Number(c.monto_comision))}</TableCell>
              <TableCell><Badge variant={c.status === 'pagada' ? 'default' : c.status === 'pendiente' ? 'secondary' : 'outline'}>{c.status}</Badge></TableCell>
            </TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin movimientos</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );

  const pendientes = (comisiones || []).filter(c => c.status === 'pendiente');
  const pagadas = (comisiones || []).filter(c => c.status === 'pagada');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Comisiones</h1>
      <Tabs defaultValue="pendientes">
        <TabsList>
          <TabsTrigger value="pendientes">Pendientes ({pendientes.length})</TabsTrigger>
          <TabsTrigger value="pagadas">Pagadas ({pagadas.length})</TabsTrigger>
          <TabsTrigger value="pagos">Pagos recibidos ({pagos?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="pendientes">{renderTable(pendientes)}</TabsContent>
        <TabsContent value="pagadas">{renderTable(pagadas)}</TabsContent>
        <TabsContent value="pagos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow><SortableTableHead sortKey="pagado_en" sort={sortPagos} onToggle={togglePagos}>Fecha</SortableTableHead><SortableTableHead sortKey="metodo" sort={sortPagos} onToggle={togglePagos}>Método</SortableTableHead><SortableTableHead sortKey="referencia" sort={sortPagos} onToggle={togglePagos}>Referencia</SortableTableHead><SortableTableHead sortKey="monto" sort={sortPagos} onToggle={togglePagos} align="right" className="text-right">Monto</SortableTableHead></TableRow>
              </TableHeader>
              <TableBody>
                {pagosOrd.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.pagado_en).toLocaleDateString('es-MX')}</TableCell>
                    <TableCell>{p.metodo || '—'}</TableCell>
                    <TableCell>{p.referencia || '—'}</TableCell>
                    <TableCell className="text-right font-bold">{fmt(Number(p.monto))}</TableCell>
                  </TableRow>
                ))}
                {!pagos?.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin pagos aún</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
