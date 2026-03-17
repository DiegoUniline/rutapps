import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, CreditCard, Receipt, Users, Stamp, Calendar, Loader2 } from 'lucide-react';

interface DashboardStats {
  balance_available: number; balance_pending: number; total_invoiced: number;
  total_paid: number; total_open: number; active_subscriptions: number;
  total_customers: number; mrr: number;
}

interface FacturamaPlan {
  Plan: string;
  CurrentFolios: string;
  CreationDate: string;
  ExpirationDate: string;
  Amount: number;
  Id: string;
  Type: string;
}

export default function AdminStatsTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [facturamaPlan, setFacturamaPlan] = useState<FacturamaPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); loadFacturamaPlan(); }, []);

  async function loadStats() {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No session');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=dashboard_stats`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data);
    } catch (err) {
      console.error('Stats error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadFacturamaPlan() {
    try {
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: { action: 'suscription_plan' },
      });
      if (error) throw error;
      setFacturamaPlan(data);
    } catch (err) {
      console.error('Facturama plan error:', err);
    }
  }

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('es-MX')}`;

  if (loading) return <div className="text-muted-foreground text-center py-10">Cargando estadísticas...</div>;
  if (!stats) return <div className="text-muted-foreground text-center py-10">Error al cargar</div>;

  return (
    <div className="space-y-6">
      {/* Facturama plan card */}
      {facturamaPlan && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Stamp className="h-4 w-4 text-primary" /> Cuenta Facturama (Desarrollador)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-2xl font-bold text-primary">{facturamaPlan.CurrentFolios}</div>
              <div className="text-xs text-muted-foreground">Folios disponibles</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{facturamaPlan.Plan}</div>
              <div className="text-xs text-muted-foreground">Plan activo</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {facturamaPlan.ExpirationDate ? new Date(facturamaPlan.ExpirationDate).toLocaleDateString('es-MX') : '—'}
              </div>
              <div className="text-xs text-muted-foreground">Vencimiento</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{facturamaPlan.Type || '—'}</div>
              <div className="text-xs text-muted-foreground">Tipo</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Ingresos cobrados" value={fmt(stats.total_paid)} accent="success" />
        <StatCard icon={TrendingUp} label="MRR" value={fmt(stats.mrr)} accent="primary" />
        <StatCard icon={CreditCard} label="Facturas abiertas" value={fmt(stats.total_open)} accent="destructive" />
        <StatCard icon={Receipt} label="Total cobrado" value={fmt(stats.total_paid)} accent="success" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Clientes" value={stats.total_customers.toString()} accent="primary" />
        <StatCard icon={CreditCard} label="Suscripciones activas" value={stats.active_subscriptions.toString()} accent="success" />
        <StatCard icon={Receipt} label="Total facturado" value={fmt(stats.total_invoiced)} accent="muted" />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: {
  icon: any; label: string; value: string; accent: 'primary' | 'success' | 'destructive' | 'muted';
}) {
  const accentMap = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    destructive: 'text-destructive bg-destructive/10',
    muted: 'text-muted-foreground bg-muted/10',
  };
  const [iconColor, iconBg] = accentMap[accent].split(' ');

  return (
    <Card className="border border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
