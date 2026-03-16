import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Download, Mail, FileText } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { fmtDate } from '@/lib/utils';

interface CfdiHistoryProps {
  ventaId: string;
  lineas: any[];
  productosList: any[];
}

export function CfdiHistory({ ventaId, lineas, productosList }: CfdiHistoryProps) {
  const navigate = useNavigate();
  // Get unique cfdi_ids from facturado lines
  const cfdiIds = [...new Set(lineas.filter(l => l.facturado && l.factura_cfdi_id).map(l => l.factura_cfdi_id))];

  const { data: cfdis } = useQuery({
    queryKey: ['cfdis-venta', ventaId],
    enabled: cfdiIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('cfdis')
        .select('*, cfdi_lineas(id)')
        .eq('venta_id', ventaId)
        .order('created_at', { ascending: false });
      // Only show CFDIs that are timbrado/cancelado OR have lines
      return (data ?? []).filter((c: any) =>
        c.status === 'timbrado' || c.status === 'cancelado' || (c.cfdi_lineas && c.cfdi_lineas.length > 0)
      );
    },
  });

  if (!cfdis || cfdis.length === 0) return null;

  const fmt = (v: number) => `$${(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-3">
      <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Facturas emitidas</h4>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-table-border text-left">
            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">CFDI</th>
            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Líneas</th>
            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right">Total</th>
            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Fecha</th>
            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Estado</th>
            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {cfdis.map((cfdi: any) => {
            const cfdiLineas = lineas.filter(l => l.factura_cfdi_id === cfdi.id);
            const lineasDesc = cfdiLineas.map(l => {
              const prod = productosList?.find((p: any) => p.id === l.producto_id);
              return `${prod?.nombre || 'Producto'} (x${l.cantidad})`;
            }).join(', ');

            return (
              <tr key={cfdi.id} className="border-b border-table-border hover:bg-table-hover cursor-pointer" onClick={() => navigate(`/facturacion-cfdi/${cfdi.id}`)}>
                <td className="py-1.5 px-2">
                  <div>
                    <span className="font-mono text-xs font-medium">{cfdi.serie}{cfdi.folio || cfdi.id.slice(0, 6)}</span>
                    {cfdi.folio_fiscal && (
                      <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">{cfdi.folio_fiscal}</span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 px-2 text-[11px] text-muted-foreground max-w-[200px] truncate">{lineasDesc || `${cfdiLineas.length} líneas`}</td>
                <td className="py-1.5 px-2 text-right font-medium">{fmt(cfdi.total)}</td>
                <td className="py-1.5 px-2 text-muted-foreground text-[12px]">{fmtDate(cfdi.created_at)}</td>
                <td className="py-1.5 px-2">
                  <StatusChip status={cfdi.status === 'timbrado' ? 'confirmado' : cfdi.status === 'cancelado' ? 'cancelado' : 'borrador'} />
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1">
                    {cfdi.pdf_url && (
                      <a href={cfdi.pdf_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[11px] font-medium">PDF</a>
                    )}
                    {cfdi.xml_url && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <a href={cfdi.xml_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[11px] font-medium">XML</a>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
