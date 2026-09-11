import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Check, ClipboardList, Copy, ExternalLink, Mail, PackageCheck,
  Plus, RefreshCw, Send, ShoppingCart, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import SearchableSelect from '@/components/SearchableSelect';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { todayLocal } from '@/lib/utils';
import { calcLineTotals } from '@/pages/CompraForm/types';
import { calcularTotalesCompra } from '@/lib/compraAjustes';

const STATUS: Record<string, { label: string; cls: string }> = {
  borrador: { label: 'Borrador', cls: 'bg-slate-100 text-slate-700' },
  enviada: { label: 'Abierta', cls: 'bg-blue-50 text-blue-700' },
  vista: { label: 'Abierta', cls: 'bg-blue-50 text-blue-700' },
  borrador_proveedor: { label: 'Guardada', cls: 'bg-amber-50 text-amber-700' },
  respondida: { label: 'Cerrada', cls: 'bg-emerald-50 text-emerald-700' },
  convertida: { label: 'Convertida a compra', cls: 'bg-violet-50 text-violet-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-red-50 text-red-700' },
};

const fmtMoney = (n: any) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fmtDate = (v?: string | null) => v ? new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${v}T12:00:00`)) : '—';
const publicUrl = (token?: string | null) => token ? `https://rutapp.mx/proveedor/solicitud-compra?token=${encodeURIComponent(token)}` : '';

interface DraftLine {
  id?: string;
  producto_id: string;
  cantidad_solicitada: number;
  producto_codigo?: string | null;
  producto_nombre?: string;
  unidad?: string | null;
  cantidad_surtida?: number | null;
  cantidad_aceptada?: number | null;
  costo_unitario?: number | null;
  fecha_entrega?: string | null;
  disponible?: boolean | null;
  observaciones?: string | null;
  productos?: any;
}

const blankLine = (): DraftLine => ({ producto_id: '', cantidad_solicitada: 1 });

