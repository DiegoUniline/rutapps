import { Link } from 'react-router-dom';
import { Check, Package } from 'lucide-react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VentaLinea } from '@/types';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
}

interface EntregaData {
  id: string;
  folio?: string;
  status: string;
  entrega_lineas?: { producto_id: string; cantidad_entregada: number }[];
}

interface RemainingItem {
  producto_id: string;
  cantidad_pendiente: number;
}

interface VentaEntregasTabProps {
  lineas: Partial<VentaLinea>[];
  productosList: Producto[];
  entregasExistentes: EntregaData[];
  entregasActivas: EntregaData[];
  lineDeliverySummary: Record<string, number>;
  canCreateEntrega: boolean;
  fullyDelivered: boolean;
  remaining: RemainingItem[] | null;
  isCreatingEntrega: boolean;
  isMobile: boolean;
  onCreateEntrega: (lineas: { producto_id: string; cantidad_pedida: number }[]) => void;
}

const STATUS_COLOR: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  surtido: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  asignado: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  cargado: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  en_ruta: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  hecho: 'bg-primary/10 text-primary',
  cancelado: 'bg-destructive/10 text-destructive',
};

export function VentaEntregasTab({
  lineas, productosList, entregasExistentes, entregasActivas,
  lineDeliverySummary, canCreateEntrega, fullyDelivered,
  remaining, isCreatingEntrega, isMobile, onCreateEntrega,
}: VentaEntregasTabProps) {
  const productLineas = lineas.filter(l => l.producto_id);

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* Per-line delivery summary */}
      {productLineas.length > 0 && (
        <div>
          <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Resumen por producto</h4>
          {isMobile ? (
            <div className="space-y-2">
              {productLineas.map((l, idx) => {
                const prod = productosList.find(p => p.id === l.producto_id);
                const pedida = Number(l.cantidad) || 0;
                const surtida = lineDeliverySummary[l.producto_id!] ?? 0;
                const faltante = Math.max(0, pedida - surtida);
                return (
                  <div key={idx} className={cn("border border-border rounded-lg p-3 bg-card", faltante > 0 && "border-warning/50")}>
                    <div className="text-sm font-medium truncate">{prod ? `${prod.codigo} · ${prod.nombre}` : l.producto_id}</div>
                    <div className="grid grid-cols-3 gap-2 mt-1 text-xs">
                      <div><span className="text-muted-foreground">Pedida: </span><span className="font-medium">{pedida}</span></div>
                      <div><span className="text-muted-foreground">Surtida: </span><span className="font-medium text-primary">{surtida}</span></div>
                      <div>
                        <span className="text-muted-foreground">Faltante: </span>
                        {faltante > 0 ? <span className="font-bold text-destructive">{faltante}</span> : <Check className="h-3.5 w-3.5 inline text-primary" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-table-border text-left">
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Producto</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right w-20">Pedida</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right w-20">Surtida</th>
                  <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right w-20">Faltante</th>
                </tr>
              </thead>
              <tbody>
                {productLineas.map((l, idx) => {
                  const prod = productosList.find(p => p.id === l.producto_id);
                  const pedida = Number(l.cantidad) || 0;
                  const surtida = lineDeliverySummary[l.producto_id!] ?? 0;
                  const faltante = Math.max(0, pedida - surtida);
                  return (
                    <tr key={idx} className={cn("border-b border-table-border", faltante > 0 && "bg-warning/5")}>
                      <td className="py-1.5 px-2 text-[12px]">{prod ? `${prod.codigo} · ${prod.nombre}` : l.producto_id}</td>
                      <td className="py-1.5 px-2 text-right text-[12px]">{pedida}</td>
                      <td className="py-1.5 px-2 text-right text-[12px] font-medium text-primary">{surtida}</td>
                      <td className={cn("py-1.5 px-2 text-right text-[12px] font-bold", faltante > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {faltante > 0 ? faltante : <Check className="h-3.5 w-3.5 inline text-primary" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Entregas list */}
      <div>
        <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Entregas creadas</h4>
        {entregasActivas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay entregas creadas para este pedido</p>
        ) : isMobile ? (
          <div className="space-y-2">
            {entregasExistentes.map(e => {
              const isCancelled = e.status === 'cancelado';
              return (
                <Link key={e.id} to={`/logistica/entregas/${e.id}`} className={cn("block border border-border rounded-lg p-3 bg-card", isCancelled && "opacity-50")}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-primary">{e.folio ?? e.id.slice(0, 8)}</span>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[e.status] ?? 'bg-muted text-muted-foreground')}>
                      {e.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{(e.entrega_lineas ?? []).length} líneas</div>
                </Link>
              );
            })}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-table-border text-left">
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Folio</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Estado</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] text-right">Productos</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entregasExistentes.map(e => {
                const isCancelled = e.status === 'cancelado';
                return (
                  <tr key={e.id} className={cn("border-b border-table-border hover:bg-accent/30", isCancelled && "opacity-50")}>
                    <td className="py-1.5 px-2">
                      <Link to={`/logistica/entregas/${e.id}`} className="text-primary hover:underline font-mono text-[12px] font-bold">
                        {e.folio ?? e.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-1.5 px-2">
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[e.status] ?? 'bg-muted text-muted-foreground')}>
                        {e.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-[12px] text-muted-foreground">
                      {(e.entrega_lineas ?? []).length} líneas
                    </td>
                    <td className="py-1.5 px-2">
                      <Link to={`/logistica/entregas/${e.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {canCreateEntrega && remaining && remaining.length > 0 && (
        <Button size="sm" onClick={() => onCreateEntrega(remaining.map(r => ({ producto_id: r.producto_id, cantidad_pedida: r.cantidad_pendiente })))} disabled={isCreatingEntrega}>
          <Package className="h-3.5 w-3.5" /> Crear entrega con faltante
        </Button>
      )}

      {fullyDelivered && (
        <div className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          Pedido completamente surtido
        </div>
      )}
    </div>
  );
}
