import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, Mail, MapPin, FileText, Loader2 } from 'lucide-react';

interface Venta {
  id: string;
  folio: string;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  estado: string;
  tipo: string;
}
interface Cobro {
  id: string;
  monto: number;
  metodo_pago: string | null;
  referencia: string | null;
  fecha: string | null;
  created_at: string;
}
interface PortalData {
  empresa: { nombre: string; logo_url: string | null; telefono: string | null; moneda: string };
  cliente: { nombre: string; telefono: string | null; email: string | null; rfc: string | null; direccion: string | null };
  ventas: Venta[];
  cobros: Cobro[];
  saldoTotal: number;
}

const fmtMoney = (v: number, code = 'MXN') =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: code }).format(v ?? 0);
const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '—';

export default function EstadoCuentaPublicoPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cliente-portal?token=${token}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Error');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message || 'No se pudo cargar'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading)
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  if (error || !data)
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white text-center px-6">
        <div>
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Estado de cuenta no disponible</h1>
          <p className="text-sm text-muted-foreground">{error || 'El enlace no es válido o ha expirado.'}</p>
        </div>
      </div>
    );

  const m = data.empresa.moneda || 'MXN';
  const ventasConSaldo = data.ventas.filter((v) => Number(v.saldo_pendiente) > 0);

  return (
    <div className="min-h-[100dvh] bg-white text-foreground">
      <header className="bg-primary text-primary-foreground px-6 py-6">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          {data.empresa.logo_url && (
            <img src={data.empresa.logo_url} alt={data.empresa.nombre} className="w-12 h-12 rounded bg-white p-1 object-contain" />
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold">{data.empresa.nombre}</h1>
            <p className="text-sm opacity-90">Estado de cuenta</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2">{data.cliente.nombre}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
            {data.cliente.email && (<div className="flex items-center gap-2"><Mail className="w-4 h-4" />{data.cliente.email}</div>)}
            {data.cliente.telefono && (<div className="flex items-center gap-2"><Phone className="w-4 h-4" />{data.cliente.telefono}</div>)}
            {data.cliente.rfc && (<div>RFC: {data.cliente.rfc}</div>)}
            {data.cliente.direccion && (<div className="flex items-center gap-2"><MapPin className="w-4 h-4" />{data.cliente.direccion}</div>)}
          </div>
        </section>

        <section className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground uppercase tracking-wide">Saldo actual</p>
          <p className="text-4xl font-bold text-primary mt-1">{fmtMoney(data.saldoTotal, m)}</p>
        </section>

        <section>
          <h3 className="font-semibold mb-3">Documentos con saldo pendiente</h3>
          {ventasConSaldo.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">Sin saldos pendientes 🎉</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-3">Folio</th>
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-right p-3">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasConSaldo.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="p-3 font-medium">{v.folio}</td>
                      <td className="p-3">{fmtDate(v.fecha)}</td>
                      <td className="p-3 text-right">{fmtMoney(Number(v.total), m)}</td>
                      <td className="p-3 text-right font-semibold text-primary">{fmtMoney(Number(v.saldo_pendiente), m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3 className="font-semibold mb-3">Últimos pagos recibidos</h3>
          {data.cobros.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">Sin pagos registrados</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-left p-3">Método</th>
                    <th className="text-left p-3">Referencia</th>
                    <th className="text-right p-3">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cobros.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">{fmtDate(c.fecha || c.created_at)}</td>
                      <td className="p-3 capitalize">{c.metodo_pago || '—'}</td>
                      <td className="p-3 text-muted-foreground">{c.referencia || '—'}</td>
                      <td className="p-3 text-right font-semibold">{fmtMoney(Number(c.monto), m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-muted-foreground py-6">
          Powered by <a href="https://rutapp.mx" className="text-primary hover:underline">Rutapp</a>
        </footer>
      </main>
    </div>
  );
}
