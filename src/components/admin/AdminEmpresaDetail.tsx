import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, CreditCard, Receipt, Stamp, Users, Calendar,
  Mail, Phone, MapPin, Edit2, Save, X, ExternalLink, Download, FileText,
  ShoppingCart, History, Percent, KeyRound, ShieldAlert, Loader2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  const [usersDetailed, setUsersDetailed] = useState<any[]>([]);
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
    paquetes: 1,
    precio_timbre: 1,
    descuento_pct: 0,
    notas: '',
    generar_factura: false,
  });

  // Password reset states
  const [resetDialog, setResetDialog] = useState<{ userId: string; email: string; nombre: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetForceChange, setResetForceChange] = useState(true);
  const [resettingPw, setResettingPw] = useState(false);
  const [forcingAll, setForcingAll] = useState(false);

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
        descuento_porcentaje: (subRes.data as any).descuento_porcentaje || 0,
      });
    }

    try {
      const { data: usersData, error: usersErr } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list-empresa-users', empresa_id: empresaId },
      });
      if (!usersErr && usersData?.users) setUsersDetailed(usersData.users);
    } catch { /* silent */ }

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
      descuento_porcentaje: subForm.descuento_porcentaje || 0,
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
      notaParts.push(`Total: $${timbresTotal.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN`);
      if (timbresForm.notas) notaParts.push(timbresForm.notas);

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
        toast.success(`Factura creada por ${timbresCount} timbres — $${timbresTotal.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN`);
      } else {
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

  async function handleResetPassword() {
    if (!resetDialog || !resetPassword) return;
    if (resetPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setResettingPw(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'reset-password',
          user_id: resetDialog.userId,
          password: resetPassword,
          force_change: resetForceChange,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Contraseña restablecida para ${resetDialog.email}${resetForceChange ? ' — deberá cambiarla al entrar' : ''}`);
      setResetDialog(null);
      setResetPassword('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResettingPw(false);
    }
  }

  async function handleForceChangeAll() {
    if (!confirm(`¿Forzar cambio de contraseña para TODOS los usuarios de ${empresa?.nombre}?`)) return;
    setForcingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'force-change-all', empresa_id: empresaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.count} usuarios deberán cambiar su contraseña al entrar`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setForcingAll(false);
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

  const allUsers = usersDetailed.length > 0 ? usersDetailed : profiles;

  return (
    <div className="space-y-4">
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
        {subscription && (
          <Badge variant={STATUS_MAP[subscription.status]?.v || 'outline'} className="ml-auto text-xs">
            {STATUS_MAP[subscription.status]?.l || subscription.status}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList className="border border-border/60 p-1 h-auto">
          <TabsTrigger value="general" className="gap-1.5 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Building2 className="h-4 w-4" /> General
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-1.5 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="h-4 w-4" /> Usuarios ({allUsers.length})
          </TabsTrigger>
          <TabsTrigger value="suscripcion" className="gap-1.5 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard className="h-4 w-4" /> Suscripción
          </TabsTrigger>
          <TabsTrigger value="timbres" className="gap-1.5 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Stamp className="h-4 w-4" /> Timbres
          </TabsTrigger>
          <TabsTrigger value="facturacion" className="gap-1.5 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Receipt className="h-4 w-4" /> Facturación
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: General ═══ */}
        <TabsContent value="general">
          <Card className="border border-border/60 shadow-sm max-w-2xl">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> Datos de empresa
                </h3>
                {!editingEmpresa ? (
                  <Button size="sm" variant="outline" onClick={() => setEditingEmpresa(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingEmpresa(false)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" disabled={savingEmpresa} onClick={saveEmpresa}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Guardar
                    </Button>
                  </div>
                )}
              </div>

              {editingEmpresa ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'nombre', label: 'Nombre' },
                    { key: 'email', label: 'Email' },
                    { key: 'telefono', label: 'Teléfono' },
                    { key: 'rfc', label: 'RFC' },
                    { key: 'razon_social', label: 'Razón Social' },
                    { key: 'direccion', label: 'Dirección' },
                    { key: 'cp', label: 'C.P.' },
                    { key: 'ciudad', label: 'Ciudad' },
                    { key: 'estado', label: 'Estado' },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-sm text-muted-foreground">{label}</Label>
                      <Input
                        value={empresaForm[key] || ''}
                        onChange={e => setEmpresaForm((f: any) => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                  <InfoRow icon={Mail} label="Email" value={empresa.email} />
                  <InfoRow icon={Phone} label="Teléfono" value={empresa.telefono} />
                  <InfoRow icon={FileText} label="RFC" value={empresa.rfc} />
                  <InfoRow icon={FileText} label="Razón Social" value={empresa.razon_social} />
                  <InfoRow icon={MapPin} label="Dirección" value={empresa.direccion} />
                  <InfoRow icon={MapPin} label="C.P." value={empresa.cp} />
                  <InfoRow icon={MapPin} label="Ciudad" value={[empresa.ciudad, empresa.estado].filter(Boolean).join(', ')} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Usuarios ═══ */}
        <TabsContent value="usuarios">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Usuarios de {empresa.nombre}
              </h3>
              <Button
                variant="outline"
                size="sm"
                disabled={forcingAll || allUsers.length === 0}
                onClick={handleForceChangeAll}
                className="gap-1.5"
              >
                {forcingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Forzar cambio de contraseña a todos
              </Button>
            </div>

            {allUsers.length === 0 ? (
              <Card className="border border-border/60">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Sin usuarios registrados
                </CardContent>
              </Card>
            ) : (
              <div className="border border-border/60 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-card">
                      <TableHead className="font-semibold">Nombre</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Teléfono</TableHead>
                      <TableHead className="font-semibold">Rol</TableHead>
                      <TableHead className="font-semibold">Último acceso</TableHead>
                      <TableHead className="font-semibold">Registro</TableHead>
                      <TableHead className="font-semibold text-center w-28">Contraseña</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUsers.map((u: any) => (
                      <TableRow key={u.id} className="hover:bg-card/50">
                        <TableCell className="font-medium">{u.nombre || 'Sin nombre'}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{u.telefono || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.rol || 'Sin rol'}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.last_sign_in_at
                            ? format(new Date(u.last_sign_in_at), 'dd MMM yyyy HH:mm', { locale: es })
                            : 'Nunca'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              setResetDialog({ userId: u.id, email: u.email, nombre: u.nombre || u.email });
                              setResetPassword('');
                              setResetForceChange(true);
                            }}
                          >
                            <KeyRound className="h-3.5 w-3.5" /> Resetear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: Suscripción ═══ */}
        <TabsContent value="suscripcion">
          <Card className="border border-border/60 shadow-sm max-w-2xl">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Suscripción
                </h3>
                {subscription && !editingSub ? (
                  <Button size="sm" variant="outline" onClick={() => setEditingSub(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                ) : subscription && editingSub ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingSub(false)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" disabled={savingSub} onClick={saveSub}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Guardar
                    </Button>
                  </div>
                ) : null}
              </div>

              {!subscription ? (
                <p className="text-muted-foreground py-8 text-center">Sin suscripción activa</p>
              ) : editingSub ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Plan</Label>
                    <Select value={subForm.plan_id} onValueChange={v => setSubForm((f: any) => ({ ...f, plan_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Sin plan" /></SelectTrigger>
                      <SelectContent>
                        {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} — ${p.precio_por_usuario}/usr</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Status</Label>
                    <Select value={subForm.status} onValueChange={v => setSubForm((f: any) => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s]?.l || s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Máx. usuarios</Label>
                    <Input type="number" min={1} value={subForm.max_usuarios}
                      onChange={e => setSubForm((f: any) => ({ ...f, max_usuarios: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Descuento %</Label>
                    <Input type="number" min={0} max={100} value={subForm.descuento_porcentaje}
                      onChange={e => setSubForm((f: any) => ({ ...f, descuento_porcentaje: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Fin trial</Label>
                    <Input type="date" value={subForm.trial_ends_at}
                      onChange={e => setSubForm((f: any) => ({ ...f, trial_ends_at: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Inicio período</Label>
                    <Input type="date" value={subForm.current_period_start}
                      onChange={e => setSubForm((f: any) => ({ ...f, current_period_start: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Fin período</Label>
                    <Input type="date" value={subForm.current_period_end}
                      onChange={e => setSubForm((f: any) => ({ ...f, current_period_end: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <Badge variant={STATUS_MAP[subscription.status]?.v || 'outline'} className="mt-1">
                      {STATUS_MAP[subscription.status]?.l || subscription.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="font-medium mt-1">{subscription.subscription_plans?.nombre || 'Sin plan'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Usuarios</p>
                    <p className="font-medium mt-1">{profiles.length} / {subscription.max_usuarios}</p>
                  </div>
                  {subscription.subscription_plans?.precio_por_usuario && (
                    <div>
                      <p className="text-sm text-muted-foreground">Precio/usuario</p>
                      <p className="font-medium mt-1">{fmtMXN(subscription.subscription_plans.precio_por_usuario)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Próximo cobro</p>
                    <p className="font-medium mt-1">
                      {subscription.current_period_end
                        ? (() => {
                            const d = new Date(subscription.current_period_end);
                            const normalized = d.getDate() === 1 ? d : new Date(d.getFullYear(), d.getMonth() + 1, 1);
                            return format(normalized, "dd MMM yyyy", { locale: es });
                          })()
                        : '—'}
                    </p>
                  </div>
                  {daysLeft !== null && (
                    <div>
                      <p className="text-sm text-muted-foreground">Días restantes</p>
                      <Badge variant={daysLeft <= 3 ? 'destructive' : daysLeft <= 7 ? 'secondary' : 'outline'} className="mt-1">
                        {daysLeft <= 0 ? 'Vencido' : `${daysLeft} días`}
                      </Badge>
                    </div>
                  )}
                  {subscription.trial_ends_at && subscription.status === 'trial' && (
                    <div>
                      <p className="text-sm text-muted-foreground">Fin trial</p>
                      <p className="font-medium mt-1">{format(new Date(subscription.trial_ends_at), "dd MMM yyyy", { locale: es })}</p>
                    </div>
                  )}
                  {subscription.stripe_customer_id && (
                    <div>
                      <p className="text-sm text-muted-foreground">Stripe Customer</p>
                      <p className="font-mono text-sm mt-1 text-muted-foreground">{subscription.stripe_customer_id}</p>
                    </div>
                  )}
                  {subscription.card_last4 && (
                    <div>
                      <p className="text-sm text-muted-foreground">Tarjeta</p>
                      <p className="font-mono font-medium mt-1">
                        {subscription.card_brand ? `${subscription.card_brand} ` : ''}•••• {subscription.card_last4}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Timbres ═══ */}
        <TabsContent value="timbres">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Saldo + Venta */}
            <Card className="border border-border/60 shadow-sm">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Stamp className="h-4 w-4 text-primary" /> Timbres CFDI
                  </h3>
                  <Button variant="outline" size="sm" onClick={() => setShowTimbresSale(!showTimbresSale)}>
                    <ShoppingCart className="h-4 w-4 mr-1.5" /> Nueva venta
                  </Button>
                </div>

                <div className="flex items-center justify-between bg-card rounded-lg p-4">
                  <span className="text-muted-foreground">Saldo actual</span>
                  <span className={`text-3xl font-bold font-mono ${timbres > 0 ? 'text-primary' : 'text-destructive'}`}>
                    {timbres}
                  </span>
                </div>

                {showTimbresSale && (
                  <div className="border border-border/60 rounded-lg p-4 space-y-3 bg-card/80">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <ShoppingCart className="h-4 w-4 text-primary" /> Registrar venta de timbres
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Paquetes (×100)</Label>
                        <Input type="number" min={1} value={timbresForm.paquetes}
                          onChange={e => setTimbresForm(f => ({ ...f, paquetes: parseInt(e.target.value) || 1 }))}
                          className="font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Precio/timbre</Label>
                        <Input type="number" min={0} step={0.5} value={timbresForm.precio_timbre}
                          onChange={e => setTimbresForm(f => ({ ...f, precio_timbre: parseFloat(e.target.value) || 0 }))}
                          className="font-mono" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1">
                        <Percent className="h-3.5 w-3.5" /> Descuento (%)
                      </Label>
                      <Input type="number" min={0} max={100} value={timbresForm.descuento_pct}
                        onChange={e => setTimbresForm(f => ({ ...f, descuento_pct: parseFloat(e.target.value) || 0 }))}
                        className="font-mono" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm">Notas</Label>
                      <Textarea value={timbresForm.notas}
                        onChange={e => setTimbresForm(f => ({ ...f, notas: e.target.value }))}
                        className="resize-none h-16" placeholder="Notas de la venta..." />
                    </div>

                    <div className="bg-background border border-border/40 rounded-lg p-3 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{timbresCount} timbres × ${timbresForm.precio_timbre}</span>
                        <span>{fmtMXN(timbresSubtotal)}</span>
                      </div>
                      {timbresForm.descuento_pct > 0 && (
                        <div className="flex justify-between text-sm text-primary">
                          <span>Descuento ({timbresForm.descuento_pct}%)</span>
                          <span>-{fmtMXN(timbresDescuento)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total</span>
                        <span>{fmtMXN(timbresTotal)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="generar-factura"
                        checked={timbresForm.generar_factura}
                        onCheckedChange={v => setTimbresForm(f => ({ ...f, generar_factura: !!v }))}
                      />
                      <Label htmlFor="generar-factura" className="text-sm cursor-pointer">
                        Generar factura Stripe y enviar por correo
                      </Label>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setShowTimbresSale(false)}>
                        Cancelar
                      </Button>
                      <Button className="flex-1" disabled={addingTimbres} onClick={handleTimbresSale}>
                        {addingTimbres ? 'Procesando...' : `Vender ${timbresCount} timbres`}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Historial */}
            <Card className="border border-border/60 shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                  <History className="h-4 w-4 text-primary" /> Historial de movimientos
                </h3>
                {timbresMovimientos.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Sin movimientos</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {timbresMovimientos.map(m => (
                      <div key={m.id} className="flex items-start justify-between border border-border/30 rounded-lg p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={m.tipo === 'compra' || m.tipo === 'recarga' ? 'default' : 'secondary'}>
                              {m.tipo === 'compra' ? '🛒 Compra' : m.tipo === 'consumo' ? '📄 Uso' : m.tipo === 'recarga' ? '🔄 Recarga' : m.tipo}
                            </Badge>
                            <span className={`font-mono font-semibold ${m.cantidad >= 0 ? 'text-primary' : 'text-destructive'}`}>
                              {m.cantidad >= 0 ? '+' : ''}{m.cantidad}
                            </span>
                          </div>
                          {m.notas && <p className="text-sm text-muted-foreground mt-1 truncate">{m.notas}</p>}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-mono text-muted-foreground text-sm">→ {m.saldo_nuevo}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'dd/MM/yy HH:mm')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB: Facturación ═══ */}
        <TabsContent value="facturacion">
          <div className="space-y-6">
            {/* Internal invoices */}
            <Card className="border border-border/60 shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                  <Receipt className="h-4 w-4 text-primary" /> Facturas internas ({facturas.length})
                </h3>
                {facturas.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Sin facturas registradas</p>
                ) : (
                  <div className="border border-border/60 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-card">
                          <TableHead>Número</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead>Usuarios</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Pagada</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {facturas.map(f => (
                          <TableRow key={f.id}>
                            <TableCell className="font-mono text-sm">{f.numero_factura || '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(f.periodo_inicio), 'dd MMM', { locale: es })} — {format(new Date(f.periodo_fin), 'dd MMM yy', { locale: es })}
                            </TableCell>
                            <TableCell>{f.num_usuarios}</TableCell>
                            <TableCell className="font-semibold">{fmtMXN(f.total)}</TableCell>
                            <TableCell>
                              <Badge variant={f.estado === 'pagada' ? 'default' : f.estado === 'pendiente' ? 'destructive' : 'secondary'}>
                                {f.estado || 'pendiente'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {f.fecha_pago ? format(new Date(f.fecha_pago), 'dd MMM yyyy', { locale: es }) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stripe invoices */}
            {stripeInvoices.length > 0 && (
              <Card className="border border-border/60 shadow-sm">
                <CardContent className="pt-6">
                  <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                    <ExternalLink className="h-4 w-4 text-primary" /> Facturas Stripe ({stripeInvoices.length})
                  </h3>
                  <div className="border border-border/60 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-card">
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
                            <TableCell className="font-mono text-sm">{inv.number || '—'}</TableCell>
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
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetDialog} onOpenChange={open => { if (!open) setResetDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-primary" /> Restablecer contraseña
            </DialogTitle>
            <DialogDescription className="text-base">
              {resetDialog?.nombre} — <span className="font-mono">{resetDialog?.email}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Nueva contraseña temporal</Label>
              <Input
                type="text"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="font-mono text-base"
              />
            </div>
            <div className="flex items-center gap-3 bg-card rounded-lg p-3">
              <Checkbox
                id="force-change"
                checked={resetForceChange}
                onCheckedChange={(v) => setResetForceChange(!!v)}
              />
              <label htmlFor="force-change" className="text-sm cursor-pointer leading-tight">
                <span className="font-medium">Forzar cambio al iniciar sesión</span>
                <br />
                <span className="text-muted-foreground text-xs">El usuario verá un modal para crear una nueva contraseña antes de poder usar la app</span>
              </label>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setResetDialog(null)}>
                Cancelar
              </Button>
              <Button
                disabled={resettingPw || resetPassword.length < 6}
                onClick={handleResetPassword}
              >
                {resettingPw ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Restablecer contraseña
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-foreground font-medium">{value || '—'}</p>
      </div>
    </div>
  );
}
