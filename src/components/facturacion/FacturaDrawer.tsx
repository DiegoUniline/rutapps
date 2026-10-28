import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { VentaLinea, Cliente } from '@/types';

interface FacturaDrawerProps {
  open: boolean;
  onClose: () => void;
  ventaId: string;
  cliente: Cliente;
  lineas: VentaLinea[];
  productosList: any[];
}

export function FacturaDrawer({ open, onClose, ventaId, cliente, lineas, productosList }: FacturaDrawerProps) {
  const { empresa, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [monto, setMonto] = useState('');

  // Cantidad ya ocupada por facturas (en proceso, inciertas o vigentes) de cada línea (D-015).
  const lineaIds = useMemo(() => lineas.filter(l => l.producto_id).map(l => l.id), [lineas]);
  const { data: ocupada } = useQuery({
    queryKey: ['venta-cantidad-facturada', ventaId, lineaIds.join(',')],
    enabled: open && lineaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('cfdi_lineas')
        .select('venta_linea_id, cantidad, cfdis!inner(status)').in('venta_linea_id', lineaIds);
      if (error) throw error;
      const ocupa = ['timbrando', 'incierto', 'timbrado', 'cancelacion_pendiente', 'cancelacion_rechazada'];
      const vigente = ['timbrado', 'cancelacion_pendiente', 'cancelacion_rechazada'];
      const m: Record<string, number> = {};
      const conVigente = new Set<string>();
      for (const x of (data ?? []) as any[]) {
        if (vigente.includes(x.cfdis?.status)) conVigente.add(x.venta_linea_id);
        if (ocupa.includes(x.cfdis?.status)) m[x.venta_linea_id] = (m[x.venta_linea_id] ?? 0) + (Number(x.cantidad) || 0);
      }
      // Marcas anteriores sin factura vigente que las explique: línea completa.
      for (const l of lineas) if ((l.facturado || (l as any).facturado_global) && !conVigente.has(l.id)) m[l.id] = Number(l.cantidad) || 0;
      return m;
    },
  });
  const disponible = (l: VentaLinea) => Math.max(0, (Number(l.cantidad) || 0) - (ocupada?.[l.id] ?? 0));
  const unitario = (l: VentaLinea) => (Number(l.cantidad) > 0 ? (Number(l.total) || 0) / Number(l.cantidad) : 0);

  const pendientes = useMemo(() => lineas.filter(l => l.producto_id && disponible(l) > 0.000001), [lineas, ocupada]);
  const totalVenta = lineas.filter(l => l.producto_id).reduce((s, l) => s + (l.total ?? 0), 0);
  const totalFacturado = lineas.filter(l => l.producto_id).reduce((s, l) => s + unitario(l) * Math.min(Number(l.cantidad) || 0, ocupada?.[l.id] ?? 0), 0);

  // Al abrir: todo lo pendiente seleccionado con su cantidad disponible.
  useEffect(() => {
    if (!ocupada && lineaIds.length > 0) return;
    setSelected(new Set(pendientes.map(l => l.id)));
    setCantidades(Object.fromEntries(pendientes.map(l => [l.id, disponible(l)])));
  }, [ocupada, open]);

  const toggleLine = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === pendientes.length) setSelected(new Set());
    else setSelected(new Set(pendientes.map(l => l.id)));
  };

  const setCantidad = (l: VentaLinea, v: string) => {
    const n = Math.max(0, Math.min(disponible(l), Number(v) || 0));
    setCantidades(c => ({ ...c, [l.id]: n }));
  };

  // Por monto: llena las líneas en orden hasta llegar al monto (con impuestos); se puede ajustar después.
  const llenarPorMonto = () => {
    let resta = Number(monto) || 0;
    if (resta <= 0) { toast.error('Escribe el monto de la factura'); return; }
    const sel = new Set<string>();
    const cant: Record<string, number> = {};
    for (const l of pendientes) {
      const u = unitario(l);
      if (resta <= 0.005 || u <= 0) { cant[l.id] = 0; continue; }
      const q = Math.min(disponible(l), Math.floor((resta / u) * 1000) / 1000);
      cant[l.id] = q;
      if (q > 0) { sel.add(l.id); resta -= q * u; }
    }
    setCantidades(cant);
    setSelected(sel);
  };

  const selectedLines = pendientes.filter(l => selected.has(l.id) && (cantidades[l.id] ?? 0) > 0);
  const totalSelected = selectedLines.reduce((s, l) => s + unitario(l) * (cantidades[l.id] ?? 0), 0);

  const { fmt } = useCurrency();

  // Create CFDI borrador and navigate to form
  const handleCrearBorrador = async () => {
    if (selectedLines.length === 0) { toast.error('Selecciona al menos una línea'); return; }
    if (!empresa || !user) return;

    setCreating(true);
    try {
      // El servidor arma el borrador con las cantidades elegidas y la ficha fiscal del cliente (D-015).
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'crear_borrador_venta', empresa_id: empresa.id, venta_id: ventaId,
          cantidades: Object.fromEntries(selectedLines.map(l => [l.id, cantidades[l.id]])),
          payment_form: '01', payment_method: 'PUE',
        },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sin cuerpo */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      const cfdi = { id: data.cfdi_id as string };

      toast.success('Borrador de factura creado');
      queryClient.invalidateQueries({ queryKey: ['cfdis'] });
      onClose();
      navigate(`/facturacion-cfdi/${cfdi.id}`, { state: { returnTo: `/ventas/${ventaId}` } });
    } catch (e: any) {
      toast.error(e.message || 'Error al crear borrador');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Crear Factura
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Header info */}
          <div className="bg-card rounded-lg p-3 space-y-1 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium">{cliente.facturama_razon_social || cliente.nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RFC</span>
              <span className="font-mono text-xs">{cliente.facturama_rfc || cliente.rfc || '—'}</span>
            </div>
            <div className="border-t border-border my-1" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total venta</span>
              <span>{fmt(totalVenta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ya facturado</span>
              <span className="text-primary">{fmt(totalFacturado)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Pendiente</span>
              <span>{fmt(totalVenta - totalFacturado)}</span>
            </div>
          </div>

          {/* Por monto */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground">Facturar por monto (con impuestos)</label>
              <Input type="number" min={0} step="any" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Ej. 2000" className="h-8" />
            </div>
            <Button variant="outline" size="sm" onClick={llenarPorMonto}>Llenar cantidades</Button>
          </div>

          {/* Lines table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-semibold">Líneas pendientes</h3>
              <Badge variant="secondary" className="text-xs">{selectedLines.length}/{pendientes.length} seleccionadas</Badge>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-card border-b">
                    <th className="py-2 px-2 w-8">
                      <Checkbox checked={selected.size === pendientes.length && pendientes.length > 0} onCheckedChange={toggleAll} />
                    </th>
                    <th className="py-2 px-2 text-left text-[11px] font-medium text-muted-foreground">Producto</th>
                    <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-24">Cant. a facturar</th>
                    <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-24">P.Unit</th>
                    <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map(l => {
                    const prod = productosList?.find((p: any) => p.id === l.producto_id);
                    return (
                      <tr key={l.id} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-1.5 px-2">
                          <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggleLine(l.id)} />
                        </td>
                        <td className="py-1.5 px-2 text-[12px]">{prod?.nombre || l.descripcion}</td>
                        <td className="py-1.5 px-2 text-right">
                          <Input type="number" min={0} max={disponible(l)} step="any" value={cantidades[l.id] ?? 0}
                            onChange={e => setCantidad(l, e.target.value)} className="h-7 w-20 ml-auto text-right text-[12px]" />
                          <span className="text-[10px] text-muted-foreground">de {disponible(l)}</span>
                        </td>
                        <td className="py-1.5 px-2 text-right">{fmt(l.precio_unitario)}</td>
                        <td className="py-1.5 px-2 text-right font-medium">{fmt(unitario(l) * (cantidades[l.id] ?? 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-card">
                    <td colSpan={4} className="py-2 px-2 text-right font-semibold text-[12px]">Total seleccionado</td>
                    <td className="py-2 px-2 text-right font-bold">{fmt(totalSelected)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button onClick={handleCrearBorrador} disabled={creating || selectedLines.length === 0} className="flex-1 gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {creating ? 'Creando...' : `Crear Factura (${fmt(totalSelected)})`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={creating}>Cancelar</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
