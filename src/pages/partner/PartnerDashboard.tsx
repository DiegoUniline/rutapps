import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2, Tag, Wallet, TrendingUp, Copy, Check, ArrowUpRight, ArrowDownRight,
  Users, DollarSign, Sparkles, Share2, MessageCircle, Twitter, Facebook, Mail, Trophy, Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const PRIMARY = 'hsl(230, 55%, 52%)';
const ACCENT = 'hsl(25, 100%, 55%)';
const GREEN = '#10B981';
const RED = '#EF4444';
const PIE_COLORS = [PRIMARY, ACCENT, GREEN, '#8B5CF6', '#EC4899', '#06B6D4'];

export default function PartnerDashboard() {
  const { data: partner } = usePartner();
  const [copied, setCopied] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['partner-stats', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return null;
      const [emp, com, cup] = await Promise.all([
        supabase.from('partner_atribuciones').select('id, created_at, empresa_id, empresas:empresa_id(nombre)').eq('partner_id', partner.id),
        supabase.from('partner_comisiones').select('monto_comision, status, created_at, empresa_id').eq('partner_id', partner.id),
        supabase.from('cupones').select('codigo, usos_actuales').eq('partner_id', partner.id).eq('activo', true),
      ]);
      const empresas = (emp.data || []) as any[];
      const comisiones = (com.data || []) as any[];
      const cupones = (cup.data || []) as any[];
      const total = comisiones.reduce((s, c) => s + Number(c.monto_comision), 0);
      const pendiente = comisiones.filter(c => c.status === 'pendiente').reduce((s, c) => s + Number(c.monto_comision), 0);
      const pagado = comisiones.filter(c => c.status === 'pagada').reduce((s, c) => s + Number(c.monto_comision), 0);
      return { empresas, comisiones, cupones, empresasCount: empresas.length, cuponesCount: cupones.length, total, pendiente, pagado };
    },
    enabled: !!partner?.id,
  });

  // Build last-12-months series
  const { serieMensual, mesActual, mesAnterior, deltaPct, deltaEmpresas, topEmpresas, distCupones } = useMemo(() => {
    const buckets: Record<string, { mes: string; comision: number; empresas: number; }> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[k] = { mes: `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, comision: 0, empresas: 0 };
    }
    (stats?.comisiones || []).forEach((c: any) => {
      const d = new Date(c.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (buckets[k]) buckets[k].comision += Number(c.monto_comision);
    });
    (stats?.empresas || []).forEach((e: any) => {
      const d = new Date(e.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (buckets[k]) buckets[k].empresas += 1;
    });
    const serie = Object.values(buckets);
    const mesActual = serie[serie.length - 1]?.comision || 0;
    const mesAnterior = serie[serie.length - 2]?.comision || 0;
    const deltaPct = mesAnterior > 0 ? ((mesActual - mesAnterior) / mesAnterior) * 100 : (mesActual > 0 ? 100 : 0);
    const empAct = serie[serie.length - 1]?.empresas || 0;
    const empAnt = serie[serie.length - 2]?.empresas || 0;
    const deltaEmpresas = empAct - empAnt;

    // Top empresas por comisión
    const empMap: Record<string, { nombre: string; total: number; }> = {};
    (stats?.comisiones || []).forEach((c: any) => {
      const id = c.empresa_id;
      if (!empMap[id]) {
        const e = (stats?.empresas || []).find((x: any) => x.empresa_id === id);
        empMap[id] = { nombre: e?.empresas?.nombre || 'Empresa', total: 0 };
      }
      empMap[id].total += Number(c.monto_comision);
    });
    const topEmpresas = Object.values(empMap).sort((a, b) => b.total - a.total).slice(0, 5);

    const distCupones = (stats?.cupones || []).map((c: any) => ({ name: c.codigo, value: c.usos_actuales || 0 })).filter((x: any) => x.value > 0);
    return { serieMensual: serie, mesActual, mesAnterior, deltaPct, deltaEmpresas, topEmpresas, distCupones };
  }, [stats]);

  const refLink = `${window.location.origin}/?ref=${partner?.ref_slug}`;

  const copy = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
    toast.success('Link copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWA = () => window.open(`https://wa.me/?text=${encodeURIComponent('Te recomiendo Rutapp para gestionar rutas, ventas y cobros: ' + refLink)}`, '_blank');
  const shareTw = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Gestiona rutas, ventas y cobros con Rutapp 🚀')}&url=${encodeURIComponent(refLink)}`, '_blank');
  const shareFb = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(refLink)}`, '_blank');
  const shareMail = () => window.open(`mailto:?subject=${encodeURIComponent('Te recomiendo Rutapp')}&body=${encodeURIComponent('Pruébalo aquí: ' + refLink)}`, '_blank');

  const positivo = deltaPct >= 0;

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Hola, {partner?.nombre} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tu comisión base es del <strong>{partner?.comision_pct}%</strong> sobre cada cobro recurrente.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" />
          {stats?.empresasCount ? `Llevas ${stats.empresasCount} ${stats.empresasCount === 1 ? 'empresa referida' : 'empresas referidas'}` : '¡Comparte tu link y empieza!'}
        </div>
      </div>

      {/* Hero KPI estilo YouTube Partners */}
      <Card className="overflow-hidden border-0 shadow-xl" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, hsl(230,60%,38%) 100%)` }}>
        <CardContent className="p-6 md:p-8 text-white">
          <div className="grid md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-1">
              <p className="text-xs uppercase tracking-wider opacity-80 font-bold mb-2">Ganancia este mes</p>
              <div className="text-5xl font-black leading-none">{fmt(mesActual)}</div>
              <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${positivo ? 'bg-emerald-400/20 text-emerald-100' : 'bg-red-400/20 text-red-100'}`}>
                {positivo ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(deltaPct).toFixed(1)}% vs mes anterior
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase opacity-70 font-bold">Pagado</div>
                  <div className="text-lg font-bold">{fmt(stats?.pagado ?? 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase opacity-70 font-bold">Pendiente</div>
                  <div className="text-lg font-bold">{fmt(stats?.pendiente ?? 0)}</div>
                </div>
              </div>
            </div>
            <div className="md:col-span-2 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serieMensual} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gHero" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="mes" tick={{ fill: 'rgba(255,255,255,0.75)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 8, color: '#111' }}
                    formatter={(v: any) => fmt(Number(v))}
                  />
                  <Area type="monotone" dataKey="comision" stroke="#fff" strokeWidth={2.5} fill="url(#gHero)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Link referido + share */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Share2 className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Tu link de referido</p>
              </div>
              <div className="flex gap-2">
                <input readOnly value={refLink} className="flex-1 min-w-0 bg-muted/50 border rounded-lg px-3 py-2 text-sm font-mono" />
                <Button onClick={copy} className="shrink-0">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
              </div>
            </div>
            <div className="flex gap-2 md:border-l md:pl-4">
              <Button size="icon" variant="outline" onClick={shareWA} className="hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300"><MessageCircle className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={shareTw} className="hover:bg-sky-50 hover:text-sky-600 hover:border-sky-300"><Twitter className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={shareFb} className="hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"><Facebook className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={shareMail}><Mail className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Empresas referidas', value: stats?.empresasCount ?? 0, icon: Building2, sub: deltaEmpresas !== 0 ? `${deltaEmpresas > 0 ? '+' : ''}${deltaEmpresas} este mes` : 'Sin cambios este mes', color: PRIMARY },
          { label: 'Cupones activos', value: stats?.cuponesCount ?? 0, icon: Tag, sub: 'En circulación', color: ACCENT },
          { label: 'Total ganado', value: fmt(stats?.total ?? 0), icon: TrendingUp, sub: 'Histórico', color: GREEN, big: true },
          { label: 'Saldo pendiente', value: fmt(stats?.pendiente ?? 0), icon: Wallet, sub: 'Por pagar', color: '#8B5CF6', big: true },
        ].map((c, i) => (
          <Card key={i} className="hover:shadow-lg transition group">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition" style={{ background: `${c.color}15`, color: c.color }}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
              <div className={`font-black ${c.big ? 'text-2xl' : 'text-3xl'}`}>{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">{c.label}</div>
              <div className="text-[11px] text-muted-foreground mt-2">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Comisiones últimos 12 meses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieMensual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="comision" fill={PRIMARY} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Crecimiento de referidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serieMensual}>
                  <defs>
                    <linearGradient id="gEmp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Area type="monotone" dataKey="empresas" stroke={ACCENT} strokeWidth={2.5} fill="url(#gEmp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top empresas + Cupones pie */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Top empresas por comisión generada
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topEmpresas.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Aún no tienes comisiones generadas. ¡Comparte tu link!
              </div>
            ) : (
              <div className="space-y-3">
                {topEmpresas.map((e, i) => {
                  const max = topEmpresas[0].total || 1;
                  const pct = (e.total / max) * 100;
                  return (
                    <div key={i}>
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <span className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}>{i + 1}</span>
                          {e.nombre}
                        </div>
                        <span className="text-sm font-bold">{fmt(e.total)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" /> Uso de cupones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {distCupones.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Sin usos aún. Crea cupones para impulsar tus referidos.
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distCupones} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                      {distCupones.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
