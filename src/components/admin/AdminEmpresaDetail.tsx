import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, CreditCard, Receipt, Stamp, Users, Calendar,
  Mail, Phone, MapPin, Edit2, Save, X, ExternalLink, Download, FileText,
  Plus, ShoppingCart, History, Percent
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface Props {
  empresaId: string;
  onBack: () => void;
}

const STATUS_MAP: Record<string, { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trial: { l: 'Trial', v: 'secondary' }, active: { l: 'Activa', v: 'default' },
  past_due: { l: 'Vencida', v: 'destructive' }, cancelled: { l: 'Cancelada', v: 'outline' },
  suspended: { l: 'Suspendida', v: 'destructive' }, gracia: { l: 'Gracia', v: 'destructive' },
  pendiente_pago: { l: 'Pendiente pago', v: 'secondary' },
};
const STATUSES = ['trial', 'active', 'past_due', 'gracia', 'suspended', 'cancelled'] as const;
const fmtMXN = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminEmpresaDetail({ empresaId, onBack }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [timbres, setTimbres] = useState(0);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [stripeInvoices, setStripeInvoices] = useState<any[]>([]);
  const [timbresMovimientos, setTimbresMovimientos] = useState<any[]>([]);

  // Edit states
  const [editingEmpresa, setEditingEmpresa] = useState(false);
  const [empresaForm, setEmpresaForm] = useState<any>({});
  const [editingSub, setEditingSub] = useState(false);
  const [subForm, setSubForm] = useState<any>({});
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

  // Timbres sale form
  const [showTimbresSale, setShowTimbresSale] = useState(false);
  const [addingTimbres, setAddingTimbres] = useState(false);
  const [timbresForm, setTimbresForm] = useState({
    paquetes: 1, // each = 100 timbres
    precio_timbre: 1,
    descuento_pct: 0,
    notas: '',
    generar_factura: false,
  });

  useEffect(() => { load(); }, [empresaId]);

  async function load() {
    setLoading(true);
    const [empRes, subRes, plansRes, factRes, timbresRes, profilesRes, movRes] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresaId).single(),
      supabase.from('subscriptions').select('*, subscription_plans(nombre, precio_por_usuario, periodo, descuento_pct, meses)').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('subscription_plans').select('*').eq('activo', true),
      supabase.from('facturas').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(20),
      supabase.from('timbres_saldo').select('saldo').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('profiles').select('id, nombre, telefono, rol, user_id').eq('empresa_id', empresaId),
      supabase.from('timbres_movimientos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(50),
    ]);

    setEmpresa(empRes.data);
    setSubscription(subRes.data);
    setPlans((plansRes.data || []) as any[]);
    setFacturas((factRes.data || []) as any[]);
    setTimbres(timbresRes.data?.saldo ?? 0);
    setProfiles((profilesRes.data || []) as any[]);
    setTimbresMovimientos((movRes.data || []) as any[]);

    if (empRes.data) {
      setEmpresaForm({
        nombre: empRes.data.nombre || '',
        email: empRes.data.email || '',
        telefono: empRes.data.telefono || '',
        rfc: empRes.data.rfc || '',
        razon_social: empRes.data.razon_social || '',
        direccion: empRes.data.direccion || '',
        cp: empRes.data.cp || '',
        ciudad: empRes.data.ciudad || '',
        estado: empRes.data.estado || '',
      });
    }

    if (subRes.data) {
      setSubForm({
        plan_id: subRes.data.plan_id || '',
        max_usuarios: subRes.data.max_usuarios || 3,
        status: subRes.data.status || 'trial',
        current_period_start: subRes.data.current_period_start?.split('T')[0] || '',
        current_period_end: subRes.data.current_period_end?.split('T')[0] || '',
        trial_ends_at: subRes.data.trial_ends_at?.split('T')[0] || '',
      });
    }

    // Try loading Stripe invoices
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (subRes.data?.stripe_customer_id) {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=list_all_invoices`,
          { headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const data = await res.json();
        const customerId = subRes.data.stripe_customer_id;
        setStripeInvoices((data.invoices || []).filter((i: any) => i.customer === customerId));
      }
    } catch { /* silent */ }

    setLoading(false);
  }

  async function saveEmpresa() {
    setSavingEmpresa(true);
    const { error } = await supabase.from('empresas').update(empresaForm).eq('id', empresaId);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Empresa actualizada'); setEditingEmpresa(false); load(); }
    setSavingEmpresa(false);
  }

  async function saveSub() {
    if (!subscription) return;
    setSavingSub(true);
    const payload: any = {
      plan_id: subForm.plan_id || null,
      max_usuarios: subForm.max_usuarios,
      status: subForm.status,
      updated_at: new Date().toISOString(),
    };
    if (subForm.current_period_start) payload.current_period_start = subForm.current_period_start;
    if (subForm.current_period_end) payload.current_period_end = subForm.current_period_end;
    if (subForm.trial_ends_at) payload.trial_ends_at = subForm.trial_ends_at;

    const { error } = await supabase.from('subscriptions').update(payload).eq('id', subscription.id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Suscripción actualizada'); setEditingSub(false); load(); }
    setSavingSub(false);
  }

  // Timbres sale calculations
  const timbresCount = timbresForm.paquetes * 100;
  const timbresSubtotal = timbresCount * timbresForm.precio_timbre;
  const timbresDescuento = timbresSubtotal * (timbresForm.descuento_pct / 100);
  const timbresTotal = timbresSubtotal - timbresDescuento;

  async function handleTimbresSale() {
    if (!user) return;
    if (timbresForm.paquetes < 1) { toast.error('Mínimo 1 paquete'); return; }
    setAddingTimbres(true);
    try {
      const notaParts = [
        `Venta: ${timbresCount} timbres (${timbresForm.paquetes} paq × $${timbresForm.precio_timbre}/timbre)`,
      ];
      if (timbresForm.descuento_pct > 0) notaParts.push(`Descuento: ${timbresForm.descuento_pct}%`);
      notaParts.push(`Total: $${timbresTotal.toFixed(2)} MXN`);
      if (timbresForm.notas) notaParts.push(timbresForm.notas);

      // If generate invoice via admin-billing
      if (timbresForm.generar_factura && subscription?.stripe_customer_id) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const items = [
          { description: `${timbresCount} timbres CFDI × $${timbresForm.precio_timbre}/timbre`, amount: Math.round(timbresSubtotal * 100) }
        ];
        if (timbresDescuento > 0) {
          items.push({ description: `Descuento (${timbresForm.descuento_pct}%)`, amount: -Math.round(timbresDescuento * 100) });
        }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=create_pro_invoice`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              empresa_id: empresaId,
              empresa_nombre: empresa?.nombre || '',
              empresa_email: empresa?.email || '',
              empresa_telefono: empresa?.telefono || '',
              empresa_rfc: empresa?.rfc || '',
              items,
              concepto: `Compra de ${timbresCount} timbres CFDI — ${empresa?.nombre}`,
              days_until_due: 3,
              plan_nombre: 'Timbres CFDI',
              num_usuarios: 0,
              timbres: timbresCount,
              descuento_plan_pct: 0,
              descuento_extra_pct: timbresForm.descuento_pct,
              total_centavos: Math.round(timbresTotal * 100),
              mensaje_personal: '',
              enviar_email: !!empresa?.email,
              enviar_whatsapp: false,
              telefono_envio: '',
              correo_envio: empresa?.email || '',
            }),
          }
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast.success(`Factura creada por ${timbresCount} timbres — $${timbresTotal.toFixed(2)} MXN`);
      } else {
        // Just credit timbres directly
        const { data, error } = await supabase.rpc('add_timbres', {
          p_empresa_id: empresaId,
          p_cantidad: timbresCount,
          p_user_id: user.id,
          p_notas: notaParts.join(' | '),
        });
        if (error) throw error;
        toast.success(`+${timbresCount} timbres acreditados. Saldo: ${data}`);
      }

      setShowTimbresSale(false);
      setTimbresForm({ paquetes: 1, precio_timbre: 1, descuento_pct: 0, notas: '', generar_factura: false });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingTimbres(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando detalle de empresa...
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Empresa no encontrada</p>
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1.5" /> Volver</Button>
      </div>
    );
  }

  const daysLeft = subscription
    ? differenceInDays(
        new Date(subscription.status === 'trial' ? subscription.trial_ends_at : subscription.current_period_end),
        new Date()
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Empresas
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{empresa.nombre}</h2>
            <p className="text-xs text-muted-foreground">
              Registrada {format(new Date(empresa.created_at), "dd MMM yyyy", { locale: es })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Column 1: Empresa Info ── */}
        <Card className="border border-border/60 shadow-sm lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Datos de empresa
              </CardTitle>
              {!editingEmpresa ? (
                <Button size="sm" variant="ghost" onClick={() => setEditingEmpresa(true)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditingEmpresa(false)}><X className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" disabled={savingEmpresa} onClick={saveEmpresa}>
                    <Save className="h-3.5 w-3.5 text-primary" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {editingEmpresa ? (
              <>
                {[
                  { key: 'nombre', label: 'Nombre', icon: Building2 },
                  { key: 'email', label: 'Email', icon: Mail },
                  { key: 'telefono', label: 'Teléfono', icon: Phone },
                  { key: 'rfc', label: 'RFC', icon: FileText },
                  { key: 'razon_social', label: 'Razón Social', icon: FileText },
                  { key: 'direccion', label: 'Dirección', icon: MapPin },
                  { key: 'cp', label: 'C.P.', icon: MapPin },
                  { key: 'ciudad', label: 'Ciudad', icon: MapPin },
                  { key: 'estado', label: 'Estado', icon: MapPin },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      value={empresaForm[key] || ''}
                      onChange={e => setEmpresaForm((f: any) => ({ ...f, [key]: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <InfoRow icon={Mail} label="Email" value={empresa.email} />
                <InfoRow icon={Phone} label="Teléfono" value={empresa.telefono} />
                <InfoRow icon={FileText} label="RFC" value={empresa.rfc} />
                <InfoRow icon={FileText} label="Razón Social" value={empresa.razon_social} />
                <InfoRow icon={MapPin} label="Dirección" value={empresa.direccion} />
                <InfoRow icon={MapPin} label="C.P." value={empresa.cp} />
                <InfoRow icon={MapPin} label="Ciudad" value={[empresa.ciudad, empresa.estado].filter(Boolean).join(', ')} />
              </div>
            )}

            <Separator />

            {/* Users */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Usuarios ({profiles.length})
              </p>
              {profiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin usuarios</p>
              ) : (
                <div className="space-y-1.5">
                  {profiles.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{p.nombre || 'Sin nombre'}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{p.rol || 'usuario'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Column 2: Subscription + Timbres ── */}
        <div className="space-y-6 lg:col-span-1">
          {/* Subscription */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Suscripción
                </CardTitle>
                {subscription && !editingSub ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditingSub(true)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                ) : subscription && editingSub ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingSub(false)}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" disabled={savingSub} onClick={saveSub}>
                      <Save className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!subscription ? (
                <p className="text-sm text-muted-foreground">Sin suscripción activa</p>
              ) : editingSub ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Plan</Label>
                    <Select value={subForm.plan_id} onValueChange={v => setSubForm((f: any) => ({ ...f, plan_id: v }))}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Sin plan" /></SelectTrigger>
                      <SelectContent>
                        {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} — ${p.precio_por_usuario}/usr</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={subForm.status} onValueChange={v => setSubForm((f: any) => ({ ...f, status: v }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s]?.l || s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Máx. usuarios</Label>
                    <Input type="number" min={1} value={subForm.max_usuarios}
                      onChange={e => setSubForm((f: any) => ({ ...f, max_usuarios: parseInt(e.target.value) || 1 }))} className="h-8" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Inicio período</Label>
                      <Input type="date" value={subForm.current_period_start}
                        onChange={e => setSubForm((f: any) => ({ ...f, current_period_start: e.target.value }))} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fin período</Label>
                      <Input type="date" value={subForm.current_period_end}
                        onChange={e => setSubForm((f: any) => ({ ...f, current_period_end: e.target.value }))} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fin trial</Label>
                    <Input type="date" value={subForm.trial_ends_at}
                      onChange={e => setSubForm((f: any) => ({ ...f, trial_ends_at: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Estado</span>
                    <Badge variant={STATUS_MAP[subscription.status]?.v || 'outline'}>
                      {STATUS_MAP[subscription.status]?.l || subscription.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Plan</span>
                    <span className="text-sm font-medium">{subscription.subscription_plans?.nombre || 'Sin plan'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Usuarios</span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {profiles.length} / {subscription.max_usuarios}
                    </span>
                  </div>
                  {subscription.subscription_plans?.precio_por_usuario && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Precio/usuario</span>
                      <span className="text-sm font-medium">{fmtMXN(subscription.subscription_plans.precio_por_usuario)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Próximo cobro
                    </span>
                    <span className="text-sm font-medium">
                      {subscription.current_period_end
                        ? format(new Date(subscription.current_period_end), "dd MMM yyyy", { locale: es })
                        : '—'}
                    </span>
                  </div>
                  {daysLeft !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Días restantes</span>
                      <Badge variant={daysLeft <= 3 ? 'destructive' : daysLeft <= 7 ? 'secondary' : 'outline'}>
                        {daysLeft <= 0 ? 'Vencido' : `${daysLeft} días`}
                      </Badge>
                    </div>
                  )}
                  {subscription.trial_ends_at && subscription.status === 'trial' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Fin trial</span>
                      <span className="text-sm">{format(new Date(subscription.trial_ends_at), "dd MMM yyyy", { locale: es })}</span>
                    </div>
                  )}
                  {subscription.stripe_customer_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Stripe</span>
                      <span className="text-xs font-mono text-muted-foreground">{subscription.stripe_customer_id.slice(0, 18)}…</span>
                    </div>
                  )}
                  {subscription.card_last4 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Tarjeta</span>
                      <span className="text-sm font-mono">
                        {subscription.card_brand ? `${subscription.card_brand} ` : ''}•••• {subscription.card_last4}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timbres */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Stamp className="h-4 w-4 text-primary" /> Timbres CFDI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Saldo actual</span>
                <span className={`text-lg font-bold font-mono ${timbres > 0 ? 'text-primary' : 'text-destructive'}`}>
                  {timbres}
                </span>
              </div>
              <Separator />
              <div className="flex gap-2">
                <Input
                  type="number" min="1" value={timbresCantidad}
                  onChange={e => setTimbresCantidad(e.target.value)}
                  className="h-8 text-sm font-mono flex-1"
                  placeholder="Cantidad"
                />
                <Button size="sm" disabled={addingTimbres} onClick={handleAddTimbres}>
                  {addingTimbres ? '...' : `+${timbresCantidad}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Column 3: Facturas ── */}
        <Card className="border border-border/60 shadow-sm lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Facturas ({facturas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {facturas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin facturas registradas</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {facturas.map(f => (
                  <div key={f.id} className="border border-border/40 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">{f.numero_factura || 'Sin número'}</span>
                      <Badge variant={f.estado === 'pagada' ? 'default' : f.estado === 'pendiente' ? 'destructive' : 'secondary'}>
                        {f.estado || 'pendiente'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        {format(new Date(f.periodo_inicio), 'dd MMM', { locale: es })} — {format(new Date(f.periodo_fin), 'dd MMM yy', { locale: es })}
                      </span>
                      <span className="font-semibold">{fmtMXN(f.total)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" /> {f.num_usuarios} usuario{f.num_usuarios > 1 ? 's' : ''}
                      {f.es_prorrateo && <Badge variant="outline" className="text-[10px] h-4">Prorrateo</Badge>}
                    </div>
                    {f.fecha_pago && (
                      <p className="text-xs text-muted-foreground">
                        Pagada: {format(new Date(f.fecha_pago), 'dd MMM yyyy', { locale: es })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stripe Invoices (if any) */}
      {stripeInvoices.length > 0 && (
        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-primary" /> Facturas Stripe ({stripeInvoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stripeInvoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm font-mono">{inv.number || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === 'paid' ? 'default' : 'destructive'}>
                        {inv.status === 'paid' ? 'Pagada' : inv.status === 'open' ? 'Pendiente' : inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{fmtMXN(inv.amount_due / 100)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(inv.created * 1000), 'dd MMM yy', { locale: es })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {inv.hosted_invoice_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                        {inv.invoice_pdf && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-foreground truncate">{value || '—'}</p>
      </div>
    </div>
  );
}
