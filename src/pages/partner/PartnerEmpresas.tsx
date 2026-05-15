import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tag, Link2 } from 'lucide-react';

export default function PartnerEmpresas() {
  const { data: partner } = usePartner();
  const { data: empresas } = useQuery({
    queryKey: ['partner-empresas', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase
        .from('partner_atribuciones')
        .select('id, metodo, created_at, ref_slug, empresa_id, cupon_id, empresas:empresa_id(nombre), cupon:cupon_id(codigo, descuento_pct, descuento_monto)')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false });
      const items = (data || []) as any[];
      const empresaIds = items.map(i => i.empresa_id);
      if (!empresaIds.length) return items;

      // Subscription status
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('empresa_id, status')
        .in('empresa_id', empresaIds);
      const subMap = Object.fromEntries((subs || []).map(s => [s.empresa_id, s.status]));

      // Fallback: cupones aplicados por esta empresa que pertenezcan al partner
      const { data: usos } = await supabase
        .from('cupon_usos')
        .select('empresa_id, aplicado_at, cupones:cupon_id(codigo, descuento_pct, descuento_monto, partner_id)')
        .in('empresa_id', empresaIds);
      const usosMap: Record<string, any> = {};
      (usos || []).forEach((u: any) => {
        if (u.cupones?.partner_id === partner.id) {
          // mantener el primero (más viejo) por empresa
          if (!usosMap[u.empresa_id]) usosMap[u.empresa_id] = u.cupones;
        }
      });

      return items.map(i => ({
        ...i,
        sub_status: subMap[i.empresa_id] || 'sin_dato',
        cupon_efectivo: i.cupon || usosMap[i.empresa_id] || null,
      }));
    },
    enabled: !!partner?.id,
  });

  return (
    <div className="space-y-4 w-full">
      <h1 className="text-2xl font-bold">Mis Empresas Referidas</h1>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Suscripción</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Cupón aplicado</TableHead>
              <TableHead>Fecha alta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(empresas || []).map((e: any) => {
              const cup = e.cupon_efectivo;
              const desc = cup
                ? cup.descuento_pct
                  ? `${cup.descuento_pct}% off`
                  : cup.descuento_monto
                    ? `$${cup.descuento_monto} off`
                    : ''
                : '';
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.empresas?.nombre || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={e.sub_status === 'active' ? 'default' : 'secondary'}>{e.sub_status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {e.metodo === 'cupon' ? <Tag className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                      {e.metodo}
                      {e.metodo === 'link' && e.ref_slug && <span className="ml-1 text-muted-foreground">/{e.ref_slug}</span>}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {cup ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-orange-500 hover:bg-orange-600 text-white gap-1">
                          <Tag className="h-3 w-3" />
                          {cup.codigo}
                        </Badge>
                        {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{new Date(e.created_at).toLocaleDateString('es-MX')}</TableCell>
                </TableRow>
              );
            })}
            {!empresas?.length && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aún no tienes empresas referidas. Comparte tu link.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
