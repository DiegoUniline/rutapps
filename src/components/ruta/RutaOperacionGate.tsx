import { useState } from 'react';
import { CloudOff, RefreshCw, Download, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { downloadAllData } from '@/lib/offlineSync';
import { processSyncQueue } from '@/lib/syncQueue';
import { requestPersistentStorage } from '@/lib/syncDiagnostics';
import { useRutaReadiness, type RutaOperacion } from '@/lib/rutaReadiness';

const TITULOS: Record<RutaOperacion, string> = {
  venta: 'No puedes vender todavía',
  cobro: 'No puedes cobrar todavía',
  devolucion: 'No puedes registrar devoluciones',
  gasto: 'No puedes registrar gastos',
  visita: 'No puedes registrar visitas',
  entrega: 'No puedes registrar entregas',
  inventario: 'No puedes mover inventario',
};

/**
 * Portero de operaciones de /ruta: si falta algún dato indispensable en la
 * copia local, la pantalla no se monta. Evita documentos con precios,
 * promociones o permisos incorrectos por información incompleta.
 */
export function RutaOperacionGate({ operacion, children }: { operacion: RutaOperacion; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const { isOnline } = useNetworkStatus();
  const { loading, puede, motivos, refrescar } = useRutaReadiness();
  const [sincronizando, setSincronizando] = useState(false);
  const [activando, setActivando] = useState(false);
  const [paso, setPaso] = useState<string | null>(null);

  // Sincroniza sin salir de la pantalla: envía pendientes, descarga todo y
  // vuelve a evaluar si ya se puede operar.
  const sincronizarAqui = async () => {
    if (!empresa?.id || sincronizando) return;
    if (!isOnline) { toast.error('Sin conexión: conéctate para sincronizar'); return; }
    setSincronizando(true);
    try {
      setPaso('Enviando cambios pendientes…');
      try { await processSyncQueue(); } catch { /* se reintenta después */ }
      setPaso('Descargando información…');
      const result = await downloadAllData(empresa.id, true, (progress) => {
        const actual = progress.find(p => p.status === 'syncing');
        if (actual) setPaso(`Descargando ${actual.label}…`);
      });
      setPaso('Verificando…');
      await refrescar();
      toast.success(`Sincronización completa: ${result.rowsDownloaded.toLocaleString()} registros`);
    } catch (err: any) {
      toast.error('No se pudo sincronizar: ' + (err?.message || 'Error desconocido'));
    } finally {
      setPaso(null);
      setSincronizando(false);
    }
  };

  // Activa el modo offline: pide almacenamiento persistente para que el
  // sistema no borre la copia local del dispositivo.
  const activarOffline = async () => {
    if (activando) return;
    setActivando(true);
    try {
      const ok = await requestPersistentStorage();
      if (ok) toast.success('Modo offline activado: tus datos quedan protegidos en este dispositivo');
      else toast.warning('Tu navegador no permitió el almacenamiento permanente, pero puedes seguir trabajando sin conexión');
      await refrescar();
    } finally {
      setActivando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (puede(operacion)) return <>{children}</>;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <CloudOff className="w-7 h-7 text-destructive" />
      </div>
      <div>
        <h1 className="text-lg font-semibold">{TITULOS[operacion]}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Falta información en este dispositivo. Conéctate y sincroniza para continuar.
        </p>
      </div>
      <ul className="text-left text-[13px] bg-muted/40 rounded-xl p-3 w-full max-w-sm space-y-1">
        {motivos(operacion).map(m => (
          <li key={m} className="flex gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
            <span>{m}</span>
          </li>
        ))}
      </ul>
      <div className="w-full max-w-sm space-y-2">
        <button
          onClick={sincronizarAqui}
          disabled={sincronizando || !isOnline}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {sincronizando
            ? <RefreshCw className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4" />}
          {sincronizando ? (paso ?? 'Sincronizando…') : 'Sincronizar ahora'}
        </button>
        <button
          onClick={activarOffline}
          disabled={activando}
          className="w-full h-11 rounded-xl border border-border font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {activando
            ? <RefreshCw className="w-4 h-4 animate-spin" />
            : <ShieldCheck className="w-4 h-4" />}
          Activar modo offline
        </button>
        {!isOnline && (
          <p className="text-[11px] text-muted-foreground">Sin conexión: conéctate para poder sincronizar.</p>
        )}
        <div className="flex gap-2">
          <button onClick={refrescar} className="flex-1 h-10 rounded-xl border border-border font-medium text-sm">
            Revisar de nuevo
          </button>
          <button onClick={() => navigate('/ruta/sincronizar')} className="flex-1 h-10 rounded-xl border border-border font-medium text-sm">
            Ver detalles
          </button>
        </div>
      </div>
    </div>
  );
}
