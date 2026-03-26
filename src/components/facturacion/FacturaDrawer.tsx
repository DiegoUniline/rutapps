import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
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

  const pendientes = useMemo(() => lineas.filter(l => l.producto_id && !l.facturado), [lineas]);
  const facturadas = useMemo(() => lineas.filter(l => l.producto_id && l.facturado), [lineas]);

  // Initialize selection with all pending
  useState(() => {
    setSelected(new Set(pendientes.map(l => l.id)));
  });

  const toggleLine = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === pendientes.length) setSelected(new Set());
    else setSelected(new Set(pendientes.map(l => l.id)));
  };

  const selectedLines = pendientes.filter(l => selected.has(l.id));
  const totalSelected = selectedLines.reduce((s, l) => s + (l.total ?? 0), 0);
  const totalFacturado = facturadas.reduce((s, l) => s + (l.total ?? 0), 0);
  const totalVenta = lineas.filter(l => l.producto_id).reduce((s, l) => s + (l.total ?? 0), 0);

  const { fmt } = useCurrency();

  // Create CFDI borrador and navigate to form
  const handleCrearBorrador = async () => {
    if (selectedLines.length === 0) { toast.error('Selecciona al menos una línea'); return; }
    if (!empresa || !user) return;

    setCreating(true);
    try {
      // Create CFDI record as borrador
      const subtotal = selectedLines.reduce((s, l) => s + (l.subtotal ?? 0), 0);
      const ivaTotal = selectedLines.reduce((s, l) => s + (l.iva_monto ?? 0), 0);
      const iepsTotal = selectedLines.reduce((s, l) => s + (l.ieps_monto ?? 0), 0);

      const { data: cfdi, error: cfdiErr } = await supabase.from('cfdis').insert({
        empresa_id: empresa.id,
        venta_id: ventaId,
        status: 'borrador',
        user_id: user.id,
        receiver_rfc: cliente.facturama_rfc || cliente.rfc || '',
        receiver_name: cliente.facturama_razon_social || cliente.nombre || '',
        receiver_cfdi_use: cliente.facturama_uso_cfdi || 'G03',
        receiver_fiscal_regime: cliente.facturama_regimen_fiscal || '601',
        receiver_tax_zip_code: cliente.facturama_cp || '',
        payment_form: '01',
        payment_method: 'PUE',
        expedition_place: empresa.cp || '',
        subtotal: Math.round(subtotal * 100) / 100,
        iva_total: Math.round(ivaTotal * 100) / 100,
        ieps_total: Math.round(iepsTotal * 100) / 100,
        total: Math.round(totalSelected * 100) / 100,
        cfdi_type: 'I',
        currency: 'MXN',
        serie: 'A',
      }).select('id').single();

      if (cfdiErr) throw cfdiErr;

      // Create CFDI lines
      const cfdiLineas = selectedLines.map(l => {
        const prod = productosList?.find((p: any) => p.id === l.producto_id);
        return {
          cfdi_id: cfdi.id,
          venta_linea_id: l.id,
          producto_id: l.producto_id,
          descripcion: prod?.nombre || l.descripcion || 'Producto',
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          subtotal: l.subtotal ?? 0,
          iva_pct: l.iva_pct ?? 0,
          ieps_pct: l.ieps_pct ?? 0,
          iva_monto: l.iva_monto ?? 0,
          ieps_monto: l.ieps_monto ?? 0,
          total: l.total ?? 0,
          product_code: prod?.codigo_sat || '01010101',
          unit_code: 'H87',
          unit_name: 'Pieza',
        };
      });

      const { error: linErr } = await supabase.from('cfdi_lineas').insert(cfdiLineas);
      if (linErr) throw linErr;

      toast.success('Borrador de factura creado');
      queryClient.invalidateQueries({ queryKey: ['cfdis'] });
      onClose();
      navigate(`/facturacion-cfdi/${cfdi.id}`);
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
                    <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-16">Cant</th>
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
                        <td className="py-1.5 px-2 text-right">{l.cantidad}</td>
                        <td className="py-1.5 px-2 text-right">{fmt(l.precio_unitario)}</td>
                        <td className="py-1.5 px-2 text-right font-medium">{fmt(l.total)}</td>
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
