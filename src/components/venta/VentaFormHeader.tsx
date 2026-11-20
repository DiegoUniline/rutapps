import type React from 'react';
import { ArrowLeft, Save, Trash2, Check, Truck, FileText, Receipt, Printer, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusVenta } from '@/types';
import { MasAccionesMovil, type AccionMovil } from '@/components/shared/MasAccionesMovil';
import { useIsMobile } from '@/hooks/use-mobile';
import { EncabezadoDetalleMovil, type AccionPrincipalMovil } from '@/components/layout/EncabezadoDetalleMovil';
import { estadoPildora } from '@/components/layout/ListaTarjetaMovil';

interface Entrega {
  id: string;
  folio?: string;
  status: string;
}

interface VentaFormHeaderProps {
  isNew: boolean;
  folio?: string;
  clienteNombre?: string;
  registradoPorNombre?: string;
  status?: string;
  entregaInmediata?: boolean;
  tipo?: string;
  requiereFactura?: boolean;
  readOnly: boolean;
  canCreateEntrega: boolean;
  canDeleteCancelada?: boolean;
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
  onDevolucion?: () => void;
  /** Botones al final del renglón (Cobrar, Editar venta). */
  accionesFinales?: React.ReactNode;
  /** Teléfono: las mismas acciones finales como callbacks (Cobrar a la vista; Editar en «⋯»). */
  movil?: { cobrar?: () => void; editar?: () => void; cancelarEdicion?: () => void };
}

