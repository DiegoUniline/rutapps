import { useState } from 'react';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { LockOpen, Lock, ArrowUp, ArrowDown, Receipt, ListOrdered, Wallet } from 'lucide-react';
import { AbrirTurnoModal } from './AbrirTurnoModal';
import { CerrarTurnoModal } from './CerrarTurnoModal';
import { MovimientoCajaModal } from './MovimientoCajaModal';
import { VentasTurnoModal } from './VentasTurnoModal';
import { fmtMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';

/**
 * POS-style horizontal action buttons for shift management.
 * Shown in the POS header. Renders nothing if pos_turnos_habilitado is off for the empresa.
 */
export function TurnoControls() {
  const { enabled, turno, loading } = useCajaTurno();
  const [openAbrir, setOpenAbrir] = useState(false);
  const [openCerrar, setOpenCerrar] = useState(false);
  const [openVentas, setOpenVentas] = useState(false);
  const [movTipo, setMovTipo] = useState<null | 'retiro' | 'deposito' | 'gasto'>(null);

  if (!enabled || loading) return null;

  // No active shift: only "Abrir turno"
  if (!turno) {
    return (
      <>
        <button
          onClick={() => setOpenAbrir(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity"
        >
          <LockOpen className="h-3.5 w-3.5" />
          Abrir turno
        </button>
        <AbrirTurnoModal open={openAbrir} onOpenChange={setOpenAbrir} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Status chip with shift fund */}
        <div className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-primary/10 border border-primary/30 text-[11px]">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-primary">{turno.caja_nombre}</span>
          <span className="text-primary/70">·</span>
          <span className="font-bold text-primary">{fmtMoney(turno.fondo_inicial)}</span>
        </div>

        <ActionButton
          icon={<ArrowDown className="h-3.5 w-3.5" />}
          label="Depósito"
          onClick={() => setMovTipo('deposito')}
          tone="primary"
        />
        <ActionButton
          icon={<ArrowUp className="h-3.5 w-3.5" />}
          label="Retiro"
          onClick={() => setMovTipo('retiro')}
          tone="warning"
        />
        <ActionButton
          icon={<Receipt className="h-3.5 w-3.5" />}
          label="Gasto"
          onClick={() => setMovTipo('gasto')}
          tone="muted"
        />
        <ActionButton
          icon={<ListOrdered className="h-3.5 w-3.5" />}
          label="Ventas turno"
          onClick={() => setOpenVentas(true)}
          tone="muted"
        />
        <ActionButton
          icon={<Lock className="h-3.5 w-3.5" />}
          label="Cerrar turno"
          onClick={() => setOpenCerrar(true)}
          tone="destructive"
        />
      </div>

      <CerrarTurnoModal open={openCerrar} onOpenChange={setOpenCerrar} />
      <VentasTurnoModal open={openVentas} onOpenChange={setOpenVentas} />
      {movTipo && (
        <MovimientoCajaModal open={!!movTipo} onOpenChange={(v) => !v && setMovTipo(null)} tipo={movTipo} />
      )}
    </>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: 'primary' | 'warning' | 'muted' | 'destructive';
}) {
  const toneCls = {
    primary: 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/30',
    warning: 'bg-warning/10 hover:bg-warning/20 text-warning border-warning/30',
    muted: 'bg-muted hover:bg-accent text-foreground border-border',
    destructive: 'bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/30',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 h-8 px-2 sm:px-2.5 rounded-md border text-[11px] font-semibold transition-colors',
        toneCls
      )}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
