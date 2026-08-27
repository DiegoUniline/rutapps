import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, Check, X, Wand2, Truck, Lock, History, FileText, CircleSlash2 } from 'lucide-react';
import { ListPage } from '@/components/layout/ListPage';
import { StatusChip } from '@/components/StatusChip';
import ProductSearchInput from '@/components/ProductSearchInput';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { useAuth } from '@/contexts/AuthContext';
import { useAlmacenes, useProductos } from '@/hooks/useData';
import { useDisponiblePorAlmacen } from '@/hooks/useApartadoStock';
import { fmtDate } from '@/lib/utils';
import {
  useSolicitudTraspaso, useSolicitudTraspasoLineas, useSolicitudTraspasoHistorial,
  useGuardarSolicitud, useGuardarAprobacionPendiente, useEnviarSolicitud, useAprobarSolicitud, useRechazarSolicitud,
  useCancelarSolicitud, useSurtirSolicitud, useCerrarSolicitud,
  useSolicitudSurtidos, previewSurtido, SOLICITUD_STATUS_LABELS,
  type StatusSolicitudTraspaso, type PreviewSurtidoLinea,
} from '@/hooks/useSolicitudesTraspaso';
import { useSugerenciasResurtido } from '@/hooks/useProductoAlmacenConfig';
import { SolicitudLineasTable, type LineaEditable } from './solicitudTraspaso/SolicitudLineasTable';
import SurtidoPreviewDialog from './solicitudTraspaso/SurtidoPreviewDialog';
import CerrarTraspasoDialog from './solicitudTraspaso/CerrarTraspasoDialog';
import SolicitudResumen from './solicitudTraspaso/SolicitudResumen';
import { generarSolicitudTraspasoPdf } from '@/lib/solicitudTraspasoPdf';
import { cantidadBaseSolicitud } from '@/lib/solicitudTraspasoCantidad';

const nuevoId = () => crypto.randomUUID();

