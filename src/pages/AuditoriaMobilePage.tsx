import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Lock, Camera, X, Plus, Package, Search, User, CheckCircle2, ChevronDown, ChevronRight, Trash2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type PageState = 'loading' | 'not_found' | 'closed' | 'name_entry' | 'counting';

interface EmpresaUser {
  user_id: string;
  nombre: string;
}

interface AuditoriaData {
  id: string;
  nombre: string;
  status: string;
  cerrada_por: string | null;
  cerrada_at: string | null;
  empresa_id: string;
}

interface LineaItem {
  id: string;
  producto_id: string;
  producto_nombre: string;
  producto_codigo: string;
  cantidad_esperada: number;
  cerrada: boolean;
}

interface ScanTotal {
  [lineaId: string]: number;
}

export default function AuditoriaMobilePage() {
  const { auditoria_id } = useParams<{ auditoria_id: string }>();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [auditoria, setAuditoria] = useState<AuditoriaData | null>(null);
  const [lineas, setLineas] = useState<LineaItem[]>([]);
  const [auditorName, setAuditorName] = useState('');
  const [empresaUsers, setEmpresaUsers] = useState<EmpresaUser[]>([]);
  const [scanTotals, setScanTotals] = useState<ScanTotal>({});
  const [search, setSearch] = useState('');
  const [manualQty, setManualQty] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [showCloseAll, setShowCloseAll] = useState(false);
  const [lineToClose, setLineToClose] = useState<LineaItem | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<any>(null);

  // Load audit data
  useEffect(() => {
    if (!auditoria_id) { setPageState('not_found'); return; }

    const load = async () => {
      const { data: aud, error } = await supabase
        .from('auditorias')
        .select('id, nombre, status, cerrada_por, cerrada_at, empresa_id')
        .eq('id', auditoria_id)
        .single();

      if (error || !aud) { setPageState('not_found'); return; }

      setAuditoria(aud as any);

      if (aud.status === 'cerrada' || aud.status === 'aprobada' || aud.status === 'rechazada') {
        setPageState('closed');
        return;
      }

      // Load lines
      const { data: lines } = await supabase
        .from('auditoria_lineas')
        .select('id, producto_id, cantidad_esperada, cerrada, productos(nombre, codigo)')
        .eq('auditoria_id', auditoria_id)
        .order('created_at', { ascending: true });

      setLineas((lines ?? []).map((l: any) => ({
        id: l.id,
        producto_id: l.producto_id,
        producto_nombre: (l.productos as any)?.nombre ?? 'Producto',
        producto_codigo: (l.productos as any)?.codigo ?? '',
        cantidad_esperada: l.cantidad_esperada,
        cerrada: l.cerrada ?? false,
      })));

      // Load existing scans
      const { data: scans } = await supabase
        .from('auditoria_escaneos')
        .select('linea_id, cantidad')
        .eq('auditoria_id', auditoria_id);

      const totals: ScanTotal = {};
      (scans ?? []).forEach((s: any) => {
        totals[s.linea_id] = (totals[s.linea_id] ?? 0) + Number(s.cantidad);
      });
      setScanTotals(totals);

      // Load empresa users via RPC
      const { data: users } = await supabase.rpc('get_audit_users', { p_auditoria_id: auditoria_id });
      setEmpresaUsers((users as any[]) ?? []);

      // Check localStorage for name
      const saved = localStorage.getItem(`auditor_nombre_${auditoria_id}`);
      if (saved) {
        setAuditorName(saved);
        setPageState('counting');
      } else {
        setPageState('name_entry');
      }
    };

    load();

    // Realtime: listen for audit status changes
    const channel = supabase
      .channel(`auditoria-status-${auditoria_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auditorias',
          filter: `id=eq.${auditoria_id}`,
        },
        (payload: any) => {
          const newStatus = payload.new?.status;
          if (newStatus === 'cerrada' || newStatus === 'aprobada' || newStatus === 'rechazada') {
            setAuditoria(prev => prev ? {
              ...prev,
              status: newStatus,
              cerrada_por: payload.new?.cerrada_por ?? prev.cerrada_por,
              cerrada_at: payload.new?.cerrada_at ?? prev.cerrada_at,
            } : prev);
            setPageState('closed');
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [auditoria_id]);

  const handleStartCounting = () => {
    if (!auditorName.trim()) { toast.error('Ingresa tu nombre'); return; }
    localStorage.setItem(`auditor_nombre_${auditoria_id}`, auditorName.trim());
    setPageState('counting');
  };

  const handleCloseLineMobile = async (line: LineaItem, cerrar: boolean) => {
    try {
      await supabase.rpc('close_audit_line', { p_linea_id: line.id, p_cerrada: cerrar });
      setLineas(prev => prev.map(l => l.id === line.id ? { ...l, cerrada: cerrar } : l));
      toast.success(cerrar ? `"${line.producto_nombre}" cerrada` : `"${line.producto_nombre}" reabierta`);
    } catch { toast.error('Error'); }
    setLineToClose(null);
  };

  const handleCloseAllMobile = async () => {
    if (!auditoria_id) return;
    try {
      await supabase.rpc('close_full_audit', { p_auditoria_id: auditoria_id, p_cerrada_por: auditorName });
      setAuditoria(prev => prev ? { ...prev, status: 'cerrada', cerrada_por: auditorName, cerrada_at: new Date().toISOString() } : prev);
      setPageState('closed');
      toast.success('Auditoría cerrada');
    } catch { toast.error('Error al cerrar'); }
    setShowCloseAll(false);
  };

  const addScan = useCallback(async (lineaId: string, qty: number) => {
    if (!auditoria_id) return;
    const line = lineas.find(l => l.id === lineaId);
    if (line?.cerrada) { toast.error('Esta línea ya fue cerrada'); return; }

    // Optimistic
    setScanTotals(prev => ({ ...prev, [lineaId]: (prev[lineaId] ?? 0) + qty }));

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    try {
      const { error } = await supabase.from('auditoria_escaneos').insert({
        auditoria_id,
        linea_id: lineaId,
        cantidad: qty,
        escaneado_por: auditorName,
      } as any);

      if (error) throw error;

      // Also update cantidad_real on the line
      const newTotal = (scanTotals[lineaId] ?? 0) + qty;
      await supabase.from('auditoria_lineas').update({
        cantidad_real: newTotal,
        diferencia: newTotal - (lineas.find(l => l.id === lineaId)?.cantidad_esperada ?? 0),
      } as any).eq('id', lineaId);

    } catch (err: any) {
      // Revert
      setScanTotals(prev => ({ ...prev, [lineaId]: (prev[lineaId] ?? 0) - qty }));
      toast.error('Error al guardar');
    }
  }, [auditoria_id, auditorName, scanTotals, lineas]);

  const handleAddManual = (lineaId: string) => {
    const qty = Number(manualQty[lineaId] || 1);
    if (qty <= 0) return;
    addScan(lineaId, qty);
    setManualQty(prev => ({ ...prev, [lineaId]: '' }));
    toast.success(`+${qty} registrado`);
  };

  // QR Scanner
  const startScanner = async () => {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // Find product by code
          const found = lineas.find(l =>
            l.producto_codigo.toLowerCase() === decodedText.toLowerCase() ||
            l.producto_id === decodedText
          );

          if (found) {
            addScan(found.id, 1);
            toast.success(`✓ ${found.producto_nombre}`);
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
          } else {
            toast.error('Producto no asignado a esta auditoría');
            if (navigator.vibrate) navigator.vibrate(200);
          }
        },
        () => {} // ignore errors (no QR in frame)
      );
    } catch (err: any) {
      toast.error('No se pudo acceder a la cámara');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const filtered = useMemo(() => {
    if (!search) return lineas;
    const s = search.toLowerCase();
    return lineas.filter(l =>
      l.producto_nombre.toLowerCase().includes(s) ||
      l.producto_codigo.toLowerCase().includes(s)
    );
  }, [lineas, search]);

  const countedProducts = useMemo(() => {
    return lineas.filter(l => (scanTotals[l.id] ?? 0) > 0).length;
  }, [lineas, scanTotals]);

  // ── LOADING ──
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Cargando auditoría...</div>
      </div>
    );
  }

  // ── NOT FOUND ──
  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <Package className="h-16 w-16 text-muted-foreground/30" />
        <h1 className="text-xl font-semibold text-foreground">Auditoría no encontrada</h1>
        <p className="text-sm text-muted-foreground">Verifica que la URL sea correcta o solicita un nuevo enlace.</p>
      </div>
    );
  }

  // ── CLOSED ──
  if (pageState === 'closed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <Lock className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Auditoría Cerrada</h1>
        <p className="text-sm text-muted-foreground">
          {(auditoria as any)?.cerrada_por && <>Cerrada por <strong>{(auditoria as any).cerrada_por}</strong></>}
          {(auditoria as any)?.cerrada_at && <> el {new Date((auditoria as any).cerrada_at).toLocaleDateString('es-MX')}</>}
        </p>
        <p className="text-xs text-muted-foreground">Ya no es posible registrar conteos.</p>
      </div>
    );
  }

  // ── NAME ENTRY ──
  if (pageState === 'name_entry') {
    const filteredUsers = empresaUsers.filter(u =>
      u.nombre.toLowerCase().includes(userSearch.toLowerCase())
    );

    const selectUser = (name: string) => {
      setAuditorName(name);
      localStorage.setItem(`auditor_nombre_${auditoria_id}`, name);
      setPageState('counting');
    };

    return (
      <div className="min-h-screen flex flex-col bg-background" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="px-5 pt-8 pb-4 space-y-2 text-center">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{auditoria?.nombre}</h1>
          <p className="text-sm text-muted-foreground">Selecciona tu usuario para comenzar</p>
        </div>

        {empresaUsers.length > 5 && (
          <div className="px-5 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-10"
                placeholder="Buscar usuario..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 pb-6">
          <div className="space-y-2">
            {filteredUsers.map(u => (
              <button
                key={u.user_id}
                onClick={() => selectUser(u.nombre)}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors active:scale-[0.98] hover:bg-accent/50"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <span className="text-base font-medium text-foreground truncate">{u.nombre}</span>
              </button>
            ))}

            {filteredUsers.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                {userSearch ? 'Sin resultados' : 'No hay usuarios registrados'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── COUNTING ──
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Scanner overlay */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4">
            <span className="text-white text-sm font-medium">Escanear código</span>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={stopScanner}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div id="qr-reader" className="flex-1" />
          <p className="text-white/60 text-xs text-center py-4">Apunta al código de barras del producto</p>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate text-foreground">{auditoria?.nombre}</h1>
              <p className="text-xs text-muted-foreground">Auditor: {auditorName}</p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {countedProducts} de {lineas.length}
            </Badge>
          </div>

          {/* Progress */}
          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${lineas.length > 0 ? (countedProducts / lineas.length) * 100 : 0}%` }}
            />
          </div>

          {/* Search + scan button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-10"
                placeholder="Buscar producto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={startScanner}>
              <Camera className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-auto pb-20">
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            {search ? 'Sin resultados' : 'No hay productos'}
          </div>
        )}

        <div className="divide-y divide-border">
          {filtered.map(item => {
            const total = scanTotals[item.id] ?? 0;
            const qtyVal = manualQty[item.id] ?? '';
            const diff = total - item.cantidad_esperada;

            return (
              <div key={item.id} className={cn('bg-card', item.cerrada && 'opacity-60')}>
                {/* Product row */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold truncate text-foreground">{item.producto_nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">{item.producto_codigo}</p>
                        {item.cerrada && <Badge variant="secondary" className="text-[10px] h-4 gap-0.5"><Lock className="h-2.5 w-2.5" />Cerrada</Badge>}
                      </div>
                    </div>

                    {/* Count badge */}
                    <Badge variant={total > 0 ? 'default' : 'secondary'} className="shrink-0 font-mono text-sm min-w-[32px] justify-center">
                      {total}
                    </Badge>
                  </div>

                  {/* Stats row - always visible */}
                  {total > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                      <span>Esperado: <span className="font-mono">{item.cantidad_esperada}</span></span>
                      <span>Contado: <span className="font-mono font-semibold text-foreground">{total}</span></span>
                      <span>Dif: <span className={cn('font-mono font-semibold', diff !== 0 ? 'text-destructive' : 'text-green-600')}>{diff > 0 ? '+' : ''}{diff}</span></span>
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center gap-2">
                    {item.cerrada ? (
                      <Button size="sm" variant="outline" className="h-9 text-xs gap-1 flex-1" onClick={() => handleCloseLineMobile(item, false)}>
                        <Unlock className="h-3 w-3" /> Reabrir
                      </Button>
                    ) : (
                      <>
                        {/* Manual qty input */}
                        <Input
                          type="number"
                          className="w-16 h-9 text-center font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={qtyVal}
                          placeholder="1"
                          min={1}
                          onChange={e => setManualQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddManual(item.id); }}
                        />

                        {/* + button */}
                        <Button
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => {
                            const qty = Number(qtyVal || 1);
                            if (qty > 0) {
                              addScan(item.id, qty);
                              setManualQty(prev => ({ ...prev, [item.id]: '' }));
                              toast.success(`+${qty}`);
                            }
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>

                        {/* Close line button */}
                        <Button size="sm" variant="secondary" className="h-9 text-xs gap-1 shrink-0" onClick={() => setLineToClose(item)}>
                          <CheckCircle2 className="h-3 w-3" /> Cerrar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border p-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
        <Button variant="destructive" className="w-full h-11 gap-2" onClick={() => setShowCloseAll(true)}>
          <Lock className="h-4 w-4" /> Cerrar Auditoría Completa
        </Button>
      </div>

      {/* Close line dialog */}
      <AlertDialog open={!!lineToClose} onOpenChange={v => !v && setLineToClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar "{lineToClose?.producto_nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>Ya no podrás agregar conteos a este producto. Puedes reabrirlo después.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => lineToClose && handleCloseLineMobile(lineToClose, true)}>Sí, cerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close all dialog */}
      <AlertDialog open={showCloseAll} onOpenChange={setShowCloseAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar toda la auditoría?</AlertDialogTitle>
            <AlertDialogDescription>Ya no se podrán registrar más conteos en ningún producto. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseAllMobile} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, cerrar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
