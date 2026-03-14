import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Search, Package, Check, Clock, ChevronRight, Printer, ArrowRightLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

/* ─── Data ──────────────────────────────────────────── */

function useEntregas(search?: string, vendedorFilter?: string, statusFilter?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entregas', empresa?.id, search, vendedorFilter, statusFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('*, clientes(nombre, direccion, colonia, telefono, rfc), vendedores(nombre), venta_lineas(id, cantidad, precio_unitario, descuento_pct, subtotal, total, iva_monto, ieps_monto, productos(codigo, nombre), unidades(abreviatura))')
        .eq('empresa_id', empresa!.id)
        .eq('tipo', 'venta_directa')
        .not('pedido_origen_id', 'is', null)
        .order('created_at', { ascending: false });

      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useVendedoresList() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });
}

/* ─── Print document ────────────────────────────────── */

function PrintDocument({ entrega, empresa }: { entrega: any; empresa: any }) {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: empresaConfig } = useQuery({
    queryKey: ['empresa-config', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('empresas').select('*').eq('id', empresa!.id).single();
      return data;
    },
  });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Entrega ${entrega.folio}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; padding: 32px; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e5e5; }
        .company { font-size: 18px; font-weight: 700; }
        .doc-title { font-size: 14px; font-weight: 600; color: #666; }
        .folio { font-size: 20px; font-weight: 700; font-family: monospace; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .meta-box { background: #f9f9f9; border-radius: 6px; padding: 12px; }
        .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
        .meta-value { font-size: 13px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f3f3f3; text-align: left; padding: 8px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #ddd; }
        td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals { display: flex; justify-content: flex-end; }
        .totals-box { width: 280px; }
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
        .total-row.grand { border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 8px; font-size: 16px; font-weight: 700; }
        .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-done { background: #d1fae5; color: #065f46; }
        .footer { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .sign-line { border-top: 1px solid #aaa; padding-top: 6px; text-align: center; font-size: 11px; color: #888; margin-top: 48px; }
        @media print { body { padding: 16px; } }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  return (
    <div>
      <Button size="sm" variant="outline" className="text-[11px] h-7" onClick={handlePrint}>
        <Printer className="h-3 w-3 mr-1" /> Imprimir
      </Button>

      {/* Hidden printable content */}
      <div ref={printRef} className="hidden">
        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(empresaConfig as any)?.logo_url && (
              <img src={(empresaConfig as any).logo_url} alt="Logo" style={{ height: '48px', objectFit: 'contain' }} />
            )}
            <div>
              <div className="company">{empresaConfig?.nombre ?? empresa?.nombre ?? 'Mi Empresa'}</div>
              {(empresaConfig as any)?.direccion && <div style={{ fontSize: '10px', color: '#888' }}>{(empresaConfig as any).direccion}{(empresaConfig as any).colonia ? `, ${(empresaConfig as any).colonia}` : ''}{(empresaConfig as any).ciudad ? `, ${(empresaConfig as any).ciudad}` : ''}</div>}
              {(empresaConfig as any)?.rfc && <div style={{ fontSize: '10px', color: '#888' }}>RFC: {(empresaConfig as any).rfc}</div>}
              {(empresaConfig as any)?.telefono && <div style={{ fontSize: '10px', color: '#888' }}>Tel: {(empresaConfig as any).telefono}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="doc-title">Documento de entrega</div>
            <div className="folio">{entrega.folio}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>{fmtDate(entrega.fecha)}</div>
            <span className={`status-badge ${entrega.status === 'confirmado' ? 'status-pending' : 'status-done'}`}>
              {entrega.status === 'confirmado' ? 'Por entregar' : 'Entregado'}
            </span>
          </div>
        </div>

        <div className="meta-grid">
          <div className="meta-box">
            <div className="meta-label">Cliente</div>
            <div className="meta-value">{entrega.clientes?.nombre ?? '—'}</div>
            {entrega.clientes?.direccion && <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{entrega.clientes.direccion}{entrega.clientes.colonia ? `, ${entrega.clientes.colonia}` : ''}</div>}
            {entrega.clientes?.rfc && <div style={{ fontSize: '11px', color: '#666' }}>RFC: {entrega.clientes.rfc}</div>}
            {entrega.clientes?.telefono && <div style={{ fontSize: '11px', color: '#666' }}>Tel: {entrega.clientes.telefono}</div>}
          </div>
          <div className="meta-box">
            <div className="meta-label">Ruta / Vendedor</div>
            <div className="meta-value">{entrega.vendedores?.nombre ?? '—'}</div>
            <div style={{ marginTop: '8px' }}>
              <div className="meta-label">Condición de pago</div>
              <div className="meta-value" style={{ textTransform: 'capitalize' }}>{entrega.condicion_pago}</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Código</th>
              <th>Producto</th>
              <th className="text-center">Cantidad</th>
              <th className="text-right">P. unitario</th>
              <th className="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {entrega.venta_lineas?.map((l: any, i: number) => (
              <tr key={l.id ?? i}>
                <td style={{ color: '#999' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{l.productos?.codigo ?? '—'}</td>
                <td style={{ fontWeight: 500 }}>{l.productos?.nombre ?? '—'}</td>
                <td className="text-center">{l.cantidad} {l.unidades?.abreviatura ?? ''}</td>
                <td className="text-right">$ {(l.precio_unitario ?? 0).toFixed(2)}</td>
                <td className="text-right">$ {((l.cantidad ?? 0) * (l.precio_unitario ?? 0)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals">
          <div className="totals-box">
            <div className="total-row"><span>Subtotal</span><span>$ {(entrega.subtotal ?? 0).toFixed(2)}</span></div>
            {(entrega.iva_total ?? 0) > 0 && <div className="total-row"><span>IVA</span><span>$ {(entrega.iva_total ?? 0).toFixed(2)}</span></div>}
            {(entrega.ieps_total ?? 0) > 0 && <div className="total-row"><span>IEPS</span><span>$ {(entrega.ieps_total ?? 0).toFixed(2)}</span></div>}
            <div className="total-row grand"><span>Total</span><span>$ {(entrega.total ?? 0).toFixed(2)}</span></div>
          </div>
        </div>

        <div className="footer">
          <div><div className="sign-line">Entregó</div></div>
          <div><div className="sign-line">Recibió</div></div>
        </div>

        {(empresaConfig as any)?.notas_ticket && (
          <div style={{ marginTop: '24px', padding: '8px 12px', background: '#f9f9f9', borderRadius: '4px', fontSize: '10px', color: '#888', textAlign: 'center' }}>
            {(empresaConfig as any).notas_ticket}
          </div>
        )}

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '9px', color: '#bbb' }}>
          Elaborado por Uniline — Innovación en la nube
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────── */

export default function EntregasPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reasignDialog, setReasignDialog] = useState<any>(null);
  const [newVendedorId, setNewVendedorId] = useState('');

  const { data: entregas, isLoading } = useEntregas(search, vendedorFilter, statusFilter);
  const { data: vendedores } = useVendedoresList();

  const marcarEntregado = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ status: 'entregado' as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entrega marcada como completada');
      qc.invalidateQueries({ queryKey: ['entregas'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['demanda'] });
    },
  });

  const cambiarRuta = useMutation({
    mutationFn: async ({ id, vendedorId }: { id: string; vendedorId: string }) => {
      const { error } = await supabase.from('ventas').update({ vendedor_id: vendedorId } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ruta reasignada');
      qc.invalidateQueries({ queryKey: ['entregas'] });
      setReasignDialog(null);
      setNewVendedorId('');
    },
  });

  // Group by vendedor
  const grouped = useMemo(() => {
    if (!entregas) return [];
    const map = new Map<string, { vendedorId: string; vendedor: string; entregas: typeof entregas }>();
    for (const e of entregas) {
      const vid = (e as any).vendedor_id ?? 'sin-asignar';
      const vname = (e as any).vendedores?.nombre ?? 'Sin asignar';
      if (!map.has(vid)) map.set(vid, { vendedorId: vid, vendedor: vname, entregas: [] });
      map.get(vid)!.entregas.push(e);
    }
    return Array.from(map.values());
  }, [entregas]);

  const totalEntregas = entregas?.length ?? 0;
  const pendientes = entregas?.filter(e => e.status === 'confirmado').length ?? 0;
  const completadas = entregas?.filter(e => e.status === 'entregado').length ?? 0;
  const totalMonto = entregas?.reduce((s, e) => s + ((e as any).total ?? 0), 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5" /> Entregas
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-foreground">{totalEntregas}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Por entregar</p>
          <p className="text-2xl font-bold text-warning">{pendientes}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Entregadas</p>
          <p className="text-2xl font-bold text-success">{completadas}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Monto total</p>
          <p className="text-2xl font-bold text-primary">$ {totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por folio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Ruta</label>
          <select className="border border-input rounded-md px-3 py-2 text-sm bg-background min-w-[180px]" value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)}>
            <option value="todos">Todas las rutas</option>
            {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
          <select className="border border-input rounded-md px-3 py-2 text-sm bg-background min-w-[150px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="confirmado">Por entregar</option>
            <option value="entregado">Entregadas</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando...</p>}

      {/* Grouped by vendedor */}
      {grouped.map(group => (
        <div key={group.vendedorId} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-semibold text-foreground">{group.vendedor}</span>
            <Badge variant="secondary" className="text-[10px] ml-auto">
              {group.entregas.filter(e => e.status === 'confirmado').length} pendientes
            </Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] w-8"></TableHead>
                <TableHead className="text-[11px]">Folio</TableHead>
                <TableHead className="text-[11px]">Cliente</TableHead>
                <TableHead className="text-[11px]">Fecha</TableHead>
                <TableHead className="text-[11px]">F. entrega</TableHead>
                <TableHead className="text-[11px] text-center">Status</TableHead>
                <TableHead className="text-[11px] text-center">Líneas</TableHead>
                <TableHead className="text-[11px] text-right">Total</TableHead>
                <TableHead className="text-[11px] w-40"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.entregas.map((e: any) => {
                const isExpanded = expandedId === e.id;
                return (
                  <React.Fragment key={e.id}>
                    <TableRow
                      className={cn("cursor-pointer hover:bg-accent/50 transition-colors", isExpanded && "bg-accent/30")}
                      onClick={() => setExpandedId(isExpanded ? null : e.id)}
                    >
                      <TableCell className="py-2">
                        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                      </TableCell>
                      <TableCell className="font-mono text-[11px] font-bold py-2">{e.folio}</TableCell>
                      <TableCell className="text-[12px] font-medium py-2">{e.clientes?.nombre ?? '—'}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground py-2">{fmtDate(e.fecha)}</TableCell>
                      <TableCell className="text-[12px] font-medium py-2">{e.fecha_entrega ? fmtDate(e.fecha_entrega) : '—'}</TableCell>
                      <TableCell className="text-center py-2">
                        {e.status === 'confirmado' ? (
                          <Badge variant="outline" className="text-[10px] border-warning text-warning">
                            <Clock className="h-3 w-3 mr-1" /> Por entregar
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-success text-success-foreground">
                            <Check className="h-3 w-3 mr-1" /> Entregado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-[12px] text-muted-foreground py-2">
                        {e.venta_lineas?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-[12px] font-medium py-2">
                        $ {(e.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="py-2" onClick={ev => ev.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <PrintDocument entrega={e} empresa={empresa} />
                          {e.status === 'confirmado' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-[11px] h-7"
                                onClick={() => { setReasignDialog(e); setNewVendedorId(e.vendedor_id ?? ''); }}
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                className="text-[11px] h-7"
                                onClick={() => marcarEntregado.mutate(e.id)}
                                disabled={marcarEntregado.isPending}
                              >
                                <Check className="h-3 w-3 mr-1" /> Entregar
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-0 bg-muted/20">
                          <div className="px-8 py-4">
                            {/* Client info */}
                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Cliente</p>
                                <p className="text-[13px] font-semibold text-foreground">{e.clientes?.nombre}</p>
                                {e.clientes?.direccion && <p className="text-[11px] text-muted-foreground">{e.clientes.direccion}{e.clientes.colonia ? `, ${e.clientes.colonia}` : ''}</p>}
                                {e.clientes?.telefono && <p className="text-[11px] text-muted-foreground">Tel: {e.clientes.telefono}</p>}
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Ruta / vendedor</p>
                                <p className="text-[13px] font-semibold text-foreground">{e.vendedores?.nombre ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Condición de pago</p>
                                <p className="text-[13px] font-semibold text-foreground capitalize">{e.condicion_pago}</p>
                              </div>
                            </div>

                            {/* Products table */}
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10px] w-10">#</TableHead>
                                  <TableHead className="text-[10px]">Código</TableHead>
                                  <TableHead className="text-[10px]">Producto</TableHead>
                                  <TableHead className="text-[10px] text-center">Cantidad</TableHead>
                                  <TableHead className="text-[10px] text-right">P. unitario</TableHead>
                                  <TableHead className="text-[10px] text-right">Subtotal</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {e.venta_lineas?.map((l: any, i: number) => (
                                  <TableRow key={l.id ?? i}>
                                    <TableCell className="text-[11px] text-muted-foreground py-1.5">{i + 1}</TableCell>
                                    <TableCell className="text-[11px] font-mono text-muted-foreground py-1.5">{l.productos?.codigo ?? '—'}</TableCell>
                                    <TableCell className="text-[12px] font-medium py-1.5">{l.productos?.nombre ?? '—'}</TableCell>
                                    <TableCell className="text-center text-[12px] py-1.5">{l.cantidad} {l.unidades?.abreviatura ?? ''}</TableCell>
                                    <TableCell className="text-right text-[12px] py-1.5">$ {(l.precio_unitario ?? 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right text-[12px] font-medium py-1.5">$ {((l.cantidad ?? 0) * (l.precio_unitario ?? 0)).toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>

                            {/* Totals */}
                            <div className="flex justify-end mt-3">
                              <div className="w-64 space-y-1">
                                <div className="flex justify-between text-[12px] text-muted-foreground">
                                  <span>Subtotal</span>
                                  <span>$ {(e.subtotal ?? 0).toFixed(2)}</span>
                                </div>
                                {(e.iva_total ?? 0) > 0 && (
                                  <div className="flex justify-between text-[12px] text-muted-foreground">
                                    <span>IVA</span>
                                    <span>$ {(e.iva_total ?? 0).toFixed(2)}</span>
                                  </div>
                                )}
                                {(e.ieps_total ?? 0) > 0 && (
                                  <div className="flex justify-between text-[12px] text-muted-foreground">
                                    <span>IEPS</span>
                                    <span>$ {(e.ieps_total ?? 0).toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-[14px] font-bold text-foreground border-t border-border pt-1.5">
                                  <span>Total</span>
                                  <span>$ {(e.total ?? 0).toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}

      {!isLoading && totalEntregas === 0 && (
        <div className="text-center text-muted-foreground py-12">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No hay entregas registradas
        </div>
      )}

      {/* Reasign dialog */}
      <Dialog open={!!reasignDialog} onOpenChange={open => { if (!open) setReasignDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Reasignar ruta</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground mb-3">
            Entrega <strong>{reasignDialog?.folio}</strong> — {reasignDialog?.clientes?.nombre}
          </p>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Nueva ruta / vendedor</label>
            <select
              className="border border-input rounded-md px-3 py-2 text-sm bg-background w-full"
              value={newVendedorId}
              onChange={e => setNewVendedorId(e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setReasignDialog(null)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!newVendedorId || cambiarRuta.isPending}
              onClick={() => reasignDialog && cambiarRuta.mutate({ id: reasignDialog.id, vendedorId: newVendedorId })}
            >
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Reasignar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
