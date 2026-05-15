import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PartnerEmpresas() {
  const { data: partner } = usePartner();
  const { data: empresas } = useQuery({
    queryKey: ['partner-empresas', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase
        .from('partner_atribuciones')
        .select('id, metodo, created_at, ref_slug, empresa_id, empresas:empresa_id(nombre)')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false });
      const items = (data || []) as any[];
      const empresaIds = items.map(i => i.empresa_id);
      if (!empresaIds.length) return items;
      const { data: subs } = await supabase.from('subscriptions').select('empresa_id, status').in('empresa_id', empresaIds);
      const subMap = Object.fromEntries((subs || []).map(s => [s.empresa_id, s.status]));
      return items.map(i => ({ ...i, sub_status: subMap[i.empresa_id] || 'sin_dato' }));
    },
    enabled: !!partner?.id,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mis Empresas Referidas</h1>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Suscripción</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Fecha alta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(empresas || []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.empresas?.nombre || '—'}</TableCell>
                <TableCell><Badge variant={e.sub_status === 'active' ? 'default' : 'secondary'}>{e.sub_status}</Badge></TableCell>
                <TableCell><Badge variant="outline">{e.metodo}</Badge></TableCell>
                <TableCell>{new Date(e.created_at).toLocaleDateString('es-MX')}</TableCell>
              </TableRow>
            ))}
            {!empresas?.length && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Aún no tienes empresas referidas. Comparte tu link.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
