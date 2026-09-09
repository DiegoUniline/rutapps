import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Search, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type CancellationItem = {
  empresa_id: string;
  empresa_nombre: string;
  licencia?: string | null;
  email?: string | null;
  telefono?: string | null;
  reason?: string | null;
  reason_detail?: string | null;
  offered_discount?: boolean | null;
  discount_accepted?: boolean | null;
  cancelled_at?: string | null;
};

type RpcResult = { data: unknown; error: { message?: string } | null };
const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<RpcResult>;
};

const REASON_LABELS: Record<string, string> = {
  costo: 'Muy caro',
  funciones: 'Faltan funciones',
  soporte: 'Soporte deficiente',
  otro_sistema: 'Cambió de sistema',
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener('rutapp:navigation', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('rutapp:navigation', sync);
    };
  }, []);
  return path;
}

export default function GlobalCrmCancellationsList() {
  const path = usePath();
  const visible = /^\/(super-admin|equipo)(?:\/crm\/[^/]+)?\/?$/.test(path);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CancellationItem[]>([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await rpcClient.rpc('fn_crm_cancellations_list');
      if (error) throw new Error(error.message || 'No se pudieron cargar cancelaciones');
      setItems(Array.isArray(data) ? data as CancellationItem[] : []);
    } catch (error) {
      console.warn('No se pudieron cargar cancelaciones CRM:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return items;
    return items.filter(item => `${item.empresa_nombre} ${item.licencia ?? ''} ${item.email ?? ''} ${item.telefono ?? ''} ${item.reason ?? ''} ${item.reason_detail ?? ''}`.toLocaleLowerCase('es').includes(term));
  }, [items, search]);

  if (!visible) return null;

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className="fixed bottom-20 right-5 z-[54] shadow-xl"
        onClick={() => { setOpen(true); void load(); }}
      >
        <UserX className="mr-2 h-4 w-4" />
        Cancelaciones
        <Badge variant="secondary" className="ml-2">{items.length}</Badge>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border p-5">
            <DialogTitle className="flex items-center gap-2"><UserX className="h-5 w-5 text-destructive" />Clientes que cancelaron</DialogTitle>
            <DialogDescription>Personas que sí llegaron a cancelar su suscripción, con el motivo real registrado en el proceso de cancelación.</DialogDescription>
            <div className="relative mt-3 max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Buscar empresa, correo, teléfono o motivo…" />
            </div>
          </DialogHeader>

          <div className="max-h-[68vh] overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Cargando cancelaciones…</div>
            ) : (
              <table className="w-full min-w-[1050px] text-xs">
                <thead className="sticky top-0 bg-muted/95">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left">Empresa</th>
                    <th className="px-3 py-3 text-left">Contacto</th>
                    <th className="px-3 py-3 text-left">Motivo</th>
                    <th className="px-3 py-3 text-left">Lo que escribió</th>
                    <th className="px-3 py-3 text-center">Fecha</th>
                    <th className="px-3 py-3 text-center">Retención</th>
                    <th className="px-4 py-3 text-center">CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const base = path.startsWith('/equipo') ? '/equipo' : '/super-admin';
                    return (
                      <tr key={`${item.empresa_id}-${item.cancelled_at}`} className="border-b border-border/70 hover:bg-muted/30">
                        <td className="px-4 py-3"><p className="font-bold">{item.empresa_nombre}</p><p className="text-[10px] text-muted-foreground">{item.licencia || 'Sin licencia'}</p></td>
                        <td className="px-3 py-3"><p>{item.telefono || '—'}</p><p className="max-w-[220px] truncate text-muted-foreground">{item.email || '—'}</p></td>
                        <td className="px-3 py-3 font-semibold text-destructive">{item.reason ? (REASON_LABELS[item.reason] ?? item.reason) : 'Sin motivo'}</td>
                        <td className="max-w-[330px] px-3 py-3"><p className="line-clamp-3">{item.reason_detail || 'Sin comentario adicional'}</p></td>
                        <td className="px-3 py-3 text-center">{formatDate(item.cancelled_at)}</td>
                        <td className="px-3 py-3 text-center">{item.offered_discount ? (item.discount_accepted ? 'Aceptó' : 'Rechazó') : 'Sin oferta'}</td>
                        <td className="px-4 py-3 text-center"><Button size="sm" variant="outline" onClick={() => { window.history.pushState({}, '', `${base}/crm/${item.empresa_id}`); window.dispatchEvent(new Event('popstate')); setOpen(false); }}><Eye className="mr-1.5 h-3.5 w-3.5" />Ver CRM</Button></td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">No hay cancelaciones registradas.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
