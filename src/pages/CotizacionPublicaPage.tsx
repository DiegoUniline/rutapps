import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/currency';
import { FileText, AlertCircle } from 'lucide-react';

interface PublicData {
  cotizacion: any;
  lineas: any[];
  empresa: any | null;
  cliente: any | null;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

export default function CotizacionPublicaPage() {
  const { token } = useParams();
  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setError('Token inválido'); setLoading(false); return; }
      // La cotización pública se sirve por token desde una edge function con
      // service-role (filtrada en el servidor). Antes se leía directo de la tabla
      // con `anon`, lo que exponía las cotizaciones de todas las empresas.
      const { data: res, error: fnErr } = await supabase.functions.invoke('cotizacion-publica', {
        body: { token },
      });
      if (fnErr || !res || res.error || !res.cotizacion) {
        setError('No se encontró la cotización'); setLoading(false); return;
      }
      setData({
        cotizacion: res.cotizacion,
        lineas: res.lineas ?? [],
        empresa: res.empresa ?? null,
        cliente: res.cliente ?? null,
      });
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">Cargando…</div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-2 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">{error}</h1>
        <p className="text-sm text-muted-foreground">Verifica el enlace que recibiste.</p>
      </div>
    );
  }

  const { cotizacion: c, lineas, empresa, cliente } = data;
  const moneda = c.moneda || empresa?.moneda || 'MXN';
  const money = (v: number | null | undefined) => formatCurrency(Number(v ?? 0), moneda);

  return (
    <div className="min-h-[100dvh] bg-white text-zinc-900">
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
        <header className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-900">
          <div>
            {empresa?.logo_url && <img src={empresa.logo_url} alt="" className="h-12 mb-2 object-contain" />}
            <h1 className="text-lg font-bold uppercase tracking-tight">{empresa?.nombre || 'Empresa'}</h1>
            {empresa?.rfc && <p className="text-xs text-zinc-600">RFC: {empresa.rfc}</p>}
            {empresa?.telefono && <p className="text-xs text-zinc-600">Tel: {empresa.telefono}</p>}
          </div>
          <div className="text-right">
            <div className="text-base font-bold">COTIZACIÓN</div>
            <div className="text-sm text-zinc-600">{c.folio}</div>
            <div className="text-xs text-zinc-500 mt-1">{fmtDate(c.fecha)}</div>
            <div className="text-xs text-zinc-500">Moneda: {moneda}</div>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase text-zinc-500 mb-1">Cliente</div>
            <div className="font-semibold">{cliente?.nombre || 'Sin cliente'}</div>
            {cliente?.rfc && <div className="text-xs text-zinc-600">RFC: {cliente.rfc}</div>}
            {cliente?.telefono && <div className="text-xs text-zinc-600">Tel: {cliente.telefono}</div>}
            {cliente?.direccion && <div className="text-xs text-zinc-600">{cliente.direccion}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase text-zinc-500 mb-1">Vigencia</div>
            <div className="font-semibold">Hasta {fmtDate(c.vence_at)}</div>
            <div className="text-xs text-zinc-600">{c.vigencia_dias} días</div>
            <div className="text-xs uppercase text-zinc-500 mt-2">Estado</div>
            <div className="font-semibold uppercase">{c.estado}</div>
          </div>
        </section>

        <section>
          <table className="w-full text-sm border-t border-b border-zinc-300">
            <thead className="bg-zinc-100 text-xs">
              <tr>
                <th className="text-left px-2 py-2">#</th>
                <th className="text-left px-2 py-2">Descripción</th>
                <th className="text-right px-2 py-2">Cant.</th>
                <th className="text-right px-2 py-2">Precio</th>
                <th className="text-right px-2 py-2">Desc.</th>
                <th className="text-right px-2 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.id} className="border-t border-zinc-200">
                  <td className="px-2 py-2 text-zinc-500">{i + 1}</td>
                  <td className="px-2 py-2">{l.descripcion || (l.producto_snapshot?.nombre ?? '—')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(l.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(l.precio_unitario)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(l.descuento_pct ?? 0) > 0 ? `${l.descuento_pct}%` : '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="flex justify-end">
          <div className="w-full sm:w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-zinc-600">Subtotal</span><span className="tabular-nums">{money(c.subtotal)}</span></div>
            {Number(c.descuento) > 0 && <div className="flex justify-between"><span className="text-zinc-600">Descuento</span><span className="tabular-nums">- {money(c.descuento)}</span></div>}
            {Number(c.impuestos) > 0 && <div className="flex justify-between"><span className="text-zinc-600">Impuestos</span><span className="tabular-nums">{money(c.impuestos)}</span></div>}
            <div className="flex justify-between border-t border-zinc-900 pt-1 text-base font-bold"><span>TOTAL</span><span className="tabular-nums">{money(c.total)}</span></div>
          </div>
        </section>

        {c.notas && (
          <section className="text-sm border-t border-zinc-200 pt-3">
            <div className="text-xs uppercase text-zinc-500 mb-1">Notas</div>
            <div className="whitespace-pre-wrap text-zinc-700">{c.notas}</div>
          </section>
        )}

        <footer className="flex items-center justify-between text-xs text-zinc-500 pt-4 border-t border-zinc-200">
          <span>Generado por rutapp.mx</span>
          <FileText className="h-4 w-4" />
        </footer>
      </div>
    </div>
  );
}
