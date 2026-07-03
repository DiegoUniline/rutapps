import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface TiendaPedido {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  status: string | null;
  cliente_nombre?: string | null;
  created_at: string;
}

const SEEN_KEY = (empresaId: string) => `tienda_pedidos_seen_${empresaId}`;

export default function TiendaOrdersBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const empresaId = empresa?.id ?? null;
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>(() => {
    if (!empresaId) return new Date(0).toISOString();
    return localStorage.getItem(SEEN_KEY(empresaId)) ?? new Date(0).toISOString();
  });

  useEffect(() => {
    if (!empresaId) return;
    setLastSeen(localStorage.getItem(SEEN_KEY(empresaId)) ?? new Date(0).toISOString());
  }, [empresaId]);

  const { data: pedidos = [] } = useQuery<TiendaPedido[]>({
    queryKey: ['tienda-pedidos-bell', empresaId],
    enabled: !!empresaId,
    // El realtime (INSERT en ventas origen tienda_web) empuja los pedidos nuevos.
    // El poll queda solo como red de seguridad amplia.
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, status, created_at, cliente:clientes(nombre)')
        .eq('empresa_id', empresaId!)
        .eq('origen', 'tienda_web')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((v: any) => ({
        id: v.id,
        folio: v.folio,
        fecha: v.fecha,
        total: Number(v.total ?? 0),
        status: v.status,
        created_at: v.created_at,
        cliente_nombre: v.cliente?.nombre ?? null,
      }));
    },
  });

  // Realtime subscription for new tienda orders
  useEffect(() => {
    if (!empresaId) return;
    const ch = supabase
      .channel(`tienda-orders-${empresaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ventas', filter: `empresa_id=eq.${empresaId}` },
        (payload: any) => {
          if (payload.new?.origen !== 'tienda_web') return;
          qc.invalidateQueries({ queryKey: ['tienda-pedidos-bell', empresaId] });
          toast.success('🛍️ Nuevo pedido de la tienda en línea', {
            description: payload.new?.folio ? `Folio ${payload.new.folio}` : undefined,
            action: { label: 'Ver', onClick: () => navigate(`/ventas/${payload.new.id}`) },
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [empresaId, qc, navigate]);

  const unreadCount = useMemo(() => {
    const t = new Date(lastSeen).getTime();
    return pedidos.filter(p => new Date(p.created_at).getTime() > t).length;
  }, [pedidos, lastSeen]);

  const markAllSeen = useCallback(() => {
    if (!empresaId) return;
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY(empresaId), now);
    setLastSeen(now);
  }, [empresaId]);

  const handleClick = (p: TiendaPedido) => {
    setOpen(false);
    if (!empresaId) return;
    const t = new Date(lastSeen).getTime();
    if (new Date(p.created_at).getTime() > t) {
      // bump seen marker to this pedido's time so it stops counting as unread
      const next = p.created_at;
      localStorage.setItem(SEEN_KEY(empresaId), next);
      setLastSeen(next);
    }
    navigate(`/ventas/${p.id}`);
  };

  if (!empresaId) return null;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v && unreadCount > 0) markAllSeen(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Pedidos tienda en línea"
          aria-label="Pedidos tienda en línea"
        >
          <ShoppingBag className={cn('h-[18px] w-[18px]', unreadCount > 0 && 'text-primary')} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0 max-h-[calc(100vh-80px)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Pedidos tienda en línea</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground">
                {unreadCount} nuevos
              </span>
            )}
          </div>
          {pedidos.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={markAllSeen}>
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar vistos
            </Button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {pedidos.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Aún no hay pedidos de la tienda
            </div>
          ) : (
            <ul className="divide-y">
              {pedidos.map(p => {
                const unread = new Date(p.created_at).getTime() > new Date(lastSeen).getTime();
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => handleClick(p)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 flex gap-3 hover:bg-muted/50 transition-colors',
                        unread && 'bg-primary/5'
                      )}
                    >
                      <span className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-primary/10">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className={cn('text-[13px] leading-snug flex-1', unread ? 'font-semibold' : 'text-foreground/80')}>
                            🛍️ Pedido {p.folio ?? p.id.slice(0, 8)}
                          </p>
                          {unread && <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {p.cliente_nombre ?? 'Cliente tienda'} · ${p.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
