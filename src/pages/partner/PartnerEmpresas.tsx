import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tag, Link2 } from 'lucide-react';

export default function PartnerEmpresas() {
  const { data: partner } = usePartner();
  const { data: empresas, isLoading, error } = useQuery({
    queryKey: ['partner-empresas', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const [{ data: atribuciones, error: atribError }, { data: partnerCupones }] = await Promise.all([
        supabase
        .from('partner_atribuciones')
        .select('id, metodo, created_at, ref_slug, empresa_id, cupon_id')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false }),
        supabase
          .from('cupones')
          .select('id, codigo, descuento_pct, descuento_monto, partner_id')
          .eq('partner_id', partner.id),
      ]);
      if (atribError) throw atribError;

      const cuponMap: Record<string, any> = Object.fromEntries(((partnerCupones || []) as any[]).map(c => [c.id, c]));
      const partnerCuponIds = Object.keys(cuponMap);
      const { data: usos } = partnerCuponIds.length
        ? await supabase
          .from('cupon_usos')
          .select('id, empresa_id, cupon_id, aplicado_at')
          .in('cupon_id', partnerCuponIds)
          .order('aplicado_at', { ascending: false })
        : { data: [] as any[] };

      const byEmpresa = new Map<string, any>();
      ((atribuciones || []) as any[]).forEach((a) => byEmpresa.set(a.empresa_id, a));
      ((usos || []) as any[]).forEach((u) => {
        const current = byEmpresa.get(u.empresa_id);
        if (current) {
          byEmpresa.set(u.empresa_id, { ...current, cupon_id: current.cupon_id || u.cupon_id });
          return;
        }
        byEmpresa.set(u.empresa_id, {
          id: `cupon-uso-${u.id}`,
          metodo: 'cupon',
          created_at: u.aplicado_at,
          ref_slug: null,
          empresa_id: u.empresa_id,
          cupon_id: u.cupon_id,
        });
      });

      const items = Array.from(byEmpresa.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const empresaIds = [...new Set(items.map(i => i.empresa_id).filter(Boolean))];
      if (!empresaIds.length) return items;

      const extraCuponIds = [...new Set(items.map(i => i.cupon_id).filter(Boolean).filter(id => !cuponMap[id]))];
      if (extraCuponIds.length) {
        const { data: extraCupones } = await supabase
          .from('cupones')
          .select('id, codigo, descuento_pct, descuento_monto, partner_id')
          .in('id', extraCuponIds);
        ((extraCupones || []) as any[]).forEach(c => { cuponMap[c.id] = c; });
      }

      const [{ data: empresasData }, { data: subs }] = await Promise.all([
        supabase.from('empresas').select('id, nombre').in('id', empresaIds),
        supabase.from('subscriptions').select('empresa_id, status').in('empresa_id', empresaIds),
      ]);
      const empresaMap = Object.fromEntries(((empresasData || []) as any[]).map(e => [e.id, e.nombre]));
      const subMap = Object.fromEntries(((subs || []) as any[]).map(s => [s.empresa_id, s.status]));

      return items.map(i => ({
        ...i,
        empresa_nombre: empresaMap[i.empresa_id] || 'Empresa referida',
        sub_status: subMap[i.empresa_id] || 'sin_dato',
        cupon_efectivo: i.cupon_id ? cuponMap[i.cupon_id] || null : null,
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
                  <TableCell className="font-medium">{e.empresa_nombre || 'Empresa referida'}</TableCell>
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
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Cargando empresas...</TableCell></TableRow>
            )}
            {error && !isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-destructive py-8">No se pudieron cargar tus empresas referidas.</TableCell></TableRow>
            )}
            {!isLoading && !error && !empresas?.length && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aún no tienes empresas referidas. Comparte tu link o cupón.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
