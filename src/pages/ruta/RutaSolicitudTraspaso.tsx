import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Send, Save, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { queueOperation, queueInsertMany } from '@/lib/syncQueue';
import { fmtNum } from '@/lib/utils';
import { SOLICITUD_STATUS_LABELS, type StatusSolicitudTraspaso } from '@/hooks/useSolicitudesTraspaso';

interface LineaMovil {
  producto_id: string;
  codigo: string;
  nombre: string;
  stock_actual: number;
  minimo: number;
  maximo: number;
  sugerida: number;
  cantidad: number;
}

const nuevoId = () => crypto.randomUUID();

/**
 * Solicitud de resurtido desde /Ruta. Funciona sin señal: el borrador y sus
 * líneas se guardan en IndexedDB y se suben por la cola de sincronización.
 */
export default function RutaSolicitudTraspaso() {
  const navigate = useNavigate();
  const { empresa, profile, user } = useAuth();
  const almacenId = profile?.almacen_id;

  const [search, setSearch] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<LineaMovil[]>([]);
  const [guardando, setGuardando] = useState(false);

  const { data: productos } = useOfflineQuery('productos', {
    empresa_id: empresa?.id, status: 'activo',
  }, { enabled: !!empresa?.id, orderBy: 'nombre' });

  const { data: stock } = useOfflineQuery('stock_almacen', {
    empresa_id: empresa?.id, almacen_id: almacenId,
  }, { enabled: !!empresa?.id && !!almacenId });

  const { data: config } = useOfflineQuery('producto_almacen_config', {
    empresa_id: empresa?.id, almacen_id: almacenId,
  }, { enabled: !!empresa?.id && !!almacenId });

  const { data: misSolicitudes } = useOfflineQuery('solicitudes_traspaso', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id, orderBy: 'fecha' });

  const stockMap = useMemo(
    () => new Map((stock ?? []).map((s: any) => [s.producto_id, Number(s.cantidad) || 0])),
    [stock],
  );
  const configMap = useMemo(
    () => new Map((config ?? []).map((c: any) => [c.producto_id, c])),
    [config],
  );

  const catalogo = useMemo(() => (productos ?? []).map((p: any) => {
    const c: any = configMap.get(p.id);
    const actual = stockMap.get(p.id) ?? 0;
    const minimo = Number(c?.stock_minimo) || 0;
    const maximo = Number(c?.stock_maximo) || 0;
    return {
      producto_id: p.id, codigo: p.codigo, nombre: p.nombre,
      stock_actual: actual, minimo, maximo,
      sugerida: maximo > actual ? maximo - actual : 0,
      bajo: minimo > 0 && actual <= minimo,
    };
  }), [productos, stockMap, configMap]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalogo.slice(0, 40);
    return catalogo.filter(p =>
      p.nombre.toLowerCase().includes(q) || String(p.codigo ?? '').toLowerCase().includes(q),
    ).slice(0, 40);
  }, [catalogo, search]);

  const agregar = (p: typeof catalogo[number]) => {
    if (lineas.some(l => l.producto_id === p.producto_id)) { toast.info('Ya está en la solicitud'); return; }
    setLineas(prev => [...prev, { ...p, cantidad: p.sugerida > 0 ? p.sugerida : 1 }]);
  };

  const cargarBajoMinimo = () => {
    const bajos = catalogo.filter(p => p.bajo);
    if (!bajos.length) { toast.info('No hay productos por debajo del mínimo'); return; }
    setLineas(bajos.map(p => ({ ...p, cantidad: p.sugerida > 0 ? p.sugerida : 1 })));
    toast.success(`${bajos.length} productos por resurtir`);
  };

  const enviar = async (enviarAprobacion: boolean) => {
    if (!almacenId) { toast.error('Tu usuario no tiene almacén asignado'); return; }
    if (lineas.length === 0) { toast.error('Agrega al menos un producto'); return; }
    setGuardando(true);
    try {
      const solicitudId = nuevoId();
      await queueOperation('solicitudes_traspaso', 'insert', {
        id: solicitudId,
        empresa_id: empresa!.id,
        fecha: new Date().toISOString().slice(0, 10),
        status: enviarAprobacion ? 'solicitada' : 'borrador',
        enviado_at: enviarAprobacion ? new Date().toISOString() : null,
        almacen_destino_id: almacenId,
        almacen_origen_id: null,
        solicitante_user_id: user?.id ?? null,
        solicitante_profile_id: profile?.id ?? null,
        observaciones: observaciones || null,
      });
      await queueInsertMany('solicitud_traspaso_lineas', lineas.map(l => ({
        id: nuevoId(),
        solicitud_id: solicitudId,
        producto_id: l.producto_id,
        stock_actual_snapshot: l.stock_actual,
        stock_minimo_snapshot: l.minimo,
        stock_maximo_snapshot: l.maximo,
        cantidad_sugerida: l.sugerida,
        cantidad_solicitada: l.cantidad,
      })), 'solicitud_id');
      toast.success(enviarAprobacion ? 'Solicitud enviada' : 'Borrador guardado');
      setLineas([]); setObservaciones('');
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar la solicitud');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-3 py-3 flex items-center gap-2">
        <button onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-base font-semibold">Solicitar resurtido</h1>
      </header>

      <div className="p-3 space-y-3">
        <button onClick={cargarBajoMinimo} className="w-full py-2.5 rounded bg-primary/10 text-primary text-sm font-medium">
          Cargar productos bajo mínimo
        </button>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..."
            className="w-full pl-8 pr-3 py-2.5 rounded border border-border bg-card text-sm" />
        </div>

        {search && (
          <div className="border border-border rounded divide-y divide-border bg-card max-h-64 overflow-auto">
            {filtrados.map(p => (
              <button key={p.producto_id} onClick={() => agregar(p)} className="w-full text-left px-3 py-2 flex items-center justify-between">
                <span className="text-sm">
                  {p.nombre}
                  <span className="block text-[11px] text-muted-foreground">
                    {p.codigo} · stock {fmtNum(p.stock_actual)}{p.minimo > 0 ? ` · mín ${fmtNum(p.minimo)}` : ''}
                  </span>
                </span>
                <PackagePlus className="h-4 w-4 text-primary shrink-0" />
              </button>
            ))}
            {filtrados.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin resultados</p>}
          </div>
        )}

        <div className="space-y-2">
          {lineas.map(l => (
            <div key={l.producto_id} className="bg-card border border-border rounded p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{l.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Stock {fmtNum(l.stock_actual)} · mín {fmtNum(l.minimo)} · máx {fmtNum(l.maximo)}
                  </p>
                </div>
                <button onClick={() => setLineas(prev => prev.filter(x => x.producto_id !== l.producto_id))}
                  className="text-[11px] text-destructive">Quitar</button>
              </div>
              <input type="number" min={0} step="0.001" value={l.cantidad}
                onChange={e => setLineas(prev => prev.map(x => x.producto_id === l.producto_id
                  ? { ...x, cantidad: Math.max(0, Number(e.target.value) || 0) } : x))}
                className="mt-2 w-full py-2 px-2 rounded border border-border bg-background text-sm text-right" />
            </div>
          ))}
        </div>

        <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
          placeholder="Observaciones (opcional)" rows={2}
          className="w-full p-2 rounded border border-border bg-card text-sm" />

        {(misSolicitudes ?? []).length > 0 && (
          <div className="pt-2">
            <p className="text-sm font-medium mb-1">Mis solicitudes</p>
            <div className="space-y-1">
              {(misSolicitudes ?? []).slice(0, 10).map((s: any) => (
                <div key={s.id} className="bg-card border border-border rounded px-3 py-2 flex justify-between text-[12px]">
                  <span>{s.folio || 'Borrador'}</span>
                  <span className="text-muted-foreground">
                    {SOLICITUD_STATUS_LABELS[s.status as StatusSolicitudTraspaso] ?? s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border p-3 flex gap-2">
        <button onClick={() => enviar(false)} disabled={guardando}
          className="flex-1 py-3 rounded border border-border text-sm font-medium flex items-center justify-center gap-1.5">
          <Save className="h-4 w-4" /> Guardar
        </button>
        <button onClick={() => enviar(true)} disabled={guardando}
          className="flex-1 py-3 rounded bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5">
          <Send className="h-4 w-4" /> Enviar
        </button>
      </div>
    </div>
  );
}