export default function SolicitudesCompraPage() {
  const { empresa, user } = useAuth();
  const db = supabase as any;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const sid = sp.get('sid');
  const isDetail = !!sid;
  const isNew = sid === 'nueva';

  const listQuery = useQuery({
    queryKey: ['solicitudes-compra', empresa?.id],
    enabled: !!empresa?.id && !isDetail,
    queryFn: async () => {
      const { data, error } = await db.from('solicitudes_compra')
        .select('*, proveedores(nombre), almacenes(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const detailQuery = useQuery({
    queryKey: ['solicitud-compra', sid],
    enabled: !!sid && !isNew,
    queryFn: async () => {
      const [{ data: solicitud, error }, { data: lineas, error: lineError }, { data: eventos }] = await Promise.all([
        db.from('solicitudes_compra').select('*, proveedores(id,nombre,email,condicion_pago,dias_credito), almacenes(id,nombre), compras(id)').eq('id', sid).single(),
        db.from('solicitud_compra_lineas').select('*, productos(id,codigo,nombre,nombre_compra,costo,tiene_iva,iva_pct,tiene_ieps,ieps_pct,ieps_tipo,factor_conversion)').eq('solicitud_id', sid).order('orden'),
        db.from('solicitud_compra_eventos').select('*').eq('solicitud_id', sid).order('created_at', { ascending: false }),
      ]);
      if (error) throw error;
      if (lineError) throw lineError;
      return { solicitud, lineas: lineas ?? [], eventos: eventos ?? [] };
    },
  });

  const catalogsQuery = useQuery({
    queryKey: ['solicitud-compra-catalogos', empresa?.id],
    enabled: !!empresa?.id && isDetail,
    staleTime: 60_000,
    queryFn: async () => {
      const [prov, alm, prod] = await Promise.all([
        db.from('proveedores').select('id,nombre,email,condicion_pago,dias_credito').eq('empresa_id', empresa!.id).neq('status', 'baja').order('nombre'),
        db.from('almacenes').select('id,nombre').eq('empresa_id', empresa!.id).order('nombre'),
        db.from('productos').select('id,codigo,nombre,nombre_compra,costo,tiene_iva,iva_pct,tiene_ieps,ieps_pct,ieps_tipo,factor_conversion, unidades_compra:unidades!productos_unidad_compra_id_fkey(abreviatura), unidades_venta:unidades!productos_unidad_venta_id_fkey(abreviatura)').eq('empresa_id', empresa!.id).neq('status', 'inactivo').order('nombre').limit(2000),
      ]);
      if (prov.error) console.error('Error proveedores:', prov.error);
      if (alm.error) console.error('Error almacenes:', alm.error);
      if (prod.error) console.error('Error productos:', prod.error);
      return { proveedores: prov.data ?? [], almacenes: alm.data ?? [], productos: prod.data ?? [] };
    },
  });

  const [header, setHeader] = useState<any>({ status: 'borrador', proveedor_id: '', almacen_id: '', fecha_requerida: '', notas: '' });
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendCc, setSendCc] = useState('');
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (isNew) {
      setHeader({ status: 'borrador', proveedor_id: '', almacen_id: '', fecha_requerida: '', notas: '' });
      setLines([blankLine()]);
    } else if (detailQuery.data) {
      setHeader(detailQuery.data.solicitud);
      setLines(detailQuery.data.lineas.map((l: any) => ({ ...l, cantidad_aceptada: l.cantidad_aceptada ?? l.cantidad_surtida })));
    }
  }, [isNew, detailQuery.data]);

  const catalogs = catalogsQuery.data || { proveedores: [], almacenes: [], productos: [] };
  const editable = isNew || header.status === 'borrador';
  const supplierResponded = header.status === 'respondida';
  const publicLinkVisible = !!header.public_token && header.status !== 'cancelada';
  const selectedProvider = catalogs.proveedores.find((p: any) => p.id === header.proveedor_id);

  const setSid = (value?: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set('sid', value); else next.delete('sid');
    next.set('vista', 'solicitudes');
    setSp(next);
  };

  const saveRequest = async (): Promise<string | null> => {
    if (!empresa?.id) return null;
    if (!editable && !isNew) return String(sid);
    if (!header.proveedor_id) { toast.error('Selecciona un proveedor'); return null; }
    if (!header.almacen_id) { toast.error('Selecciona el almacén destino'); return null; }
    const validLines = lines.filter(l => l.producto_id && Number(l.cantidad_solicitada) > 0);
    if (!validLines.length) { toast.error('Agrega al menos un producto'); return null; }
    const provider = catalogs.proveedores.find((p: any) => p.id === header.proveedor_id);
    if (!provider) { toast.error('Proveedor no válido'); return null; }

    setSaving(true);
    try {
      const payload = {
        empresa_id: empresa.id,
        proveedor_id: header.proveedor_id,
        proveedor_nombre: provider.nombre,
        proveedor_email: header.proveedor_email || provider.email || null,
        almacen_id: header.almacen_id,
        fecha_requerida: header.fecha_requerida || null,
        notas: header.notas?.trim() || null,
        created_by: header.created_by || user?.id || null,
      };
      let requestId = isNew ? null : String(sid);
      if (isNew) {
        const { data, error } = await db.from('solicitudes_compra').insert(payload).select('*').single();
        if (error) throw error;
        requestId = data.id;
        setHeader(data);
      } else {
        const { error } = await db.from('solicitudes_compra').update(payload).eq('id', requestId);
        if (error) throw error;
        const { error: deleteError } = await db.from('solicitud_compra_lineas').delete().eq('solicitud_id', requestId);
        if (deleteError) throw deleteError;
      }

      const rows = validLines.map((l, idx) => {
        const p = catalogs.productos.find((x: any) => x.id === l.producto_id);
        return {
          solicitud_id: requestId,
          producto_id: l.producto_id,
          producto_codigo: p?.codigo || l.producto_codigo || null,
          producto_nombre: p?.nombre_compra || p?.nombre || l.producto_nombre || 'Producto',
          unidad: p?.unidades_compra?.abreviatura || p?.unidades_venta?.abreviatura || l.unidad || 'pz',
          cantidad_solicitada: Number(l.cantidad_solicitada),
          orden: idx,
        };
      });
      const { error: linesError } = await db.from('solicitud_compra_lineas').insert(rows);
      if (linesError) throw linesError;
      await db.from('solicitud_compra_eventos').insert({ solicitud_id: requestId, empresa_id: empresa.id, tipo: isNew ? 'creada' : 'actualizada', actor_tipo: 'interno', actor_id: user?.id || null });

      toast.success(isNew ? 'Solicitud creada' : 'Solicitud guardada');
      qc.invalidateQueries({ queryKey: ['solicitudes-compra'] });
      if (isNew && requestId) setSid(requestId);
      else detailQuery.refetch();
      return requestId;
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar la solicitud');
      return null;
    } finally { setSaving(false); }
  };

  const openSend = async () => {
    const requestId = await saveRequest();
    if (!requestId) return;
    const provider = catalogs.proveedores.find((p: any) => p.id === header.proveedor_id);
    setSendTo(header.proveedor_email || provider?.email || '');
    setSendCc(Array.isArray(header.cc_emails) ? header.cc_emails.join(', ') : '');
    setSendOpen(true);
  };

  const sendRequest = async () => {
    if (!sid || sid === 'nueva') return;
    const cc = sendCc.split(/[;,]/).map(x => x.trim()).filter(Boolean);
    if (!/^\S+@\S+\.\S+$/.test(sendTo.trim())) { toast.error('Escribe un correo válido del proveedor'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('solicitud-compra-proveedor', {
        body: { action: 'send', solicitud_id: sid, to: sendTo.trim(), cc },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSendOpen(false);
      toast.success('Solicitud enviada al proveedor');
      if (data?.warnings?.length) toast.warning(`Enviada, con ${data.warnings.length} aviso(s) en las copias CC`);
      await detailQuery.refetch();
      qc.invalidateQueries({ queryKey: ['solicitudes-compra'] });
    } catch (e: any) { toast.error(e?.message || 'No se pudo enviar'); }
    finally { setSending(false); }
  };

  const copyPublicLink = async () => {
    if (!publicLinkVisible) { toast.error('Esta solicitud no tiene un enlace público disponible'); return; }
    const url = publicUrl(header.public_token);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success(supplierResponded ? 'Enlace de consulta copiado' : 'Enlace copiado');
  };

  const reopenRequest = async () => {
    if (!sid || sid === 'nueva' || header.status !== 'respondida') return;
    setReopening(true);
    try {
      const { data, error } = await supabase.functions.invoke('solicitud-compra-proveedor', {
        body: { action: 'reopen', solicitud_id: sid },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReopenOpen(false);
      toast.success('Solicitud abierta para modificar');
      await detailQuery.refetch();
      qc.invalidateQueries({ queryKey: ['solicitudes-compra'] });
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo abrir la solicitud para modificar');
    } finally {
      setReopening(false);
    }
  };

  const updateAccepted = (id: string, value: number) => setLines(prev => prev.map(l => l.id === id ? { ...l, cantidad_aceptada: Math.max(0, value || 0) } : l));

  const convertToPurchase = async () => {
    if (!empresa?.id || !sid || sid === 'nueva' || header.status !== 'respondida') return;
    if (!header.almacen_id || !header.proveedor_id) { toast.error('La solicitud necesita proveedor y almacén'); return; }
    const accepted = lines.filter(l => l.producto_id && l.disponible !== false && Number(l.cantidad_aceptada ?? l.cantidad_surtida ?? 0) > 0);
    if (!accepted.length) { toast.error('No hay productos aceptados para comprar'); return; }
    if (accepted.some(l => l.costo_unitario == null || Number(l.costo_unitario) < 0)) { toast.error('Revisa los costos respondidos por el proveedor'); return; }

    setConverting(true);
    try {
      const purchaseLines = accepted.map(l => {
        const p = l.productos || catalogs.productos.find((x: any) => x.id === l.producto_id) || {};
        const factor = Number(p.factor_conversion) > 0 ? Number(p.factor_conversion) : 1;
        const row: any = {
          producto_id: l.producto_id,
          cantidad: Number(l.cantidad_aceptada ?? l.cantidad_surtida),
          precio_unitario: Number(l.costo_unitario || 0),
          _tiene_iva: !!p.tiene_iva,
          _iva_pct: Number(p.iva_pct ?? 16),
          _tiene_ieps: !!p.tiene_ieps,
          _ieps_pct: Number(p.ieps_pct ?? 0),
          _ieps_tipo: p.ieps_tipo || 'porcentaje',
          _factor_conversion: factor,
        };
        calcLineTotals(row);
        return row;
      });
      const subtotal = purchaseLines.reduce((s, l) => s + Number(l.subtotal || 0), 0);
      const gross = purchaseLines.reduce((s, l) => s + Number(l.total || 0), 0);
      const totals = calcularTotalesCompra({ subtotalLineas: subtotal, totalLineas: gross });
      const provider = catalogs.proveedores.find((p: any) => p.id === header.proveedor_id) || header.proveedores || {};
      const condicion = provider.condicion_pago === 'credito' ? 'credito' : 'contado';
      const dias = condicion === 'credito' ? Number(provider.dias_credito || 0) : 0;
      const fecha = todayLocal();
      const due = (() => { const d = new Date(`${fecha}T12:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); })();
      const compraData = {
        empresa_id: empresa.id,
        proveedor_id: header.proveedor_id,
        almacen_id: header.almacen_id,
        fecha,
        condicion_pago: condicion,
        dias_credito: dias,
        fecha_vencimiento: condicion === 'credito' ? due : null,
        status: 'borrador',
        subtotal: totals.subtotal,
        iva_total: totals.iva_total,
        total: totals.total,
        saldo_pendiente: totals.total,
        descuento_extra: 0,
        descuento_extra_tipo: 'monto',
        descuento_total: 0,
        ajuste_total: 0,
        notas: `Generada desde solicitud ${header.folio}`,
      };
      const rpcLines = purchaseLines.map(l => ({
        id: null,
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        subtotal: l.subtotal,
        total: l.total,
        factor_conversion: l._factor_conversion,
        piezas_total: l.cantidad * l._factor_conversion,
        lote_id: null,
      }));
      const { data, error } = await db.rpc('guardar_compra_segura', { p_compra_id: null, p_compra: compraData, p_lineas: rpcLines });
      if (error) throw error;
      const compraId = data?.compra_id;
      if (!compraId) throw new Error('No se recibió el ID de la compra');
      for (const l of accepted) await db.from('solicitud_compra_lineas').update({ cantidad_aceptada: Number(l.cantidad_aceptada ?? l.cantidad_surtida) }).eq('id', l.id);
      await db.from('solicitudes_compra').update({ status: 'convertida', compra_id: compraId }).eq('id', sid);
      await db.from('solicitud_compra_eventos').insert({ solicitud_id: sid, empresa_id: empresa.id, tipo: 'convertida_compra', actor_tipo: 'interno', actor_id: user?.id || null, detalle: { compra_id: compraId } });
      toast.success('Compra creada en borrador');
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['solicitudes-compra'] });
      navigate(`/almacen/compras/${compraId}`);
    } catch (e: any) { toast.error(e?.message || 'No se pudo crear la compra'); }
    finally { setConverting(false); }
  };

  if (!isDetail) {
    const items = listQuery.data ?? [];
    const pending = items.filter((s: any) => ['enviada', 'vista', 'borrador_proveedor'].includes(s.status)).length;
    const answered = items.filter((s: any) => s.status === 'respondida').length;
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Solicitudes de compra</h1><p className="text-sm text-muted-foreground mt-0.5">Solicita disponibilidad y costos a tus proveedores sin darles acceso a RutApp.</p></div>
          <button onClick={() => setSid('nueva')} className="btn-odoo-primary flex items-center gap-1.5"><Plus className="h-4 w-4" /> Nueva solicitud</button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Kpi label="Total" value={items.length} icon={<ClipboardList className="h-4 w-4" />} />
          <Kpi label="Esperando proveedor" value={pending} icon={<Mail className="h-4 w-4" />} />
          <Kpi label="Por revisar" value={answered} icon={<PackageCheck className="h-4 w-4" />} />
          <Kpi label="Convertidas" value={items.filter((s: any) => s.status === 'convertida').length} icon={<ShoppingCart className="h-4 w-4" />} />
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/35 text-left text-xs text-muted-foreground"><th className="px-4 py-2.5">Folio</th><th className="px-4 py-2.5">Proveedor</th><th className="px-4 py-2.5">Requerida</th><th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5">Enviada</th><th className="px-4 py-2.5"></th></tr></thead>
              <tbody>{items.map((s: any) => <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => setSid(s.id)}><td className="px-4 py-3 font-semibold">{s.folio}</td><td className="px-4 py-3">{s.proveedores?.nombre || s.proveedor_nombre}</td><td className="px-4 py-3 text-muted-foreground">{fmtDate(s.fecha_requerida)}</td><td className="px-4 py-3"><Status value={s.status} /></td><td className="px-4 py-3 text-muted-foreground">{s.enviado_at ? new Date(s.enviado_at).toLocaleString('es-MX') : '—'}</td><td className="px-4 py-3 text-right text-primary font-medium">Abrir</td></tr>)}</tbody>
            </table>
          </div>
          {!listQuery.isLoading && items.length === 0 && <div className="py-14 text-center text-muted-foreground"><ClipboardList className="h-9 w-9 mx-auto mb-2 opacity-40" /><p className="font-medium text-foreground">Aún no hay solicitudes</p><p className="text-xs mt-1">Crea la primera y envíala al proveedor por correo.</p></div>}
          {listQuery.isLoading && <div className="py-12 text-center text-muted-foreground">Cargando solicitudes…</div>}
        </div>
      </div>
    );
  }

  if (!isNew && detailQuery.isLoading) return <div className="p-6 text-muted-foreground">Cargando solicitud…</div>;
  if (!isNew && detailQuery.error) return <div className="p-6 text-destructive">No se pudo cargar la solicitud.</div>;

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0"><button onClick={() => setSid()} className="p-2 rounded-lg border hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="text-xl font-semibold truncate">{isNew ? 'Nueva solicitud' : header.folio}</h1>{!isNew && <Status value={header.status} />}</div><p className="text-xs text-muted-foreground mt-0.5">{isNew ? 'Prepara lo que necesitas solicitar al proveedor.' : header.proveedor_nombre}</p></div></div>
        <div className="flex items-center gap-2 shrink-0">{editable && <button onClick={saveRequest} disabled={saving} className="btn-odoo-secondary">{saving ? 'Guardando…' : 'Guardar'}</button>}{!isNew && !['respondida','convertida','cancelada'].includes(header.status) && <button onClick={openSend} className="btn-odoo-primary flex items-center gap-1.5"><Send className="h-4 w-4" /> {header.enviado_at ? 'Reenviar' : 'Enviar al proveedor'}</button>}</div>
      </div>

      <section className="bg-card border border-border rounded-xl p-4">
        <div className="grid md:grid-cols-4 gap-4">
          <div><label className="label-odoo label-required">Proveedor</label><SearchableSelect disabled={!editable} options={catalogs.proveedores.map((p: any) => ({ value: p.id, label: p.nombre }))} value={header.proveedor_id || ''} onChange={v => { const p = catalogs.proveedores.find((x: any) => x.id === v); setHeader((h: any) => ({ ...h, proveedor_id: v, proveedor_nombre: p?.nombre || '', proveedor_email: p?.email || h.proveedor_email })); }} placeholder="Seleccionar proveedor…" /></div>
          <div><label className="label-odoo label-required">Almacén destino</label><SearchableSelect disabled={!editable} options={catalogs.almacenes.map((a: any) => ({ value: a.id, label: a.nombre }))} value={header.almacen_id || ''} onChange={v => setHeader((h: any) => ({ ...h, almacen_id: v }))} placeholder="Seleccionar almacén…" /></div>
          <div><label className="label-odoo">Fecha requerida</label><input type="date" disabled={!editable} className="input-odoo w-full" value={header.fecha_requerida || ''} onChange={e => setHeader((h: any) => ({ ...h, fecha_requerida: e.target.value }))} /></div>
          <div><label className="label-odoo">Correo del proveedor</label><input disabled={!editable} className="input-odoo w-full" value={header.proveedor_email || selectedProvider?.email || ''} onChange={e => setHeader((h: any) => ({ ...h, proveedor_email: e.target.value }))} placeholder="compras@proveedor.com" /></div>
        </div>
        <div className="mt-4"><label className="label-odoo">Mensaje / instrucciones</label><textarea disabled={!editable} className="input-odoo w-full min-h-[72px]" value={header.notas || ''} onChange={e => setHeader((h: any) => ({ ...h, notas: e.target.value }))} placeholder="Ej. favor de confirmar disponibilidad y entrega antes del viernes." /></div>
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between"><div><h2 className="font-semibold text-sm">Productos solicitados</h2><p className="text-xs text-muted-foreground">El proveedor confirmará cantidad, costo y fecha por cada partida.</p></div>{editable && <button onClick={() => setLines(prev => [...prev, blankLine()])} className="btn-odoo-secondary text-xs flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Producto</button>}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/35 border-b text-xs text-muted-foreground text-left"><th className="px-3 py-2 w-[48%]">Producto</th><th className="px-3 py-2">Solicitado</th>{!editable && <><th className="px-3 py-2">Proveedor surte</th><th className="px-3 py-2">Costo</th><th className="px-3 py-2">Entrega</th></>}{editable && <th className="w-10"></th>}</tr></thead><tbody>{lines.map((l, idx) => <tr key={l.id || idx} className="border-b last:border-0 align-top"><td className="px-3 py-2">{editable ? <SearchableSelect options={catalogs.productos.map((p: any) => ({ value: p.id, label: `${p.codigo ? p.codigo + ' · ' : ''}${p.nombre_compra || p.nombre}` }))} value={l.producto_id || ''} onChange={v => setLines(prev => prev.map((x,i) => i===idx ? { ...x, producto_id: v } : x))} placeholder="Buscar producto…" /> : <div><div className="font-medium">{l.producto_nombre}</div><div className="text-xs text-muted-foreground">{l.producto_codigo || ''}</div>{l.observaciones && <div className="text-xs text-muted-foreground mt-1">{l.observaciones}</div>}</div>}</td><td className="px-3 py-2">{editable ? <input type="number" min="0.01" step="0.01" className="input-odoo w-28" value={l.cantidad_solicitada} onChange={e => setLines(prev => prev.map((x,i) => i===idx ? { ...x, cantidad_solicitada: Number(e.target.value) } : x))} /> : <span className="font-semibold">{Number(l.cantidad_solicitada).toLocaleString('es-MX')} {l.unidad || ''}</span>}</td>{!editable && <><td className="px-3 py-2">{l.disponible === false ? <span className="text-destructive font-medium">No disponible</span> : <span className="font-semibold">{l.cantidad_surtida ?? '—'} {l.unidad || ''}</span>}</td><td className="px-3 py-2 font-medium">{l.costo_unitario == null ? '—' : fmtMoney(l.costo_unitario)}</td><td className="px-3 py-2 text-muted-foreground">{fmtDate(l.fecha_entrega)}</td></>}{editable && <td className="px-2 py-2"><button onClick={() => setLines(prev => prev.filter((_,i) => i!==idx))} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>}</tr>)}</tbody></table></div>
      </section>

      {!editable && <section className="grid lg:grid-cols-[1.25fr_.75fr] gap-4">
        <div className="bg-card border border-border rounded-xl p-4"><div className="flex items-center justify-between mb-3"><div><h2 className="font-semibold text-sm">Seguimiento</h2><p className="text-xs text-muted-foreground">Trazabilidad de la solicitud.</p></div>{publicLinkVisible && <button onClick={copyPublicLink} className="btn-odoo-secondary text-xs flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copiar enlace</button>}</div><Timeline header={header} events={detailQuery.data?.eventos || []} /></div>
        <div className="bg-card border border-border rounded-xl p-4"><h2 className="font-semibold text-sm">Respuesta del proveedor</h2><p className="text-xs text-muted-foreground mt-1 mb-3">{header.proveedor_observaciones || 'Sin observaciones generales.'}</p>{publicLinkVisible ? <div className="space-y-2"><a href={publicUrl(header.public_token)} target="_blank" rel="noreferrer" className="text-xs text-primary font-medium inline-flex items-center gap-1">{['respondida','convertida'].includes(header.status) ? 'Ver solicitud en modo consulta' : 'Ver solicitud pública'} <ExternalLink className="h-3 w-3" /></a>{supplierResponded && <p className="text-[11px] text-emerald-700 font-medium">Cerrada · el proveedor puede seguir consultando este enlace, pero no editarlo.</p>}</div> : null}</div>
      </section>}

      {supplierResponded && <section className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4"><div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-emerald-800 font-semibold"><Check className="h-4 w-4" /> Solicitud cerrada y lista para convertir en compra</div><p className="text-xs text-emerald-700/80 mt-1">El proveedor ya cerró su respuesta. El mismo enlace permanece visible en modo consulta. Si necesita corregir cantidades, costos o fechas, puedes abrirla nuevamente para modificar antes de crear la compra.</p></div><div className="flex flex-wrap gap-2 shrink-0"><button onClick={() => setReopenOpen(true)} className="btn-odoo-secondary flex items-center gap-1.5"><RefreshCw className="h-4 w-4" /> Abrir para modificar</button><button onClick={convertToPurchase} disabled={converting} className="btn-odoo-primary flex items-center gap-1.5"><ShoppingCart className="h-4 w-4" /> {converting ? 'Creando compra…' : 'Crear compra con aceptados'}</button></div></div><div className="mt-4 bg-white border border-emerald-100 rounded-lg overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Ofrecido</th><th className="px-3 py-2">A comprar</th><th className="px-3 py-2">Costo</th><th className="px-3 py-2">Importe</th></tr></thead><tbody>{lines.filter(l => l.disponible !== false).map(l => { const accepted = Number(l.cantidad_aceptada ?? l.cantidad_surtida ?? 0); return <tr key={l.id} className="border-b last:border-0"><td className="px-3 py-2 font-medium">{l.producto_nombre}</td><td className="px-3 py-2">{l.cantidad_surtida ?? 0}</td><td className="px-3 py-2"><input className="input-odoo w-24" type="number" min="0" max={Number(l.cantidad_surtida ?? 0)} step="0.01" value={accepted} onChange={e => updateAccepted(l.id!, Math.min(Number(l.cantidad_surtida ?? 0), Number(e.target.value)))} /></td><td className="px-3 py-2">{fmtMoney(l.costo_unitario)}</td><td className="px-3 py-2 font-semibold">{fmtMoney(accepted * Number(l.costo_unitario || 0))}</td></tr>; })}</tbody></table></div></section>}

      {header.status === 'convertida' && header.compra_id && <section className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-violet-800">Esta solicitud ya generó una compra</p><p className="text-xs text-violet-700 mt-0.5">La solicitud queda como trazabilidad; el proveedor puede seguir consultando su respuesta en modo solo lectura.</p></div><button onClick={() => navigate(`/almacen/compras/${header.compra_id}`)} className="btn-odoo-primary">Abrir compra</button></section>}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Enviar solicitud al proveedor</DialogTitle><DialogDescription>RutApp enviará un correo profesional con un enlace único para que el proveedor responda sin iniciar sesión.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div><label className="label-odoo label-required">Para</label><input className="input-odoo w-full" value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="proveedor@empresa.com" /></div><div><label className="label-odoo">CC interno</label><input className="input-odoo w-full" value={sendCc} onChange={e => setSendCc(e.target.value)} placeholder="compras@miempresa.com, gerente@miempresa.com" /><p className="text-[11px] text-muted-foreground mt-1">Separa varios correos con coma. Cada persona recibirá una copia para seguimiento.</p></div><div className="rounded-lg bg-muted/40 border p-3 text-xs"><div className="font-semibold">Asunto</div><div className="text-muted-foreground mt-1">{empresa?.nombre || 'Tu empresa'} · Solicitud de compra {header.folio || ''}</div></div></div><DialogFooter><button onClick={() => setSendOpen(false)} className="btn-odoo-secondary">Cancelar</button><button onClick={sendRequest} disabled={sending} className="btn-odoo-primary flex items-center gap-1.5"><Send className="h-4 w-4" /> {sending ? 'Enviando…' : 'Enviar solicitud'}</button></DialogFooter></DialogContent></Dialog>

      <Dialog open={reopenOpen} onOpenChange={open => !reopening && setReopenOpen(open)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" /> Abrir para modificar</DialogTitle><DialogDescription>El proveedor volverá a poder editar su respuesta usando el mismo enlace de esta solicitud.</DialogDescription></DialogHeader><div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><p className="font-semibold text-foreground">¿Qué pasará?</p><p className="mt-1">La solicitud cambiará de Cerrada a Guardada, se habilitarán nuevamente cantidades, costos, fechas y observaciones, y el proveedor podrá volver a cerrarla cuando termine.</p></div><DialogFooter><button onClick={() => setReopenOpen(false)} disabled={reopening} className="btn-odoo-secondary">Cancelar</button><button onClick={reopenRequest} disabled={reopening} className="btn-odoo-primary flex items-center gap-1.5"><RefreshCw className={`h-4 w-4 ${reopening ? 'animate-spin' : ''}`} /> {reopening ? 'Abriendo…' : 'Abrir para modificar'}</button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const s = STATUS[value] || { label: value || '—', cls: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

function Kpi({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">{icon}</div><div><div className="text-lg font-bold leading-none">{value}</div><div className="text-[11px] text-muted-foreground mt-1">{label}</div></div></div>;
}

function Timeline({ header, events }: { header: any; events: any[] }) {
  const fixed = [
    { label: 'Creada', date: header.created_at, ok: true },
    { label: 'Enviada al proveedor', date: header.enviado_at, ok: !!header.enviado_at },
    { label: 'Vista por proveedor', date: header.visto_at, ok: !!header.visto_at },
    { label: 'Solicitud cerrada', date: header.respondido_at, ok: !!header.respondido_at },
  ];
  return <div className="space-y-2">{fixed.map((x,i) => <div key={x.label} className="flex items-center gap-3"><div className={`h-7 w-7 rounded-full grid place-items-center border ${x.ok ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted border-border text-muted-foreground'}`}>{x.ok ? <Check className="h-3.5 w-3.5" /> : i+1}</div><div><div className={`text-xs font-medium ${x.ok ? 'text-foreground' : 'text-muted-foreground'}`}>{x.label}</div><div className="text-[10px] text-muted-foreground">{x.date ? new Date(x.date).toLocaleString('es-MX') : 'Pendiente'}</div></div></div>)}{events.length > 4 && <div className="text-[10px] text-muted-foreground pt-1">{events.length} eventos registrados en el historial.</div>}</div>;
}
