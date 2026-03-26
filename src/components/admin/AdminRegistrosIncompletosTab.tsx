import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Phone, RefreshCw, UserPlus, Loader2, Clock, AlertCircle, Send, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface IncompleteRegistration {
  phone: string;
  ultimo_intento: string;
  total_intentos: number;
  alguna_verificada: boolean;
}

export default function AdminRegistrosIncompletosTab() {
  const [registros, setRegistros] = useState<IncompleteRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [createForm, setCreateForm] = useState({ empresa: '', email: '', nombre: '', password: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadRegistros(); }, []);

  async function loadRegistros() {
    setLoading(true);
    try {
      // Get all phones from otp_codes that don't have an empresa
      const { data: otpData, error: otpErr } = await supabase
        .from('otp_codes')
        .select('phone, created_at, verified')
        .order('created_at', { ascending: false });

      if (otpErr) throw otpErr;

      // Get all empresa phones
      const { data: empresas } = await supabase
        .from('empresas')
        .select('telefono');

      const empresaPhones = new Set((empresas ?? []).map(e => e.telefono).filter(Boolean));

      // Group by phone, exclude those with empresa
      const phoneMap = new Map<string, { ultimo: string; count: number; verified: boolean }>();
      (otpData ?? []).forEach(o => {
        if (empresaPhones.has(o.phone)) return;
        const existing = phoneMap.get(o.phone);
        if (!existing) {
          phoneMap.set(o.phone, { ultimo: o.created_at, count: 1, verified: !!o.verified });
        } else {
          existing.count++;
          if (o.verified) existing.verified = true;
          if (new Date(o.created_at) > new Date(existing.ultimo)) existing.ultimo = o.created_at;
        }
      });

      const result: IncompleteRegistration[] = [...phoneMap.entries()]
        .map(([phone, data]) => ({
          phone,
          ultimo_intento: data.ultimo,
          total_intentos: data.count,
          alguna_verificada: data.verified,
        }))
        .sort((a, b) => new Date(b.ultimo_intento).getTime() - new Date(a.ultimo_intento).getTime());

      setRegistros(result);
    } catch (err: any) {
      console.error('Error loading incomplete registrations:', err);
      toast.error('Error al cargar registros');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp(phone: string) {
    setResending(phone);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { action: 'send', phone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Código OTP reenviado por WhatsApp');
      loadRegistros();
    } catch (err: any) {
      toast.error(err.message || 'Error al reenviar OTP');
    } finally {
      setResending(null);
    }
  }

  function openCreateDialog(phone: string) {
    setSelectedPhone(phone);
    setCreateForm({ empresa: '', email: '', nombre: '', password: '' });
    setShowCreateDialog(true);
  }

  async function handleManualCreate() {
    if (!createForm.empresa || !createForm.email || !createForm.password || !createForm.nombre) {
      toast.error('Completa todos los campos');
      return;
    }
    setCreating(true);
    try {
      // 1. Create auth user
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No session');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create_user_with_empresa',
            email: createForm.email,
            password: createForm.password,
            nombre: createForm.nombre,
            empresa_nombre: createForm.empresa,
            telefono: selectedPhone,
          }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      toast.success(`Empresa "${createForm.empresa}" creada exitosamente`);
      setShowCreateDialog(false);
      loadRegistros();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear empresa');
    } finally {
      setCreating(false);
    }
  }

  const filtered = registros.filter(r =>
    !search || r.phone.includes(search)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando registros incompletos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Registros incompletos</h2>
          <p className="text-xs text-muted-foreground">
            Teléfonos que recibieron OTP pero nunca completaron el registro ({registros.length})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar teléfono..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 w-48 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={loadRegistros}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border border-border/60">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-foreground">{registros.length}</div>
            <div className="text-xs text-muted-foreground">Total incompletos</div>
          </CardContent>
        </Card>
        <Card className="border border-border/60">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-amber-500">
              {registros.filter(r => r.alguna_verificada).length}
            </div>
            <div className="text-xs text-muted-foreground">Verificaron código</div>
          </CardContent>
        </Card>
        <Card className="border border-border/60">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-destructive">
              {registros.filter(r => !r.alguna_verificada).length}
            </div>
            <div className="text-xs text-muted-foreground">Nunca verificaron</div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          {search ? 'No se encontraron resultados' : 'No hay registros incompletos 🎉'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card key={r.phone} className="border border-border/60 hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground">{r.phone}</div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(r.ultimo_intento), "d MMM yyyy, HH:mm", { locale: es })}
                        <span>·</span>
                        <span>{r.total_intentos} intento{r.total_intentos > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={r.alguna_verificada ? 'default' : 'destructive'} className="text-[10px]">
                      {r.alguna_verificada ? 'Código verificado' : 'No verificó'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      disabled={resending === r.phone}
                      onClick={() => handleResendOtp(r.phone)}
                    >
                      {resending === r.phone ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Send className="h-3 w-3 mr-1" />
                      )}
                      Reenviar OTP
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => openCreateDialog(r.phone)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" /> Crear empresa
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manual Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Completar registro manualmente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-card rounded-lg p-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{selectedPhone}</span>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nombre de la empresa *</Label>
                <Input
                  value={createForm.empresa}
                  onChange={e => setCreateForm(f => ({ ...f, empresa: e.target.value }))}
                  placeholder="Ej: Distribuidora López"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Nombre del usuario *</Label>
                <Input
                  value={createForm.nombre}
                  onChange={e => setCreateForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Juan López"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Correo electrónico *</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Contraseña temporal *</Label>
                <Input
                  type="text"
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Se creará la empresa, el usuario y se le asignará un trial de 7 días automáticamente.
                  Comparte las credenciales por WhatsApp al teléfono registrado.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
              <Button onClick={handleManualCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Crear empresa y usuario
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
