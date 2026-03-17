import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { BanknoteIcon, Search, Check, X, Eye, RotateCcw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface SolicitudRow {
  id: string;
  empresa_id: string;
  user_id: string;
  tipo: string;
  concepto: string;
  monto_centavos: number;
  metodo: string;
  comprobante_url: string | null;
  notas: string | null;
  status: string;
  notas_admin: string | null;
  plan_price_id: string | null;
  cantidad_usuarios: number | null;
  cantidad_timbres: number | null;
  created_at: string;
  empresas?: { nombre: string };
  profiles?: { nombre: string };
}

export default function AdminPaymentRequestsTab() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSol, setSelectedSol] = useState<SolicitudRow | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('solicitudes_pago')
      .select('*, empresas(nombre)')
      .order('created_at', { ascending: false })
      .limit(200);
    setSolicitudes((data as any) || []);
    setLoading(false);
  }

  async function handleApprove() {
    if (!selectedSol || !user) return;
    setProcessing(true);
    try {
      // Update solicitud status
      await supabase.from('solicitudes_pago').update({
        status: 'aprobado',
        aprobado_por: user.id,
        fecha_aprobacion: new Date().toISOString(),
        notas_admin: adminNotes || null,
      }).eq('id', selectedSol.id);

      // If subscription payment, activate subscription
      if (selectedSol.tipo === 'suscripcion') {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await supabase.from('subscriptions').update({
          status: 'active',
          max_usuarios: selectedSol.cantidad_usuarios || 3,
          current_period_start: now.toISOString(),
          current_period_end: nextMonth.toISOString(),
          updated_at: now.toISOString(),
        }).eq('empresa_id', selectedSol.empresa_id);
      }

      // If timbres purchase, add timbres
      if (selectedSol.tipo === 'timbres' && selectedSol.cantidad_timbres) {
        await supabase.rpc('add_timbres', {
          p_empresa_id: selectedSol.empresa_id,
          p_cantidad: selectedSol.cantidad_timbres,
          p_user_id: user.id,
          p_notas: `Pago por transferencia aprobado — solicitud ${selectedSol.id}`,
        });
      }

      toast.success('Solicitud aprobada y activada');
      setSelectedSol(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!selectedSol || !user) return;
    setProcessing(true);
    try {
      await supabase.from('solicitudes_pago').update({
        status: 'rechazado',
        aprobado_por: user.id,
        fecha_aprobacion: new Date().toISOString(),
        notas_admin: adminNotes || null,
      }).eq('id', selectedSol.id);
      toast.success('Solicitud rechazada');
      setSelectedSol(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pendiente: { label: '⏳ Pendiente', variant: 'secondary' },
      aprobado: { label: '✅ Aprobado', variant: 'default' },
      rechazado: { label: '❌ Rechazado', variant: 'destructive' },
    };
    const m = map[s] || { label: s, variant: 'outline' as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  const pendingCount = solicitudes.filter(s => s.status === 'pendiente').length;
  const filtered = solicitudes.filter(s =>
    (s.empresas?.nombre || '').toLowerCase().includes(search.toLowerCase()) ||
    s.concepto.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BanknoteIcon className="h-5 w-5 text-primary" />
              Solicitudes de Pago
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1">{pendingCount} pendientes</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
              </div>
              <Button size="sm" variant="outline" onClick={load}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Sin solicitudes de pago
                    </TableCell>
                  </TableRow>
                ) : filtered.map(s => (
                  <TableRow key={s.id} className={s.status === 'pendiente' ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(s.created_at), 'dd MMM yy HH:mm', { locale: es })}
                    </TableCell>
                    <TableCell className="font-medium">{s.empresas?.nombre || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {s.tipo === 'suscripcion' ? '📋 Suscripción' : '🏷️ Timbres'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-48 truncate">{s.concepto}</TableCell>
                    <TableCell className="font-semibold">
                      ${(s.monto_centavos / 100).toLocaleString('es-MX')} MXN
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedSol(s); setAdminNotes(s.notas_admin || ''); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail / Approve dialog */}
      <Dialog open={!!selectedSol} onOpenChange={open => !open && setSelectedSol(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitud de Pago — {selectedSol?.empresas?.nombre}</DialogTitle>
          </DialogHeader>
          {selectedSol && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> {selectedSol.tipo}</div>
                <div><span className="text-muted-foreground">Método:</span> {selectedSol.metodo}</div>
                <div><span className="text-muted-foreground">Monto:</span> <strong>${(selectedSol.monto_centavos / 100).toLocaleString('es-MX')} MXN</strong></div>
                <div>{statusBadge(selectedSol.status)}</div>
              </div>

              <div className="rounded-lg bg-accent/50 p-3 text-sm">
                <strong>Concepto:</strong> {selectedSol.concepto}
              </div>

              {selectedSol.notas && (
                <div className="rounded-lg bg-accent/50 p-3 text-sm">
                  <strong>Notas del cliente:</strong> {selectedSol.notas}
                </div>
              )}

              {selectedSol.cantidad_usuarios && (
                <div className="text-sm"><span className="text-muted-foreground">Usuarios solicitados:</span> {selectedSol.cantidad_usuarios}</div>
              )}
              {selectedSol.cantidad_timbres && (
                <div className="text-sm"><span className="text-muted-foreground">Timbres solicitados:</span> {selectedSol.cantidad_timbres}</div>
              )}

              {selectedSol.status === 'pendiente' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Notas del admin</label>
                    <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Notas opcionales..." rows={2} />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="destructive" onClick={handleReject} disabled={processing}>
                      {processing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      <X className="h-4 w-4 mr-1" /> Rechazar
                    </Button>
                    <Button onClick={handleApprove} disabled={processing}>
                      {processing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      <Check className="h-4 w-4 mr-1" /> Aprobar y Activar
                    </Button>
                  </DialogFooter>
                </>
              )}

              {selectedSol.status !== 'pendiente' && selectedSol.notas_admin && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <strong>Notas admin:</strong> {selectedSol.notas_admin}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
