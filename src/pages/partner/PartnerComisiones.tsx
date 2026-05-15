import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);

export default function PartnerComisiones() {
  const { data: partner } = usePartner();

  const { data: comisiones } = useQuery({
    queryKey: ['partner-comisiones', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase
        .from('partner_comisiones')
        .select('*, empresas:empresa_id(nombre)')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  const { data: pagos } = useQuery({
    queryKey: ['partner-pagos', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase.from('partner_pagos').select('*').eq('partner_id', partner.id).order('pagado_en', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  const renderTable = (rows: any[]) => (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Periodo</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead>% Neto</TableHead>
            <TableHead className="text-right">Comisión</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c: any) => (
            <TableRow key={c.id}>
              <TableCell>{c.periodo}</TableCell>
              <TableCell>{c.empresas?.nombre || '—'}</TableCell>
              <TableCell>{fmt(Number(c.monto_factura))}</TableCell>
              <TableCell>{c.partner_pct}% − {c.cupon_pct}% = <strong>{Number(c.partner_pct) - Number(c.cupon_pct)}%</strong></TableCell>
              <TableCell className="text-right font-bold">{fmt(Number(c.monto_comision))}</TableCell>
              <TableCell><Badge variant={c.status === 'pagada' ? 'default' : c.status === 'pendiente' ? 'secondary' : 'outline'}>{c.status}</Badge></TableCell>
            </TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin movimientos</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );

  const pendientes = (comisiones || []).filter((c: any) => c.status === 'pendiente');
  const pagadas = (comisiones || []).filter((c: any) => c.status === 'pagada');

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
                <TableRow><TableHead>Fecha</TableHead><TableHead>Método</TableHead><TableHead>Referencia</TableHead><TableHead className="text-right">Monto</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(pagos || []).map((p: any) => (
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
