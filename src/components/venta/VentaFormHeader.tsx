import { ArrowLeft, Save, Trash2, Check, Truck, FileText, Receipt, Printer, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusVenta } from '@/types';

interface Entrega {
  id: string;
  folio?: string;
  status: string;
}

interface VentaFormHeaderProps {
  isNew: boolean;
  folio?: string;
  clienteNombre?: string;
  status?: string;
  entregaInmediata?: boolean;
  tipo?: string;
  requiereFactura?: boolean;
  readOnly: boolean;
  canCreateEntrega: boolean;
  hayEntregas: boolean;
  entregasExistentes: Entrega[];
  lineasPendientesFactura: number;
  isSaving: boolean;
  isCreatingEntrega: boolean;
  onBack: () => void;
  onSave: (autoConfirm?: boolean) => void;
  onDelete: () => void;
  onStatusChange: (status: StatusVenta) => void;
  onCreateEntrega: () => void;
  onNavigateEntrega: (id: string) => void;
  onGenerarPdf: () => void;
  onPrintTicket?: () => void;
  onFacturar: () => void;
}

export function VentaFormHeader({
  isNew, folio, clienteNombre, status, entregaInmediata, tipo,
  requiereFactura, readOnly, canCreateEntrega, hayEntregas,
  entregasExistentes, lineasPendientesFactura, isSaving, isCreatingEntrega,
  onBack, onSave, onDelete, onStatusChange, onCreateEntrega,
  onNavigateEntrega, onGenerarPdf, onPrintTicket, onFacturar,
}: VentaFormHeaderProps) {
  return (
    <div className="bg-card border-b border-border px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onBack} className="btn-odoo-secondary !px-2.5">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold text-foreground truncate">
            {isNew ? 'Nueva venta' : (folio || 'Venta')}
          </h1>
          {clienteNombre && (
            <p className="text-xs text-muted-foreground truncate">{clienteNombre}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {!isNew && status === 'borrador' && (
          <button onClick={() => onStatusChange('confirmado')} className="btn-odoo-primary">Confirmar</button>
        )}
        {isNew && (
          <button onClick={() => onSave()} disabled={isSaving} className="btn-odoo-secondary">
            <Save className="h-3.5 w-3.5" /> Guardar borrador
          </button>
        )}
        {canCreateEntrega && (
          <button onClick={onCreateEntrega} disabled={isCreatingEntrega} className="btn-odoo-primary">
            <Truck className="h-3.5 w-3.5" /> Crear entrega{hayEntregas ? ' parcial' : ''}
          </button>
        )}
        {!isNew && tipo === 'pedido' && hayEntregas && (
          <div className="flex items-center gap-1">
            {entregasExistentes.map(ent => (
              <button key={ent.id} onClick={() => onNavigateEntrega(ent.id)} className="btn-odoo-secondary text-[11px]">
                <Truck className="h-3 w-3" /> {ent.folio}
              </button>
            ))}
          </div>
        )}
        {!isNew && (
          <button onClick={onGenerarPdf} className="btn-odoo-secondary text-xs">
            <FileText className="h-3.5 w-3.5" /> Documento
          </button>
        )}
        {!isNew && onPrintTicket && (
          <button onClick={onPrintTicket} className="btn-odoo-secondary text-xs">
            <Printer className="h-3.5 w-3.5" /> Imprimir ticket
          </button>
        )}
        {!isNew && requiereFactura && lineasPendientesFactura > 0 && (
          <button onClick={onFacturar} className="btn-odoo-primary text-xs">
            <Receipt className="h-3.5 w-3.5" /> Facturar • {lineasPendientesFactura} pendientes
          </button>
        )}
        {!isNew && status === 'confirmado' && !entregaInmediata && tipo !== 'pedido' && (
          <button onClick={() => onStatusChange('entregado')} className="btn-odoo-primary">Entregar</button>
        )}
        {!isNew && ((status === 'confirmado' && entregaInmediata) || status === 'entregado') && !requiereFactura && (
          <button onClick={() => onStatusChange('facturado')} className="btn-odoo-primary">Facturar</button>
        )}
        {!readOnly && !isNew && (
          <button onClick={() => onSave()} disabled={isSaving} className="btn-odoo-secondary">
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        )}
        {isNew && (
          <button onClick={() => onSave(true)} disabled={isSaving} className="btn-odoo-primary">
            <Check className="h-3.5 w-3.5" /> Guardar y confirmar
          </button>
        )}
        {!isNew && status !== 'cancelado' && status !== 'borrador' && (
          <button onClick={() => onStatusChange('borrador' as any)} className="btn-odoo-secondary text-warning text-xs">
            <RotateCcw className="h-3.5 w-3.5" /> A borrador
          </button>
        )}
        {!isNew && status !== 'cancelado' && (
          <button onClick={() => onStatusChange('cancelado')} className="btn-odoo-secondary text-destructive text-xs">Cancelar</button>
        )}
        {!isNew && (status === 'borrador' || (status === 'cancelado' && canDeleteCancelada)) && (
          <button onClick={onDelete} className="btn-odoo-secondary text-destructive !px-2" title={status === 'cancelado' ? 'Eliminar venta cancelada' : 'Eliminar borrador'}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
