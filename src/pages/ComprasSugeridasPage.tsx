import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, RefreshCw, Filter, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { useProveedores } from '@/hooks/useData';
import { fmtMoney } from '@/lib/currency';
import { getNombreCompra } from '@/lib/productoNombres';
import { ListPage, TABLE_CARD, SCROLL_AREA } from '@/components/layout/ListPage';

type Modo = 'producto' | 'maximo' | 'medio' | 'minimo' | 'cobertura';

interface ProdRow {
  id: string;
  codigo: string;
  nombre: string;
  nombre_compra?: string | null;
  costo: number;
  cantidad: number;
  min: number;
  max: number;
  modo_compra_sugerida?: string | null;
  dias_cobertura?: number | null;
  lead_time_dias?: number | null;
  proveedor_preferido_id?: string | null;
}

function calcSugerido(p: ProdRow, modoGlobal: Modo, ventaDiaria: number): number {
  const modo: string = modoGlobal === 'producto' ? (p.modo_compra_sugerida || 'maximo') : modoGlobal;
  const min = Number(p.min) || 0;
  const max = Number(p.max) || 0;
  let target = 0;
  if (modo === 'maximo') target = max;
  else if (modo === 'medio') target = max > 0 ? max / 2 : min;
  else if (modo === 'minimo') target = min;
  else if (modo === 'cobertura') {
    const dias = (Number(p.dias_cobertura) || 30) + (Number(p.lead_time_dias) || 0);
    target = ventaDiaria * dias;
  }
  return Math.max(0, Math.ceil(target));
}

function useSugeridosData(empresaId?: string, modo: Modo = 'producto') {
  return useQuery({
    queryKey: ['compras-sugeridas', empresaId, modo === 'cobertura' ? 'cob' : 'std'],
    queryFn: async () => {
      // Productos comprables
      const productos = await fetchAllPages<ProdRow>((from, to) =>
        supabase.from('productos')
          .select('id,codigo,nombre,nombre_compra,costo,cantidad,min,max,modo_compra_sugerida,dias_cobertura,lead_time_dias,proveedor_preferido_id')
          .eq('empresa_id', empresaId)
          .eq('status', 'activo')
          .eq('se_puede_comprar', true)
          .range(from, to)
      );
      // Venta promedio diaria últimos 30d (para modo cobertura, también útil mostrarlo siempre)
      const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
      const since = hace30.toISOString();
      const lineas = await fetchAllPages<{ producto_id: string; cantidad: number; ventas: { fecha: string; status: string; empresa_id: string } | null }>((from, to) =>
        supabase.from('venta_lineas')
          .select('producto_id,cantidad,ventas!inner(fecha,status,empresa_id)')
          .eq('ventas.empresa_id', empresaId)
          .neq('ventas.status', 'cancelado' as any)
          .gte('ventas.fecha', since)
          .range(from, to)
      );
      const ventaDiariaMap = new Map<string, number>();
      for (const l of lineas) {
        const prev = ventaDiariaMap.get(l.producto_id) || 0;
        ventaDiariaMap.set(l.producto_id, prev + (Number(l.cantidad) || 0));
      }
      for (const [k, v] of ventaDiariaMap) ventaDiariaMap.set(k, v / 30);
      return { productos, ventaDiariaMap };
    },
    enabled: !!empresaId,
  });
}

