import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Tag, Wallet, TrendingUp, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);

export default function PartnerDashboard() {
  const { data: partner } = usePartner();
  const [copied, setCopied] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['partner-stats', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return null;
      const [emp, com, cup] = await Promise.all([
        supabase.from('partner_atribuciones').select('*', { count: 'exact', head: true }).eq('partner_id', partner.id),
        supabase.from('partner_comisiones').select('monto_comision, status').eq('partner_id', partner.id),
        supabase.from('cupones').select('*', { count: 'exact', head: true }).eq('partner_id', partner.id).eq('activo', true),
      ]);
      const comisiones = com.data || [];
      const total = comisiones.reduce((s, c) => s + Number(c.monto_comision), 0);
      const pendiente = comisiones.filter(c => c.status === 'pendiente').reduce((s, c) => s + Number(c.monto_comision), 0);
      const pagado = comisiones.filter(c => c.status === 'pagada').reduce((s, c) => s + Number(c.monto_comision), 0);
      return { empresas: emp.count || 0, cupones: cup.count || 0, total, pendiente, pagado };
    },
    enabled: !!partner?.id,
  });

  const refLink = `${window.location.origin}/?ref=${partner?.ref_slug}`;

  const copy = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
    toast.success('Link copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const cards = [
    { label: 'Empresas referidas', value: stats?.empresas ?? '-', icon: Building2 },
    { label: 'Cupones activos', value: stats?.cupones ?? '-', icon: Tag },
    { label: 'Saldo pendiente', value: fmt(stats?.pendiente ?? 0), icon: Wallet, accent: true },
    { label: 'Total ganado', value: fmt(stats?.total ?? 0), icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {partner?.nombre}</h1>
        <p className="text-sm text-muted-foreground">Tu comisión base es del <strong>{partner?.comision_pct}%</strong> sobre cada cobro recurrente.</p>
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-6 space-y-3">
          <p className="text-sm opacity-90">Tu link de referido</p>
          <div className="flex gap-2">
            <input readOnly value={refLink} className="flex-1 bg-primary-foreground/10 border border-primary-foreground/20 rounded px-3 py-2 text-sm font-mono" />
            <Button variant="secondary" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
          </div>
          <p className="text-xs opacity-75">Comparte este link. Cualquier empresa que se registre con él será atribuida a ti de por vida.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label} className={c.accent ? 'border-primary' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <c.icon className="h-4 w-4" /> {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