export default function SolicitudTraspasoFormPage() {
  const { id = 'nueva' } = useParams();
  const navigate = useNavigate();
  const esNueva = id === 'nueva';
  const { empresa, profile } = useAuth();

  const { data: almacenes = [] } = useAlmacenes();
  const { data: productos = [] } = useProductos();
  const { data: solicitud } = useSolicitudTraspaso(id);
  const { data: lineasServidor = [] } = useSolicitudTraspasoLineas(id);
  const { data: historial = [] } = useSolicitudTraspasoHistorial(id);
  const { data: surtidos = [] } = useSolicitudSurtidos(id);

  const [localId] = useState(() => nuevoId());
  const solicitudId = esNueva ? localId : id;

  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  const [excluidas, setExcluidas] = useState<string[]>([]);

  const status: StatusSolicitudTraspaso = solicitud?.status ?? 'borrador';
  const editable = esNueva || status === 'borrador';
  const aprobando = status === 'solicitada';

  const guardar = useGuardarSolicitud();
  const guardarAprobacionPendiente = useGuardarAprobacionPendiente();
  const enviar = useEnviarSolicitud();
  const aprobar = useAprobarSolicitud();
  const rechazar = useRechazarSolicitud();
  const cancelar = useCancelarSolicitud();
  const surtir = useSurtirSolicitud();
  const cerrar = useCerrarSolicitud();

  const [preview, setPreview] = useState<PreviewSurtidoLinea[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCargando, setPreviewCargando] = useState(false);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  const { data: disponibles } = useDisponiblePorAlmacen(origenId || undefined);
  const { data: sugerencias = [], refetch: recargarSugerencias } = useSugerenciasResurtido(destinoId || undefined, false);

  useEffect(() => {
    if (!solicitud) return;
    setOrigenId(solicitud.almacen_origen_id ?? '');
    setDestinoId(solicitud.almacen_destino_id ?? '');
    setObservaciones(solicitud.observaciones ?? '');
  }, [solicitud?.id]);

  useEffect(() => {
    if (esNueva || lineasServidor.length === 0) return;
    setLineas(lineasServidor.map(l => ({
      id: l.id,
      producto_id: l.producto_id,
      codigo: l.productos?.codigo ?? '',
      nombre: l.productos?.nombre ?? '',
      stock_actual_snapshot: Number(l.stock_actual_snapshot) || 0,
      stock_minimo_snapshot: Number(l.stock_minimo_snapshot) || 0,
      stock_maximo_snapshot: Number(l.stock_maximo_snapshot) || 0,
      cantidad_sugerida: Number(l.cantidad_sugerida) || 0,
      cantidad_solicitada: Number(l.cantidad_solicitada) || 0,
      cantidad_aprobada: Number(l.cantidad_aprobada) || 0,
      cantidad_surtida: Number(l.cantidad_surtida) || 0,
      agregada_por_admin: !!l.agregada_por_admin,
    })));
  }, [lineasServidor, esNueva]);

  const productOptions = useMemo(
    () => productos.map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, formula: p.formula })),
    [productos],
  );

  const agregarProducto = (productoId: string) => {
    const p = productos.find(x => x.id === productoId);
    if (!p) return;
    if (lineas.some(l => l.producto_id === productoId)) {
      toast.info('Ese producto ya está en la solicitud');
      return;
    }
    setLineas(prev => [...prev, {
      id: nuevoId(), producto_id: p.id, codigo: p.codigo, nombre: p.nombre,
      stock_actual_snapshot: 0, stock_minimo_snapshot: 0, stock_maximo_snapshot: 0,
      cantidad_sugerida: 0,
      cantidad_solicitada: aprobando ? 0 : 1,
      cantidad_aprobada: 1,
      cantidad_surtida: 0,
      agregada_por_admin: aprobando,
    }]);
  };

  const cargarSugerencias = async () => {
    if (!destinoId) { toast.error('Elige primero el almacén destino'); return; }
    const { data } = await recargarSugerencias();
    const filas = data ?? sugerencias;
    if (!filas.length) { toast.info('No hay productos por debajo del mínimo en ese almacén'); return; }
    setLineas(filas.map(s => ({
      id: nuevoId(), producto_id: s.producto_id, codigo: s.codigo, nombre: s.nombre,
      stock_actual_snapshot: Number(s.stock_actual) || 0,
      stock_minimo_snapshot: Number(s.stock_minimo) || 0,
      stock_maximo_snapshot: Number(s.stock_maximo) || 0,
      cantidad_sugerida: Number(s.cantidad_sugerida) || 0,
      cantidad_solicitada: Number(s.cantidad_sugerida) || 0,
      cantidad_aprobada: Number(s.cantidad_sugerida) || 0,
      cantidad_surtida: 0,
    })));
    toast.success(`${filas.length} productos por resurtir`);
  };

  const cambiarCantidad = (lineaId: string, campo: 'cantidad_solicitada' | 'cantidad_aprobada', valor: number) =>
    setLineas(prev => prev.map(l => l.id === lineaId ? { ...l, [campo]: Math.max(0, valor || 0) } : l));

  const quitarLinea = (lineaId: string) => {
    setLineas(prev => prev.filter(l => l.id !== lineaId));
    if (aprobando) {
      // Las nuevas aún no existen en servidor; basta retirarlas del estado local.
      if (lineasServidor.some(l => l.id === lineaId)) {
        setExcluidas(prev => prev.includes(lineaId) ? prev : [...prev, lineaId]);
      }
    } else if (!esNueva) {
      setEliminadas(prev => prev.includes(lineaId) ? prev : [...prev, lineaId]);
    }
  };

  const validar = () => {
    if (!origenId || !destinoId) { toast.error('Elige almacén origen y destino'); return false; }
    if (origenId === destinoId) { toast.error('El origen y el destino no pueden ser el mismo'); return false; }
    if (lineas.length === 0) { toast.error('Agrega al menos un producto'); return false; }
    if (lineas.some(l => l.cantidad_solicitada <= 0)) { toast.error('Todas las cantidades deben ser mayores a cero'); return false; }
    return true;
  };

  const onGuardar = async (silencioso = false) => {
    if (!validar()) return false;
    await guardar.mutateAsync({
      id: solicitudId,
      almacen_origen_id: origenId,
      almacen_destino_id: destinoId,
      observaciones,
      lineas: lineas.map(l => ({
        id: l.id, producto_id: l.producto_id,
        stock_actual_snapshot: l.stock_actual_snapshot,
        stock_minimo_snapshot: l.stock_minimo_snapshot,
        stock_maximo_snapshot: l.stock_maximo_snapshot,
        cantidad_sugerida: l.cantidad_sugerida,
        cantidad_solicitada: l.cantidad_solicitada,
      })),
      lineasEliminadas: eliminadas,
    });
    setEliminadas([]);
    if (!silencioso) toast.success('Solicitud guardada');
    if (esNueva) navigate(`/almacen/solicitudes-traspaso/${solicitudId}`, { replace: true });
    return true;
  };

  const onEnviar = async () => {
    if (!(await onGuardar(true))) return;
    await enviar.mutateAsync({ p_solicitud_id: solicitudId });
    toast.success('Solicitud enviada a aprobación');
  };

  const lineasPayload = () => lineas.map(l => ({
    linea_id: l.id,
    cantidad_aprobada: Math.max(0, Number(l.cantidad_aprobada) || 0),
  }));

  const onGuardarAprobacionPendiente = async (silencioso = false) => {
    if (!origenId) { toast.error('Elige el almacén origen que surtirá'); return false; }
    if (origenId === destinoId) { toast.error('El origen y el destino no pueden ser el mismo'); return false; }
    try {
      await guardarAprobacionPendiente.mutateAsync({
        id: solicitudId,
        almacen_origen_id: origenId,
        observaciones,
        lineas: lineas.map(l => ({
          id: l.id,
          producto_id: l.producto_id,
          cantidad_aprobada: Math.max(0, Number(l.cantidad_aprobada) || 0),
          agregada_por_admin: !!l.agregada_por_admin,
        })),
        lineasExcluidas: excluidas,
      });
      setExcluidas([]);
      if (!silencioso) toast.success('Cambios guardados');
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudieron guardar los cambios');
      return false;
    }
  };

  const onAprobar = async () => {
    if (!(await onGuardarAprobacionPendiente(true))) return;
    try {
      await aprobar.mutateAsync({ p_solicitud_id: solicitudId, p_lineas: lineasPayload() });
      toast.success('Solicitud aprobada');
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo aprobar la solicitud');
    }
  };

  const onRechazar = async () => {
    const motivo = window.prompt('Motivo del rechazo:') ?? '';
    if (!motivo.trim()) return;
    await rechazar.mutateAsync({ p_solicitud_id: solicitudId, p_motivo: motivo.trim() });
    toast.success('Solicitud rechazada');
  };

  const onCancelar = async () => {
    const motivo = window.prompt('Motivo de la cancelación:') ?? '';
    await cancelar.mutateAsync({ p_solicitud_id: solicitudId, p_motivo: motivo.trim() || null });
    toast.success('Solicitud cancelada');
  };

  const abrirPreview = async () => {
    setPreview([]);
    setPreviewCargando(true);
    setPreviewOpen(true);
    try {
      setPreview(await previewSurtido(solicitudId));
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo consultar la existencia');
      setPreviewOpen(false);
    } finally {
      setPreviewCargando(false);
    }
  };

  const confirmarPreview = async () => {
    const payload = preview
      .filter(l => l.cantidad_surtible > 0)
      .map(l => ({ linea_id: l.linea_id, cantidad: l.cantidad_surtible }));
    try {
      if (payload.length === 0) { toast.info('No hay existencia disponible para surtir'); return; }
      const traspasoId = await surtir.mutateAsync({ p_solicitud_id: solicitudId, p_lineas: payload });
      setPreviewOpen(false);
      toast.success('Surtido generado sobre el mismo folio');
      if (typeof traspasoId === 'string') navigate(`/almacen/traspasos/${traspasoId}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo completar el surtido');
    }
  };

  const onCerrar = async (motivo: string | null) => {
    await cerrar.mutateAsync({ p_solicitud_id: solicitudId, p_motivo: motivo });
    setCerrarOpen(false);
    toast.success('Traspaso cerrado. Las cantidades pendientes ya no podrán surtirse.');
  };

  const ponerTodasEnCero = () => {
    setLineas(prev => prev.map(l => ({ ...l, cantidad_aprobada: 0 })));
    toast.info('Todas las cantidades aprobadas se marcaron en cero');
  };

  const generarPdf = async () => {
    if (!solicitud) return;
    try {
      const blob = await generarSolicitudTraspasoPdf({
        empresa: {
          nombre: empresa?.nombre ?? '',
          razon_social: empresa?.razon_social,
          rfc: empresa?.rfc,
          direccion: empresa?.direccion,
          telefono: empresa?.telefono,
        },
        solicitud: {
          folio: solicitud.folio || 'Solicitud',
          fecha: solicitud.fecha,
          status,
          observaciones: observaciones || undefined,
        },
        origen: solicitud.almacen_origen?.nombre || almacenes.find(a => a.id === origenId)?.nombre || '—',
        destino: solicitud.almacen_destino?.nombre || almacenes.find(a => a.id === destinoId)?.nombre || '—',
        solicitante: solicitud.solicitante?.nombre || undefined,
        responsable: profile?.nombre || undefined,
        lineas: lineas.map(l => ({
          codigo: l.codigo,
          nombre: l.nombre,
          cantidad_solicitada: l.cantidad_solicitada,
          cantidad_aprobada: l.cantidad_aprobada,
          agregada_por_admin: !!l.agregada_por_admin,
        })),
      });
      setPdfBlob(blob);
      setPdfOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el PDF');
    }
  };

  const puedeSurtir = status === 'aprobada' || status === 'parcialmente_surtida';
  const totales = lineas.reduce((acc, l) => {
    const base = cantidadBaseSolicitud(status, l.cantidad_solicitada, l.cantidad_aprobada);
    acc.solicitado += l.cantidad_solicitada;
    acc.surtido += l.cantidad_surtida;
    acc.pendiente += Math.max(0, base - l.cantidad_surtida);
    return acc;
  }, { solicitado: 0, surtido: 0, pendiente: 0 });

  return (
    <ListPage>
      <ListPage.Header
        title={
          <span className="flex items-center gap-2">
            <button onClick={() => navigate('/almacen/solicitudes-traspaso')} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            {esNueva ? 'Nueva solicitud de traspaso' : (solicitud?.folio || 'Solicitud')}
            {!esNueva && <StatusChip status={status} label={SOLICITUD_STATUS_LABELS[status]} />}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <>
                <button onClick={cargarSugerencias} className="btn-odoo flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Sugerir por mínimos
                </button>
                <button onClick={() => onGuardar()} disabled={guardar.isPending} className="btn-odoo flex items-center gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Guardar borrador
                </button>
                <button onClick={onEnviar} disabled={enviar.isPending} className="btn-odoo flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" /> Enviar a aprobación
                </button>
              </>
            )}
            {aprobando && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => onGuardarAprobacionPendiente()} disabled={guardarAprobacionPendiente.isPending} className="btn-odoo-info">
                    Guardar
                  </button>
                  <button onClick={ponerTodasEnCero} className="btn-odoo flex items-center gap-1.5" title="Marcar todas las cantidades aprobadas en cero">
                    <CircleSlash2 className="h-3.5 w-3.5" /> Todo en cero
                  </button>
                  <button onClick={onCancelar} className="btn-odoo-secondary p-2" title="Cancelar solicitud">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center">
                  <button onClick={onRechazar} className="btn-odoo-danger flex items-center gap-1.5 rounded-r-none border-r border-destructive-foreground/20">
                    <X className="h-3.5 w-3.5" /> Rechazar
                  </button>
                  <button onClick={onAprobar} className="btn-odoo-success flex items-center gap-1.5 rounded-l-none">
                    <Check className="h-3.5 w-3.5" /> Aprobar
                  </button>
                </div>
              </div>
            )}
            {puedeSurtir && (
              <>
                <button onClick={() => setCerrarOpen(true)} className="btn-odoo flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Cerrar traspaso
                </button>
                <button onClick={abrirPreview} disabled={surtir.isPending} className="btn-odoo-primary flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" /> {status === 'aprobada' ? 'Surtir' : 'Surtir pendientes'}
                </button>
              </>
            )}
            {!esNueva && (
              <button onClick={generarPdf} className="btn-odoo-secondary flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> PDF
              </button>
            )}
            {(status === 'surtida' || status === 'cerrada') && (
              <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Solo consulta e historial
              </span>
            )}
          </div>
        }
      />

      <ListPage.Toolbar>
        {!esNueva && (
          <SolicitudResumen
            solicitado={totales.solicitado}
            surtido={totales.surtido}
            pendiente={status === 'cerrada' ? 0 : totales.pendiente}
            origen={solicitud?.almacen_origen?.nombre}
            destino={solicitud?.almacen_destino?.nombre}
            surtidos={surtidos}
          />
        )}
        <div className="bg-card border border-border rounded p-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-[12px]">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Almacén origen (surte)</span>
            <select className="input-odoo" value={origenId} disabled={!editable && !aprobando} onChange={e => setOrigenId(e.target.value)}>
              <option value="">Selecciona...</option>
              {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Almacén destino (solicita)</span>
            <select className="input-odoo" value={destinoId} disabled={!editable} onChange={e => setDestinoId(e.target.value)}>
              <option value="">Selecciona...</option>
              {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-muted-foreground">Observaciones</span>
            <input className="input-odoo" value={observaciones} disabled={!editable && !aprobando}
              onChange={e => setObservaciones(e.target.value)} placeholder="Motivo del resurtido..." />
          </label>
        </div>

        {(editable || aprobando) && (
          <div className="bg-card border border-border rounded p-3">
            <span className="text-[12px] text-muted-foreground block mb-1">
              {aprobando ? 'Agregar producto a la aprobación' : 'Agregar producto'}
            </span>
            <ProductSearchInput products={productOptions} value="" onSelect={agregarProducto} />
          </div>
        )}

        {status === 'cerrada' && (
          <div className="border border-border bg-muted/40 rounded p-2 text-[12px]">
            Traspaso cerrado{solicitud?.motivo_cierre ? `: ${solicitud.motivo_cierre}` : ''}. Las cantidades pendientes ya no pueden surtirse.
          </div>
        )}
        {status === 'rechazada' && solicitud?.motivo_rechazo && (
          <div className="border border-destructive/40 bg-destructive/5 text-destructive rounded p-2 text-[12px]">
            Rechazada: {solicitud.motivo_rechazo}
          </div>
        )}
      </ListPage.Toolbar>

      <ListPage.Body>
        <SolicitudLineasTable
          lineas={lineas}
          status={status}
          editable={editable}
          aprobando={aprobando}
          disponiblePorProducto={disponibles}
          onChange={cambiarCantidad}
          onRemove={quitarLinea}
        />
      </ListPage.Body>

      {!esNueva && historial.length > 0 && (
        <ListPage.Footer className="bg-card border border-border rounded p-3 max-h-32 overflow-auto">
          <span className="text-[12px] font-medium">Historial</span>
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {historial.map(h => (
              <li key={h.id}>
                {fmtDate(h.created_at)} · {h.accion} · {h.user_nombre || 'Sistema'}
              </li>
            ))}
          </ul>
        </ListPage.Footer>
      )}
      <SurtidoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        lineas={preview}
        cargando={previewCargando}
        ejecutando={surtir.isPending}
        onConfirm={confirmarPreview}
      />
      <CerrarTraspasoDialog
        open={cerrarOpen}
        onOpenChange={setCerrarOpen}
        pendiente={totales.pendiente}
        ejecutando={cerrar.isPending}
        onConfirm={onCerrar}
      />
      <DocumentPreviewModal
        open={pdfOpen}
        onClose={() => { setPdfOpen(false); setPdfBlob(null); }}
        pdfBlob={pdfBlob}
        fileName={`solicitud-traspaso-${solicitud?.folio || 'documento'}.pdf`}
        empresaId={empresa?.id || ''}
        tipo="solicitud_traspaso"
        referencia_id={solicitudId}
      />
    </ListPage>
  );
}
