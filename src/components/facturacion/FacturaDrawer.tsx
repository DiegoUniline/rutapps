import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Download, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const { empresa } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formaPago, setFormaPago] = useState('99');
  const [metodoPago, setMetodoPago] = useState('PUE');
  const [usoCfdi, setUsoCfdi] = useState(cliente.facturama_uso_cfdi || 'G03');
  const [timbring, setTimbring] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Filter pending lines
  const pendientes = useMemo(() => lineas.filter(l => l.producto_id && !l.facturado), [lineas]);
  const facturadas = useMemo(() => lineas.filter(l => l.producto_id && l.facturado), [lineas]);

  // Initialize selection with all pending
  useState(() => {
    setSelected(new Set(pendientes.map(l => l.id)));
  });

  // Catalogs from local DB
  const { data: formasPago } = useQuery({
    queryKey: ['cat_forma_pago'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_forma_pago').select('clave, descripcion').eq('activo', true).order('clave');
      return data ?? [];
    },
  });

  const { data: metodosPago } = useQuery({
    queryKey: ['cat_metodo_pago'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_metodo_pago').select('clave, descripcion').eq('activo', true).order('clave');
      return data ?? [];
    },
  });

  const { data: usosCfdi } = useQuery({
    queryKey: ['cat_uso_cfdi'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_uso_cfdi').select('clave, descripcion').eq('activo', true).order('clave');
      return data ?? [];
    },
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
  const subtotalSelected = selectedLines.reduce((s, l) => s + (l.subtotal ?? 0), 0);
  const ivaSelected = selectedLines.reduce((s, l) => s + (l.iva_monto ?? 0), 0);
  const iepsSelected = selectedLines.reduce((s, l) => s + (l.ieps_monto ?? 0), 0);
  const totalSelected = selectedLines.reduce((s, l) => s + (l.total ?? 0), 0);
  const totalFacturado = facturadas.reduce((s, l) => s + (l.total ?? 0), 0);
  const totalVenta = lineas.filter(l => l.producto_id).reduce((s, l) => s + (l.total ?? 0), 0);

  const fmt = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleTimbrar = async () => {
    if (selectedLines.length === 0) { toast.error('Selecciona al menos una línea'); return; }
    if (!empresa?.rfc || !empresa?.regimen_fiscal || !empresa?.cp) {
      toast.error('Configura los datos fiscales del emisor en Configuración'); return;
    }

    setTimbring(true);
    try {
      const items = selectedLines.map(l => {
        const prod = productosList?.find((p: any) => p.id === l.producto_id);
        return {
          product_code: prod?.codigo_sat || '01010101',
          description: prod?.nombre || l.descripcion || 'Producto',
          unit: 'Pieza',
          unit_code: 'H87',
          unit_price: l.precio_unitario,
          quantity: l.cantidad,
          iva_rate: (l.iva_pct ?? 0) > 0 ? (l.iva_pct / 100) : 0,
          ieps_rate: (l.ieps_pct ?? 0) > 0 ? (l.ieps_pct / 100) : 0,
        };
      });

      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'timbrar',
          venta_id: ventaId,
          empresa_id: empresa.id,
          issuer: {
            rfc: empresa.rfc,
            name: empresa.razon_social || empresa.nombre,
            fiscal_regime: empresa.regimen_fiscal,
          },
          receiver: {
            rfc: cliente.facturama_rfc,
            name: cliente.facturama_razon_social,
            cfdi_use: usoCfdi,
            fiscal_regime: cliente.facturama_regimen_fiscal,
            tax_zip_code: cliente.facturama_cp,
          },
          items,
          cfdi_type: 'I',
          currency: 'MXN',
          payment_form: formaPago,
          payment_method: metodoPago,
          expedition_place: empresa.cp,
          serie: 'A',
          folio: '',
          name_id: '1',
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Mark lines as facturado
      const cfdiId = data.cfdi?.id;
      if (cfdiId) {
        for (const l of selectedLines) {
          await supabase.from('venta_lineas').update({ facturado: true, factura_cfdi_id: cfdiId }).eq('id', l.id);
        }
      }

      setResult(data);
      toast.success('¡Factura timbrada exitosamente!');
      queryClient.invalidateQueries({ queryKey: ['venta'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
    } catch (e: any) {
      toast.error(e.message || 'Error al timbrar');
    } finally {
      setTimbring(false);
    }
  };

  const handleSendEmail = async () => {
    if (!result?.facturama_id || !cliente.facturama_correo_facturacion) return;
    try {
      const { error } = await supabase.functions.invoke('facturama', {
        body: { action: 'enviar_email', facturama_id: result.facturama_id, email: cliente.facturama_correo_facturacion },
      });
      if (error) throw error;
      toast.success('Factura enviada por email');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Success view
  if (result) {
    return (
      <Sheet open={open} onOpenChange={() => { setResult(null); onClose(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-primary">
              <FileText className="h-5 w-5" /> Factura Generada
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Folio Fiscal</span>
                <span className="font-mono text-xs">{result.folio_fiscal || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{fmt(result.total ?? 0)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {result.pdf_url && (
                <a href={result.pdf_url} target="_blank" rel="noopener noreferrer" className="btn-odoo-primary text-center flex items-center justify-center gap-2">
                  <Download className="h-4 w-4" /> Descargar PDF
                </a>
              )}
              {result.xml_url && (
                <a href={result.xml_url} target="_blank" rel="noopener noreferrer" className="btn-odoo-secondary text-center flex items-center justify-center gap-2">
                  <Download className="h-4 w-4" /> Descargar XML
                </a>
              )}
              {cliente.facturama_correo_facturacion && (
                <Button variant="outline" onClick={handleSendEmail} className="gap-2">
                  <Mail className="h-4 w-4" /> Enviar por Email
                </Button>
              )}
            </div>

            <Button variant="ghost" className="w-full" onClick={() => { setResult(null); onClose(); }}>
              Cerrar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Generar Factura
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Header info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium">{cliente.facturama_razon_social || cliente.nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RFC</span>
              <span className="font-mono text-xs">{cliente.facturama_rfc || '—'}</span>
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
                  <tr className="bg-muted/50 border-b">
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
                      <tr key={l.id} className="border-b border-border/50 hover:bg-muted/20">
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
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-2 px-2 text-right font-semibold text-[12px]">Total seleccionado</td>
                    <td className="py-2 px-2 text-right font-bold">{fmt(totalSelected)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* CFDI fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label-odoo">Forma de Pago</label>
              <select className="input-odoo text-[12px]" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
                {(formasPago ?? []).map(fp => (
                  <option key={fp.clave} value={fp.clave}>{fp.clave} - {fp.descripcion}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-odoo">Método de Pago</label>
              <select className="input-odoo text-[12px]" value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                {(metodosPago ?? []).map(mp => (
                  <option key={mp.clave} value={mp.clave}>{mp.clave} - {mp.descripcion}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-odoo">Uso CFDI</label>
              <select className="input-odoo text-[12px]" value={usoCfdi} onChange={e => setUsoCfdi(e.target.value)}>
                {(usosCfdi ?? []).map(u => (
                  <option key={u.clave} value={u.clave}>{u.clave} - {u.descripcion}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button onClick={handleTimbrar} disabled={timbring || selectedLines.length === 0} className="flex-1 gap-2">
              {timbring ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {timbring ? 'Timbrando...' : `Timbrar Factura (${fmt(totalSelected)})`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={timbring}>Cancelar</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
