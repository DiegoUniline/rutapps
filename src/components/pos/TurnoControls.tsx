import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { useCajaTurno } from '@/hooks/useCajaTurno';
import { LockOpen, Lock, ChevronDown, ArrowUp, ArrowDown, Receipt, Wallet } from 'lucide-react';
import { AbrirTurnoModal } from './AbrirTurnoModal';
import { CerrarTurnoModal } from './CerrarTurnoModal';
import { MovimientoCajaModal } from './MovimientoCajaModal';
import { fmtMoney } from '@/lib/currency';

/** Header controls for shift management. Only renders if pos_turnos_habilitado for the empresa. */
export function TurnoControls() {
  const { enabled, turno, loading } = useCajaTurno();
  const [openAbrir, setOpenAbrir] = useState(false);
  const [openCerrar, setOpenCerrar] = useState(false);
  const [movTipo, setMovTipo] = useState<null | 'retiro' | 'deposito' | 'gasto'>(null);

  if (!enabled || loading) return null;

  if (!turno) {
    return (
      <>
        <Button size="sm" variant="default" className="h-8 gap-1.5" onClick={() => setOpenAbrir(true)}>
          <LockOpen className="h-3.5 w-3.5" /> Abrir turno
        </Button>
        <AbrirTurnoModal open={openAbrir} onOpenChange={setOpenAbrir} />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-primary/50 bg-primary/10 hover:bg-primary/20">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold">Turno · {fmtMoney(turno.fondo_inicial)}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">{turno.caja_nombre}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMovTipo('deposito')}>
            <ArrowDown className="h-4 w-4 text-primary mr-2" /> Depósito a caja
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMovTipo('retiro')}>
            <ArrowUp className="h-4 w-4 text-destructive mr-2" /> Retiro de efectivo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMovTipo('gasto')}>
            <Receipt className="h-4 w-4 text-muted-foreground mr-2" /> Gasto de caja
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpenCerrar(true)} className="text-destructive">
            <Lock className="h-4 w-4 mr-2" /> Cerrar turno
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CerrarTurnoModal open={openCerrar} onOpenChange={setOpenCerrar} />
      {movTipo && (
        <MovimientoCajaModal open={!!movTipo} onOpenChange={(v) => !v && setMovTipo(null)} tipo={movTipo} />
      )}
    </>
  );
}