export function VentaFormHeader({
  isNew, folio, clienteNombre, registradoPorNombre, status, entregaInmediata, tipo,
  requiereFactura, readOnly, canCreateEntrega, canDeleteCancelada, hayEntregas,
  entregasExistentes, lineasPendientesFactura, isSaving, isCreatingEntrega,
  onBack, onSave, onDelete, onStatusChange, onCreateEntrega,
  onNavigateEntrega, onGenerarPdf, onPrintTicket, onFacturar, onDevolucion, accionesFinales, movil,
}: VentaFormHeaderProps) {
  const isMobile = useIsMobile();
  // En teléfono las acciones secundarias (consulta, impresión, devolución,
  // cancelar, eliminar) van al menú «⋯»; los botones principales quedan a la vista.
  const accionesMovil: AccionMovil[] = isNew ? [] : [
    ...(tipo === 'pedido' && hayEntregas ? entregasExistentes.map(ent => ({ key: `ent-${ent.id}`, label: `Entrega ${ent.folio ?? ''}`, icon: Truck, onClick: () => onNavigateEntrega(ent.id) })) : []),
    { key: 'doc', label: 'Documento', icon: FileText, onClick: onGenerarPdf },
    ...(onPrintTicket ? [{ key: 'ticket', label: 'Imprimir ticket', icon: Printer, onClick: onPrintTicket }] : []),
    ...(onDevolucion ? [{ key: 'dev', label: 'Devolución', icon: Undo2, onClick: onDevolucion, destructiva: true, separar: true }] : []),
    ...(status !== 'cancelado' ? [{ key: 'cancelar', label: 'Cancelar venta', onClick: () => onStatusChange('cancelado'), destructiva: true, separar: !onDevolucion }] : []),
    ...((status === 'borrador' || (status === 'cancelado' && canDeleteCancelada)) ? [{ key: 'eliminar', label: status === 'cancelado' ? 'Eliminar venta cancelada' : 'Eliminar borrador', icon: Trash2, onClick: onDelete, destructiva: true }] : []),
  ];
  if (isMobile) {
    const puedeEntregar = !isNew && status === 'confirmado' && !entregaInmediata && tipo !== 'pedido';
    const puedeFacturar = !isNew && lineasPendientesFactura > 0 && (requiereFactura || (status === 'confirmado' && entregaInmediata) || status === 'entregado');
    const editando = !readOnly && !isNew;
    let principal: AccionPrincipalMovil | null = null;
    if (isNew) principal = { key: 'confirmar', label: 'Confirmar', icon: Check, onClick: () => onSave(true), cargando: isSaving };
    else if (movil?.cancelarEdicion || editando) principal = { key: 'guardar', label: 'Guardar', icon: Save, onClick: () => onSave(), cargando: isSaving };
    else if (movil?.cobrar) principal = { key: 'cobrar', label: 'Cobrar', onClick: movil.cobrar };
    else if (status === 'borrador') principal = { key: 'confirmar', label: 'Confirmar', icon: Check, onClick: () => onStatusChange('confirmado') };
    else if (canCreateEntrega) principal = { key: 'entrega', label: 'Crear entrega', icon: Truck, onClick: onCreateEntrega, cargando: isCreatingEntrega };
    else if (puedeEntregar) principal = { key: 'entregar', label: 'Entregar', onClick: () => onStatusChange('entregado') };
    else if (puedeFacturar) principal = { key: 'facturar', label: 'Facturar', icon: Receipt, onClick: onFacturar };
    const menu: AccionMovil[] = [
      ...(isNew ? [{ key: 'borrador', label: 'Guardar borrador', icon: Save, onClick: () => onSave(), disabled: isSaving }] : []),
      ...(movil?.editar ? [{ key: 'editar', label: 'Editar venta', onClick: movil.editar }] : []),
      ...(movil?.cancelarEdicion ? [{ key: 'cancelar-ed', label: 'Cancelar edición', onClick: movil.cancelarEdicion }] : []),
      ...(!isNew && status === 'borrador' && principal?.key !== 'confirmar' && principal?.key !== 'guardar' ? [{ key: 'confirmar', label: 'Confirmar', icon: Check, onClick: () => onStatusChange('confirmado') }] : []),
      ...(canCreateEntrega && principal?.key !== 'entrega' ? [{ key: 'entrega', label: hayEntregas ? 'Crear entrega parcial' : 'Crear entrega', icon: Truck, onClick: onCreateEntrega, disabled: isCreatingEntrega }] : []),
      ...(puedeEntregar && principal?.key !== 'entregar' ? [{ key: 'entregar', label: 'Entregar', onClick: () => onStatusChange('entregado') }] : []),
      ...(puedeFacturar && principal?.key !== 'facturar' ? [{ key: 'facturar', label: `Facturar (${lineasPendientesFactura} pendientes)`, icon: Receipt, onClick: onFacturar }] : []),
      ...accionesMovil,
    ];
    return (
      <div className="bg-card border-b border-border px-3 py-2.5 sticky top-0 z-10">
        <EncabezadoDetalleMovil
          onBack={onBack}
          titulo={isNew ? 'Nueva venta' : (folio || 'Venta')}
          estado={!isNew && status ? { texto: estadoPildora(status).pildora, tono: estadoPildora(status).tono } : null}
          subtitulo={[clienteNombre, registradoPorNombre ? `Registrado por ${registradoPorNombre}` : null].filter(Boolean).join(' · ')}
          principales={principal ? (principal.key === 'guardar' && status === 'borrador' ? [principal, { key: 'confirmar', label: 'Confirmar', icon: Check, onClick: () => onStatusChange('confirmado') }] : [principal]) : []}
          menu={menu}
        />
      </div>
    );
  }

  return (
    <div className="bg-card border-b border-border px-3 sm:px-4 py-2.5 sm:py-1.5 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-10">
      <div className="flex items-center gap-3 sm:gap-2.5 min-w-0">
        <button onClick={onBack} className="btn-odoo-secondary !px-2.5 max-sm:!h-9 max-sm:!w-9 max-sm:!p-0 shrink-0" aria-label="Regresar">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[15px] sm:text-[14px] font-semibold text-foreground truncate leading-tight">
            {isNew ? 'Nueva venta' : (folio || 'Venta')}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            {clienteNombre && (
              <p className="text-xs text-muted-foreground truncate">{clienteNombre}</p>
            )}
            {registradoPorNombre && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                Registrado por {registradoPorNombre}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* D-029: gris = consulta/impresión · rojo contorno = devolución/cancelar/eliminar ·
          azul = confirmar/guardar/crear/cobrar · naranja = editar (al final). */}
      <div className="flex items-center gap-2 min-w-0 max-w-full flex-wrap justify-end ml-auto">
        <MasAccionesMovil acciones={accionesMovil} />
        {!isNew && tipo === 'pedido' && hayEntregas && entregasExistentes.map(ent => (
          <button key={ent.id} onClick={() => onNavigateEntrega(ent.id)} className="btn-odoo-secondary text-xs max-sm:hidden">
            <Truck className="h-3.5 w-3.5" /> {ent.folio}
          </button>
        ))}
        {!isNew && (
          <button onClick={onGenerarPdf} className="btn-odoo-secondary text-xs max-sm:hidden">
            <FileText className="h-3.5 w-3.5" /> Documento
          </button>
        )}
        {!isNew && onPrintTicket && (
          <button onClick={onPrintTicket} className="btn-odoo-secondary text-xs max-sm:hidden">
            <Printer className="h-3.5 w-3.5" /> Imprimir ticket
          </button>
        )}

        {!isNew && (onDevolucion || status !== 'cancelado') && <span className="w-px h-6 bg-border mx-0.5 max-sm:hidden" aria-hidden />}
        {!isNew && onDevolucion && (
          <button onClick={onDevolucion} className="btn-odoo-danger text-xs max-sm:hidden">
            <Undo2 className="h-3.5 w-3.5" /> Devolución
          </button>
        )}
        {/* D-021: una venta confirmada ya no regresa a borrador; se corrige con Editar. */}
        {!isNew && status !== 'cancelado' && (
          <button onClick={() => onStatusChange('cancelado')} className="btn-odoo-danger text-xs max-sm:hidden">Cancelar</button>
        )}
        {!isNew && (status === 'borrador' || (status === 'cancelado' && canDeleteCancelada)) && (
          <button onClick={onDelete} className="btn-odoo-danger text-xs !px-2 max-sm:hidden" title={status === 'cancelado' ? 'Eliminar venta cancelada' : 'Eliminar borrador'}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        <span className="w-px h-6 bg-border mx-0.5 max-sm:hidden" aria-hidden />
        {isNew && (
          <button onClick={() => onSave()} disabled={isSaving} className="btn-odoo-secondary text-xs">
            <Save className="h-3.5 w-3.5" /> Guardar borrador
          </button>
        )}
        {!readOnly && !isNew && (
          <button onClick={() => onSave()} disabled={isSaving} className="btn-odoo-primary text-xs">
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        )}
        {isNew && (
          <button onClick={() => onSave(true)} disabled={isSaving} className="btn-odoo-primary text-xs">
            <Check className="h-3.5 w-3.5" /> Guardar y confirmar
          </button>
        )}
        {!isNew && status === 'borrador' && (
          <button onClick={() => onStatusChange('confirmado')} className="btn-odoo-primary text-xs">Confirmar</button>
        )}
        {canCreateEntrega && (
          <button onClick={onCreateEntrega} disabled={isCreatingEntrega} className="btn-odoo-primary text-xs">
            <Truck className="h-3.5 w-3.5" /> Crear entrega{hayEntregas ? ' parcial' : ''}
          </button>
        )}
        {!isNew && status === 'confirmado' && !entregaInmediata && tipo !== 'pedido' && (
          <button onClick={() => onStatusChange('entregado')} className="btn-odoo-primary text-xs">Entregar</button>
        )}
        {!isNew && requiereFactura && lineasPendientesFactura > 0 && (
          <button onClick={onFacturar} className="btn-odoo-primary text-xs">
            <Receipt className="h-3.5 w-3.5" /> Facturar • {lineasPendientesFactura} pendientes
          </button>
        )}
        {!isNew && ((status === 'confirmado' && entregaInmediata) || status === 'entregado') && !requiereFactura && lineasPendientesFactura > 0 && (
          <button onClick={onFacturar} className="btn-odoo-primary text-xs">
            <Receipt className="h-3.5 w-3.5" /> Facturar
          </button>
        )}
        {accionesFinales}
      </div>
    </div>
  );
}
