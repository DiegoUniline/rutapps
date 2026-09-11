import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole, Package2, Save, X } from 'lucide-react';

const ENDPOINT = 'https://pkdwemunxxpafpmiqxiq.supabase.co/functions/v1/solicitud-compra-proveedor';

type SupplierLine = {
  id: string;
  producto_codigo?: string | null;
  producto_nombre: string;
  unidad?: string | null;
  cantidad_solicitada: number;
  cantidad_surtida?: number | null;
  costo_unitario?: number | null;
  fecha_entrega?: string | null;
  disponible?: boolean | null;
  observaciones?: string | null;
};

type PublicRequest = {
  readonly?: boolean;
  solicitud: {
    folio: string;
    proveedor_nombre?: string | null;
    fecha_requerida?: string | null;
    notas?: string | null;
    proveedor_observaciones?: string | null;
    status: string;
    respondido_at?: string | null;
  };
  empresa: { nombre: string };
  lineas: SupplierLine[];
};

const dateLabel = (value?: string | null) => {
  if (!value) return 'Por confirmar';
  try {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
};

const stateLabel = (status?: string) => {
  if (status === 'respondida' || status === 'convertida') return 'Cerrada';
  if (status === 'borrador_proveedor') return 'Guardada';
  return 'Abierta';
};

export default function SolicitudCompraProveedorPublicaPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token')?.trim() || '', []);
  const [data, setData] = useState<PublicRequest | null>(null);
  const [lines, setLines] = useState<SupplierLine[]>([]);
  const [generalNote, setGeneralNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const readOnly = Boolean(data?.readonly || ['respondida', 'convertida'].includes(data?.solicitud?.status || ''));

  useEffect(() => {
    document.title = 'Solicitud de compra · RutApp';
    const load = async () => {
      if (!token) {
        setError('El enlace no contiene un token válido.');
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${ENDPOINT}?token=${encodeURIComponent(token)}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'No se pudo abrir la solicitud.');
        const next = body as PublicRequest;
        setData(next);
        setLines((next.lineas || []).map(line => ({
          ...line,
          disponible: line.disponible !== false,
          cantidad_surtida: line.cantidad_surtida ?? line.cantidad_solicitada,
        })));
        setGeneralNote(next.solicitud?.proveedor_observaciones || '');
      } catch (e: any) {
        setError(e?.message || 'No se pudo abrir la solicitud.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  const updateLine = (id: string, patch: Partial<SupplierLine>) => {
    if (readOnly) return;
    setLines(prev => prev.map(line => line.id === id ? { ...line, ...patch } : line));
  };

  const submit = async (action: 'save' | 'close') => {
    if (!token || saving || readOnly) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          token,
          lineas: lines.map(line => ({
            id: line.id,
            disponible: line.disponible !== false,
            cantidad_surtida: line.disponible === false ? 0 : Number(line.cantidad_surtida || 0),
            costo_unitario: line.disponible === false || line.costo_unitario == null ? null : Number(line.costo_unitario),
            fecha_entrega: line.disponible === false ? null : line.fecha_entrega || null,
            observaciones: line.observaciones || '',
          })),
          proveedor_observaciones: generalNote,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'No se pudo guardar la solicitud.');
      if (action === 'close') {
        setData(prev => prev ? {
          ...prev,
          readonly: true,
          solicitud: { ...prev.solicitud, status: 'respondida', respondido_at: new Date().toISOString() },
        } : prev);
        setCloseConfirmOpen(false);
        setNotice('Solicitud cerrada. Tu respuesta quedó registrada y este enlace permanece disponible solo para consulta.');
      } else {
        setData(prev => prev ? { ...prev, solicitud: { ...prev.solicitud, status: 'borrador_proveedor' } } : prev);
        setNotice('Cambios guardados. Puedes cerrar esta página y continuar después con el mismo enlace.');
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  const confirmClose = () => {
    void submit('close');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] grid place-items-center bg-[#f5f7fb] text-[#667085]">
        <div className="text-center"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-[#0061e8]" /><p>Cargando solicitud…</p></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <PublicShell>
        <div className="mx-auto mt-16 max-w-xl rounded-3xl border border-red-100 bg-white p-8 text-center shadow-[0_16px_45px_rgba(18,43,80,.08)]">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-600"><AlertCircle className="h-9 w-9" /></div>
          <h1 className="mt-5 text-2xl font-black text-[#172033]">Solicitud no disponible</h1>
          <p className="mt-2 leading-6 text-[#667085]">{error}</p>
        </div>
      </PublicShell>
    );
  }

  if (!data) return null;
  const totalUnits = lines.reduce((sum, line) => sum + Number(line.cantidad_solicitada || 0), 0);
  const status = stateLabel(data.solicitud.status);
  const statusClass = status === 'Cerrada'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'Guardada'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-[#eef5ff] text-[#0061e8]';
  const dotClass = status === 'Cerrada' ? 'bg-emerald-500' : status === 'Guardada' ? 'bg-amber-500' : 'bg-[#0061e8]';

  return (
    <PublicShell reserveBottom={!readOnly}>
      <main className={`mx-auto w-full max-w-[1160px] px-3 pt-5 sm:px-5 sm:pt-8 ${readOnly ? 'pb-8' : 'pb-32'}`}>
        <section className="overflow-hidden rounded-2xl border border-[#e5eaf1] bg-white shadow-[0_16px_45px_rgba(18,43,80,.08)] sm:rounded-3xl">
          <div className="h-1.5 bg-gradient-to-r from-[#0061e8] via-[#3184ef] to-[#ff7a00]" />
          <div className="p-5 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[.16em] text-[#0061e8]">Solicitud de compra</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-[#172033] sm:text-3xl">{data.solicitud.folio}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]"><strong className="text-[#172033]">{data.empresa.nombre}</strong> solicita confirmar disponibilidad, costo y fecha estimada de entrega.</p>
              </div>
              <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${statusClass}`}>
                <span className={`h-2 w-2 rounded-full ${dotClass}`} />{status}
              </span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Meta label="Proveedor" value={data.solicitud.proveedor_nombre || 'Proveedor'} />
              <Meta label="Productos" value={String(lines.length)} />
              <Meta label="Unidades" value={totalUnits.toLocaleString('es-MX')} />
              <Meta label="Fecha requerida" value={dateLabel(data.solicitud.fecha_requerida)} />
            </div>
            {data.solicitud.notas && <div className="mt-4 rounded-xl border border-orange-100 bg-[#fff4e8] px-4 py-3 text-sm leading-5 text-[#9a4b00]"><strong>Instrucciones:</strong> {data.solicitud.notas}</div>}
          </div>
        </section>

        {readOnly && (
          <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm"><CheckCircle2 className="h-5 w-5" /></div>
              <div>
                <h2 className="font-black text-emerald-900">Solicitud cerrada · Solo consulta</h2>
                <p className="mt-1 text-sm leading-5 text-emerald-800">Tu respuesta ya fue registrada. Puedes consultar cantidades, costos, fechas y observaciones, pero no modificarlas.</p>
                <p className="mt-1 text-xs font-semibold text-emerald-700">Si necesitas corregir algún dato, solicita a {data.empresa.nombre} que abra esta solicitud para modificar desde RutApp.</p>
              </div>
            </div>
          </section>
        )}

        <div className="mb-3 mt-7 flex items-end justify-between gap-3 px-1">
          <div><h2 className="text-lg font-black text-[#172033]">{readOnly ? 'Respuesta del proveedor' : 'Confirma cada producto'}</h2><p className="mt-0.5 text-xs text-[#667085]">{readOnly ? 'Datos registrados al momento de cerrar la solicitud.' : 'Indica qué puedes surtir y sus condiciones.'}</p></div>
          <div className="hidden items-center gap-1.5 text-xs font-bold text-[#667085] sm:flex"><LockKeyhole className="h-3.5 w-3.5 text-[#0061e8]" /> {readOnly ? 'Solo lectura' : 'Enlace privado'}</div>
        </div>

        <div className="space-y-3">
          {lines.map(line => {
            const available = line.disponible !== false;
            return (
              <article key={line.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition ${available ? 'border-[#e5eaf1]' : 'border-slate-200 bg-slate-50'}`}>
                <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.5fr)_110px_125px_135px_155px_minmax(170px,1fr)]">
                  <div><p className="text-[10px] font-black uppercase tracking-wider text-[#98a2b3]">{line.producto_codigo || 'Producto'}</p><h3 className="mt-1 font-black leading-5 text-[#172033]">{line.producto_nombre}</h3></div>
                  <div><p className="text-[10px] font-black uppercase tracking-wider text-[#98a2b3]">Solicitado</p><p className="mt-1 text-lg font-black text-[#172033]">{Number(line.cantidad_solicitada || 0).toLocaleString('es-MX')}</p><p className="text-[11px] text-[#667085]">{line.unidad || ''}</p></div>
                  <Field label="Puedo surtir"><input disabled={readOnly || !available} type="number" min="0" step="0.01" className="public-input" value={line.cantidad_surtida ?? ''} onChange={e => updateLine(line.id, { cantidad_surtida: Number(e.target.value) })} /></Field>
                  <Field label="Costo unitario"><input disabled={readOnly || !available} type="number" min="0" step="0.01" className="public-input" placeholder="$ 0.00" value={line.costo_unitario ?? ''} onChange={e => updateLine(line.id, { costo_unitario: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                  <Field label="Fecha entrega"><input disabled={readOnly || !available} type="date" className="public-input" value={line.fecha_entrega || ''} onChange={e => updateLine(line.id, { fecha_entrega: e.target.value })} /></Field>
                  <Field label="Observación"><textarea disabled={readOnly} className="public-input min-h-[42px] resize-y" placeholder="Opcional" value={line.observaciones || ''} onChange={e => updateLine(line.id, { observaciones: e.target.value })} /></Field>
                </div>
                <label className={`mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#475467] ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}><input disabled={readOnly} type="checkbox" className="h-4 w-4 accent-[#0061e8]" checked={available} onChange={e => updateLine(line.id, { disponible: e.target.checked })} /> Disponible para surtir</label>
              </article>
            );
          })}
        </div>

        <section className="mt-4 rounded-2xl border border-[#e5eaf1] bg-white p-4 sm:p-5">
          <label className="text-xs font-black text-[#172033]">Observaciones generales</label>
          <textarea disabled={readOnly} className="public-input mt-2 min-h-[90px] resize-y" value={generalNote} onChange={e => !readOnly && setGeneralNote(e.target.value)} placeholder="Ej. el resto del pedido puede entregarse el viernes…" />
        </section>

        {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</div>}
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
      </main>

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-[10000] border-t border-[#e5eaf1] bg-white/95 px-3 py-3 shadow-[0_-8px_28px_rgba(18,43,80,.08)] backdrop-blur sm:px-5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-[1160px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="hidden text-xs text-[#667085] sm:block">Guarda para continuar después. Al cerrar quedará disponible solo para consulta.</p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button disabled={saving} onClick={() => void submit('save')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d0d5dd] bg-white px-5 py-3 text-sm font-black text-[#344054] disabled:opacity-50"><Save className="h-4 w-4" /> Guardar</button>
              <button disabled={saving} onClick={() => setCloseConfirmOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0061e8] px-5 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(0,97,232,.22)] hover:bg-[#004fc0] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Cerrar solicitud</button>
            </div>
          </div>
        </div>
      )}

      {closeConfirmOpen && !readOnly && (
        <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-[#101828]/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="close-request-title">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_28px_80px_rgba(16,24,40,.28)]">
            <div className="h-1.5 bg-gradient-to-r from-[#0061e8] via-[#3184ef] to-[#ff7a00]" />
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eef5ff] text-[#0061e8]">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="close-request-title" className="text-xl font-black tracking-tight text-[#172033]">¿Cerrar esta solicitud?</h2>
                  <p className="mt-2 text-sm leading-6 text-[#667085]">Tu respuesta se enviará a <strong className="text-[#344054]">{data.empresa.nombre}</strong> y quedará cerrada en modo consulta.</p>
                </div>
                <button type="button" onClick={() => setCloseConfirmOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#98a2b3] transition hover:bg-[#f2f4f7] hover:text-[#344054]" aria-label="Cerrar confirmación">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-black text-amber-900">Después de cerrar será solo lectura</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">Podrás seguir consultando este mismo enlace, pero no modificar cantidades, costos ni fechas. Si necesitas corregir algo, tu cliente deberá abrir la solicitud para modificar desde RutApp.</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCloseConfirmOpen(false)} className="rounded-xl border border-[#d0d5dd] bg-white px-4 py-3 text-sm font-black text-[#344054] transition hover:bg-[#f8fafc]">Cancelar</button>
                <button type="button" disabled={saving} onClick={confirmClose} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0061e8] px-4 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(0,97,232,.2)] transition hover:bg-[#004fc0] disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Sí, cerrar solicitud
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`.public-input{width:100%;min-height:40px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;padding:9px 10px;color:#172033;outline:none;font:inherit;font-size:13px}.public-input:focus{border-color:#0061e8;box-shadow:0 0 0 3px rgba(0,97,232,.1)}.public-input:disabled{background:#f2f4f7;color:#667085;opacity:1}`}</style>
    </PublicShell>
  );
}

function PublicShell({ children, reserveBottom = false }: { children: React.ReactNode; reserveBottom?: boolean }) {
  return (
    <div className="fixed inset-0 z-[9998] overflow-y-auto bg-[#f5f7fb] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-[#e5eaf1] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><img src="/pwa-192x192.png" alt="RutApp" className="h-10 w-10 rounded-xl object-contain" /><div className="min-w-0"><div className="truncate text-base font-black text-[#172033]">RutApp</div><div className="truncate text-[11px] font-bold text-[#667085]">Portal de proveedores</div></div></div>
          <div className="hidden items-center gap-2 text-xs font-bold text-[#667085] sm:flex"><Package2 className="h-4 w-4 text-[#ff7a00]" /> Solicitud de compra</div>
        </div>
      </header>
      {children}
      <footer className={`border-t border-[#e5eaf1] bg-white ${reserveBottom ? 'pb-24 sm:pb-20' : ''}`}>
        <div className="mx-auto max-w-[1160px] px-4 py-6 text-center text-xs text-[#667085] sm:px-5">
          <p className="font-bold text-[#344054]">Sistema creado por <a href="https://rutapp.mx" target="_blank" rel="noreferrer" className="text-[#0061e8] hover:underline">RutApp.mx</a></p>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <a href="https://wa.me/5213171035768" target="_blank" rel="noreferrer" className="font-semibold hover:text-[#0061e8]">+52 317 103 5768</a>
            <span aria-hidden="true">·</span>
            <a href="mailto:soporte@rutapp.com" className="font-semibold hover:text-[#0061e8]">soporte@rutapp.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#e5eaf1] bg-[#f8fafc] px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-[#98a2b3]">{label}</p><p className="mt-1 truncate text-sm font-black text-[#172033]">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#98a2b3]">{label}</span>{children}</label>;
}
