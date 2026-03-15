import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Truck, Check, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useValidarEntrega } from '@/hooks/useEntregas';
import { toast } from 'sonner';
import { cn, fmtDate } from '@/lib/utils';

export default function EntregaCamionPage() {
  const { vendedorId } = useParams();
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const validarMut = useValidarEntrega();

  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ['entregas-camion', vendedorId, today],
    enabled: !!vendedorId && !!empresa?.id,
    queryFn: async () => {
      const { data: entregas, error } = await supabase
        .from('entregas')
        .select('id, folio, status, cliente_id, clientes(nombre), entrega_lineas(id, producto_id, cantidad_pedida, cantidad_entregada, hecho, productos(codigo, nombre))')
        .eq('empresa_id', empresa!.id)
        .eq('vendedor_id', vendedorId!)
        .eq('fecha', today)
        .in('status', ['borrador', 'listo', 'hecho'] as any)
        .order('created_at');
      if (error) throw error;

      // Vendedor name
      const { data: vend } = await supabase.from('vendedores').select('nombre').eq('id', vendedorId!).single();

      return { entregas: entregas ?? [], vendedorNombre: vend?.nombre ?? '—' };
    },
  });

  const entregas = data?.entregas ?? [];

  // Consolidated view
  const consolidado = useMemo(() => {
    const map = new Map<string, { codigo: string; nombre: string; totalCargar: number; totalValidado: number }>();
    for (const e of entregas) {
      for (const l of ((e as any).entrega_lineas ?? [])) {
        const key = l.producto_id;
        const existing = map.get(key) ?? { codigo: l.productos?.codigo ?? '', nombre: l.productos?.nombre ?? '', totalCargar: 0, totalValidado: 0 };
        existing.totalCargar += Number(l.cantidad_entregada) || 0;
        if ((e as any).status === 'hecho') existing.totalValidado += Number(l.cantidad_entregada) || 0;
        map.set(key, existing);
      }
    }
    return Array.from(map.values());
  }, [entregas]);

  const totalLineas = entregas.reduce((s, e) => s + ((e as any).entrega_lineas?.length ?? 0), 0);
  const lineasValidadas = entregas.filter(e => (e as any).status === 'hecho').reduce((s, e) => s + ((e as any).entrega_lineas?.length ?? 0), 0);
  const pctValidado = totalLineas > 0 ? Math.round((lineasValidadas / totalLineas) * 100) : 0;

  const validarTodo = async () => {
    const pendientes = entregas.filter(e => (e as any).status !== 'hecho' && (e as any).status !== 'cancelado');
    if (pendientes.length === 0) { toast.info('No hay entregas pendientes'); return; }

    try {
      for (const ent of pendientes) {
        const items = ((ent as any).entrega_lineas ?? []).map((l: any) => ({
          id: l.id,
          producto_id: l.producto_id,
          cantidad_entregada: Number(l.cantidad_entregada) || 0,
          hecho: true,
        }));
        await validarMut.mutateAsync({ entregaId: ent.id });
      }
      toast.success(`${pendientes.length} entregas validadas`);
      qc.invalidateQueries({ queryKey: ['entregas-camion'] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/logistica/entregas')} className="btn-odoo-secondary !px-2.5">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Truck className="h-5 w-5" /> Camión: {data?.vendedorNombre ?? '—'}
            </h1>
            <p className="text-[12px] text-muted-foreground">{fmtDate(today)} · {entregas.length} entregas</p>
          </div>
        </div>
        <Button onClick={validarTodo} disabled={validarMut.isPending}>
          <Check className="h-4 w-4 mr-1" /> Validar todo el camión
        </Button>
      </div>

      {/* Progress */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-foreground">Progreso de carga</span>
          <span className="text-[12px] font-bold text-foreground">{pctValidado}%</span>
        </div>
        <Progress value={pctValidado} className="h-2" />
      </div>

      {/* Consolidated */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-muted/40 border-b border-border">
          <span className="text-[13px] font-semibold text-foreground">Consolidado de productos</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Producto</TableHead>
              <TableHead className="text-[11px] text-right">Total a cargar</TableHead>
              <TableHead className="text-[11px] text-right">Validado</TableHead>
              <TableHead className="text-[11px] text-right">Pendiente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consolidado.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                <Package className="h-6 w-6 mx-auto mb-2 opacity-30" /> Sin productos
              </TableCell></TableRow>
            )}
            {consolidado.map((p, i) => (
              <TableRow key={i}>
                <TableCell className="text-[12px] py-2">
                  <span className="font-mono text-muted-foreground mr-2">{p.codigo}</span>{p.nombre}
                </TableCell>
                <TableCell className="text-right text-[12px] font-medium py-2">{p.totalCargar}</TableCell>
                <TableCell className="text-right text-[12px] py-2">{p.totalValidado}</TableCell>
                <TableCell className={cn("text-right text-[12px] font-bold py-2", (p.totalCargar - p.totalValidado) > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {p.totalCargar - p.totalValidado}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Individual entregas */}
      <div className="space-y-2">
        <h2 className="text-[13px] font-semibold text-foreground">Entregas individuales</h2>
        {entregas.map((e: any) => (
          <div key={e.id}
            className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigate(`/logistica/entregas/${e.id}`)}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[11px] font-bold">{e.folio}</span>
                <span className="text-[12px] text-muted-foreground ml-2">{e.clientes?.nombre ?? '—'}</span>
              </div>
              <Badge
                variant={e.status === 'hecho' ? 'outline' : e.status === 'listo' ? 'default' : 'secondary'}
                className="text-[10px]"
              >
                {e.status === 'hecho' ? 'Hecho' : e.status === 'listo' ? 'Listo' : 'Borrador'}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {(e.entrega_lineas?.length ?? 0)} productos
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