export default function ComprasSugeridasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { data: proveedores } = useProveedores();
  const [modo, setModo] = useState<Modo>('producto');
  const [filtroProv, setFiltroProv] = useState<string>('');
  const [editado, setEditado] = useState<Record<string, number>>({});
  const [minMaxEdit, setMinMaxEdit] = useState<Record<string, { min?: number; max?: number }>>({});
  const [savingMinMax, setSavingMinMax] = useState<Record<string, boolean>>({});
  const [soloSugeridos, setSoloSugeridos] = useState(false);
  const [generando, setGenerando] = useState(false);
  const { data, isLoading, refetch, isFetching } = useSugeridosData(empresa?.id, modo);

  const saveProductoPatch = async (productoId: string, patch: Record<string, any>, successMsg: string) => {
    if (!empresa?.id) return;
    setSavingMinMax(s => ({ ...s, [productoId]: true }));
    try {
      const { error } = await supabase.from('productos')
        .update(patch as any)
        .eq('id', productoId)
        .eq('empresa_id', empresa.id);
      if (error) throw error;
      qc.setQueryData(['compras-sugeridas', empresa.id, modo === 'cobertura' ? 'cob' : 'std'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          productos: old.productos.map((p: ProdRow) => p.id === productoId ? { ...p, ...patch } : p),
        };
      });
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSavingMinMax(s => { const n = { ...s }; delete n[productoId]; return n; });
    }
  };

  const saveMinMax = async (productoId: string, patch: { min?: number; max?: number }) => {
    await saveProductoPatch(productoId, patch, 'Min/Max actualizado');
    setMinMaxEdit(s => { const n = { ...s }; delete n[productoId]; return n; });
  };

  const saveProveedor = (productoId: string, proveedorId: string) =>
    saveProductoPatch(productoId, { proveedor_preferido_id: proveedorId || null }, 'Proveedor asignado');


  const filasAll = useMemo(() => {
    if (!data) return [];
    return data.productos
      .map(p => {
        const ventaDiaria = data.ventaDiariaMap.get(p.id) || 0;
        const sugAuto = calcSugerido(p, modo, ventaDiaria);
        const sug = editado[p.id] ?? sugAuto;
        return { p, ventaDiaria, sugAuto, sug };
      })
      .filter(r => !filtroProv || r.p.proveedor_preferido_id === filtroProv);
  }, [data, modo, editado, filtroProv]);

  const filas = useMemo(() => soloSugeridos ? filasAll.filter(r => r.sug > 0) : filasAll, [filasAll, soloSugeridos]);
  const sinConfigurar = useMemo(() => filasAll.filter(r => (Number(r.p.max) || 0) === 0).length, [filasAll]);

  const grupos = useMemo(() => {
    const map = new Map<string, typeof filas>();
    for (const f of filas) {
      const key = f.p.proveedor_preferido_id || '__sin__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries()).map(([provId, items]) => {
      const prov = proveedores?.find(p => p.id === provId);
      return {
        provId,
        provNombre: prov?.nombre || 'Sin proveedor asignado',
        items,
        total: items.reduce((s, r) => s + r.sug * Number(r.p.costo || 0), 0),
      };
    }).sort((a, b) => a.provNombre.localeCompare(b.provNombre));
  }, [filas, proveedores]);

  const generarOC = async (provId: string, items: typeof filas) => {
    if (provId === '__sin__') { toast.error('Asigna un proveedor preferido a estos productos primero.'); return; }
    if (!empresa?.id) return;
    setGenerando(true);
    try {
      const subtotal = items.reduce((s, r) => s + r.sug * Number(r.p.costo || 0), 0);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: compra, error: e1 } = await supabase.from('compras').insert({
        empresa_id: empresa.id,
        proveedor_id: provId,
        fecha: new Date().toISOString().slice(0, 10),
        status: 'borrador',
        condicion_pago: 'contado',
        subtotal,
        iva_total: 0,
        total: subtotal,
        saldo_pendiente: subtotal,
        notas: 'Generada desde Compras Sugeridas',
        created_by: user?.id,
        
      } as any).select('id').single();
      if (e1) throw e1;
      const lineas = items.map(r => ({
        compra_id: compra.id,
        producto_id: r.p.id,
        cantidad: r.sug,
        precio_unitario: Number(r.p.costo || 0),
        subtotal: r.sug * Number(r.p.costo || 0),
        total: r.sug * Number(r.p.costo || 0),
      }));
      const { error: e2 } = await supabase.from('compra_lineas').insert(lineas as any);
      if (e2) throw e2;
      toast.success('Orden de compra borrador creada');
      qc.invalidateQueries({ queryKey: ['compras'] });
      navigate(`/almacen/compras/${compra.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al generar OC');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <ListPage scroll>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Compras Sugeridas
          </h1>
          <p className="text-[12px] text-muted-foreground">Calcula automáticamente qué pedir según mínimos, máximos o cobertura.</p>
        </div>
        <button onClick={() => refetch()} className="text-[12px] text-primary hover:underline flex items-center gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Recalcular
        </button>
      </div>

      <div className="bg-card border border-border rounded p-3 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Modo de cálculo</label>
          <select value={modo} onChange={e => { setModo(e.target.value as Modo); setEditado({}); }}
            className="border border-input rounded px-2 py-1 text-[13px] bg-background">
            <option value="producto">Según configuración de cada producto</option>
            <option value="maximo">Forzar: al máximo</option>
            <option value="medio">Forzar: a la mitad</option>
            <option value="minimo">Forzar: al mínimo</option>
            <option value="cobertura">Forzar: por cobertura</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><Filter className="w-3 h-3" /> Proveedor</label>
          <select value={filtroProv} onChange={e => setFiltroProv(e.target.value)}
            className="border border-input rounded px-2 py-1 text-[13px] bg-background min-w-[200px]">
            <option value="">Todos</option>
            {proveedores?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
          <input type="checkbox" checked={soloSugeridos} onChange={e => setSoloSugeridos(e.target.checked)} />
          Solo con sugerencia
        </label>
        <div className="ml-auto text-[12px] text-muted-foreground">
          {filas.length} de {filasAll.length} producto(s)
        </div>
      </div>

      {sinConfigurar > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-[12px] rounded p-3">
          <strong>{sinConfigurar}</strong> producto(s) sin <em>min/max</em> configurado. Ábrelos y ve a la pestaña <strong>Config. compra</strong> para definir sus niveles, o desactiva "Solo con sugerencia" para verlos y pedir manualmente.
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Cargando...</div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded">
          <p className="text-sm text-muted-foreground">
            {soloSugeridos ? 'No hay productos que requieran compra con este criterio.' : 'No hay productos comprables en esta empresa.'}
          </p>
        </div>
      ) : (
        grupos.map(g => (
          <div key={g.provId} className="bg-card border border-border rounded overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-border">
              <div>
                <div className="font-medium text-[13px] text-foreground">{g.provNombre}</div>
                <div className="text-[11px] text-muted-foreground">{g.items.length} producto(s) · Total estimado: {fmtMoney(g.total)}</div>
              </div>
              <button
                disabled={generando || g.provId === '__sin__'}
                onClick={() => generarOC(g.provId, g.items)}
                className="bg-primary text-primary-foreground text-[12px] px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50 hover:bg-primary/90"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> Generar OC
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Código</th>
                    <th className="text-left p-2">Producto</th>
                    <th className="text-right p-2">Stock</th>
                    <th className="text-right p-2">Min</th>
                    <th className="text-right p-2">Max</th>
                    <th className="text-right p-2">Vta/día</th>
                    <th className="text-right p-2">Sugerido</th>
                    <th className="text-right p-2">A pedir</th>
                    <th className="text-right p-2">Costo</th>
                    <th className="text-right p-2">Importe</th>
                    <th className="text-left p-2">Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map(r => {
                    const sinConfig = (Number(r.p.max) || 0) === 0;
                    return (
                    <tr key={r.p.id} className={`border-t border-border ${sinConfig ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-muted/20'}`}>
                      <td className="p-2 font-mono">{r.p.codigo}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/almacen/compras/sugeridas/productos/${r.p.id}`)}
                          className="text-primary hover:underline text-left"
                          title="Abrir ficha de producto (usa atrás para volver)"
                        >
                          {getNombreCompra(r.p as any)}
                        </button>
                        {sinConfig && <span className="ml-2 text-[10px] text-amber-700 font-medium">sin min/max</span>}
                      </td>
                      <td className="p-2 text-right">{Number(r.p.cantidad).toFixed(0)}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={minMaxEdit[r.p.id]?.min ?? Number(r.p.min) ?? 0}
                          disabled={savingMinMax[r.p.id]}
                          onChange={e => setMinMaxEdit(s => ({ ...s, [r.p.id]: { ...s[r.p.id], min: Math.max(0, +e.target.value) } }))}
                          onBlur={e => {
                            const v = Math.max(0, +e.target.value);
                            if (v !== Number(r.p.min)) saveMinMax(r.p.id, { min: v });
                          }}
                          className="w-16 text-right border border-input rounded px-1 py-0.5 bg-background"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={minMaxEdit[r.p.id]?.max ?? Number(r.p.max) ?? 0}
                          disabled={savingMinMax[r.p.id]}
                          onChange={e => setMinMaxEdit(s => ({ ...s, [r.p.id]: { ...s[r.p.id], max: Math.max(0, +e.target.value) } }))}
                          onBlur={e => {
                            const v = Math.max(0, +e.target.value);
                            if (v !== Number(r.p.max)) saveMinMax(r.p.id, { max: v });
                          }}
                          className="w-16 text-right border border-input rounded px-1 py-0.5 bg-background"
                        />
                      </td>
                      <td className="p-2 text-right">{r.ventaDiaria.toFixed(1)}</td>
                      <td className="p-2 text-right text-muted-foreground">{r.sugAuto}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={r.sug}
                          onChange={e => setEditado(prev => ({ ...prev, [r.p.id]: Math.max(0, +e.target.value) }))}
                          className="w-20 text-right border border-input rounded px-1 py-0.5 bg-background"
                        />
                      </td>
                      <td className="p-2 text-right">{fmtMoney(Number(r.p.costo || 0))}</td>
                      <td className="p-2 text-right font-medium">{fmtMoney(r.sug * Number(r.p.costo || 0))}</td>
                      <td className="p-2">
                        <select
                          value={r.p.proveedor_preferido_id || ''}
                          disabled={savingMinMax[r.p.id]}
                          onChange={e => saveProveedor(r.p.id, e.target.value)}
                          className={`border rounded px-1 py-0.5 bg-background text-[12px] max-w-[180px] ${!r.p.proveedor_preferido_id ? 'border-amber-400 text-amber-700' : 'border-input'}`}
                        >
                          <option value="">— Sin proveedor —</option>
                          {proveedores?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </ListPage>
  );
}
