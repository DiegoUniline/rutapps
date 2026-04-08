import { useState } from 'react';
import { ShoppingCart, XCircle, MapPin, Phone, Navigation, Crosshair, Loader2, CheckCircle2, ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const MOTIVOS = ['No necesita producto', 'Cerrado / no encontrado', 'Sin dinero', 'Precio alto', 'Otro'];

interface Props {
  cliente: any;
  idx: number;
  totalItems: number;
  isVisited: boolean;
  isExpanded: boolean;
  modo: string;
  diaHoy: string;
  capturingGpsId: string | null;
  onToggleExpand: (id: string) => void;
  onMarkVisited: (id: string) => void;
  onUnmarkVisited: (id: string) => void;
  onVender: (cliente: any) => void;
  onNoCompro: (clienteId: string, motivo: string, notas?: string) => void;
  onMoveItem: (idx: number, dir: 'up' | 'down') => void;
  onCaptureGps: (cliente: any) => void;
  onOpenMaps: (lat: number, lng: number, nombre: string) => void;
  onHistorial: (cliente: { id: string; nombre: string }) => void;
}

export function ClienteArrivalCard({
  cliente: c, idx, totalItems, isVisited, isExpanded, modo, diaHoy,
  capturingGpsId, onToggleExpand, onMarkVisited, onUnmarkVisited,
  onVender, onNoCompro, onMoveItem, onCaptureGps, onOpenMaps, onHistorial,
}: Props) {
  const [showMotivos, setShowMotivos] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const handleNoCompro = async (m: string) => {
    setSaving(true);
    try {
      await onNoCompro(c.id, m, m === 'Otro' ? notas : undefined);
    } finally {
      setSaving(false);
      setShowMotivos(false);
      setMotivo('');
      setNotas('');
    }
  };

  return (
    <div className={cn(
      "bg-card border rounded-xl overflow-hidden transition-all",
      isVisited ? "border-emerald-500/40 bg-emerald-500/5" : "border-border",
      isExpanded && !isVisited && "ring-2 ring-primary/30 border-primary/40"
    )}>
      {/* Main row */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          onClick={() => {
            if (isVisited) {
              onUnmarkVisited(c.id);
            } else {
              onToggleExpand(c.id);
            }
          }}
          className={cn(
            "w-7 h-7 rounded-md flex items-center justify-center transition-all active:scale-90 shrink-0",
            isVisited
              ? "bg-emerald-500 text-white"
              : isExpanded
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary"
          )}
          title={isVisited ? 'Desmarcar visitado' : 'Llegué'}
        >
          {isVisited
            ? <CheckCircle2 className="h-3.5 w-3.5" />
            : <span className="font-bold text-[11px]">{idx + 1}</span>
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <button onClick={() => onHistorial({ id: c.id, nombre: c.nombre })} className={cn(
              "text-[13px] font-semibold truncate text-left flex-1 min-w-0",
              isVisited ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"
            )}>{c.nombre}</button>
            {c.codigo && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{c.codigo}</span>}
          </div>
          {c.direccion && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate leading-tight">
              <MapPin className="h-2.5 w-2.5 shrink-0" />{c.direccion}{c.colonia ? `, ${c.colonia}` : ''}
            </p>
          )}
          {modo === 'todos' && c.dia_visita && c.dia_visita.length > 0 && (
            <div className="flex gap-0.5 mt-0.5 flex-wrap">
              {c.dia_visita.map((d: string) => (
                <span key={d} className={cn(
                  "text-[9px] px-1 py-px rounded-full font-medium capitalize",
                  d.toLowerCase() === diaHoy ? "bg-primary/10 text-primary" : "bg-card border border-border text-muted-foreground"
                )}>{d.slice(0, 3)}</span>
              ))}
            </div>
          )}
        </div>

        {modo !== 'visitados' && (
          <div className="flex flex-col shrink-0">
            <button onClick={() => onMoveItem(idx, 'up')} disabled={idx === 0}
              className={cn("p-0.5", idx === 0 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onMoveItem(idx, 'down')} disabled={idx === totalItems - 1}
              className={cn("p-0.5", idx === totalItems - 1 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground active:bg-muted shrink-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => onCaptureGps(c)} disabled={capturingGpsId === c.id}>
              {capturingGpsId === c.id
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Crosshair className="h-4 w-4 mr-2" />}
              {c.gps_lat ? 'Actualizar GPS' : 'Capturar GPS'}
            </DropdownMenuItem>
            {c.gps_lat && c.gps_lng && (
              <DropdownMenuItem onClick={() => onOpenMaps(c.gps_lat!, c.gps_lng!, c.nombre)}>
                <Navigation className="h-4 w-4 mr-2" />
                Navegar
              </DropdownMenuItem>
            )}
            {c.telefono && (
              <DropdownMenuItem onClick={() => window.open(`tel:${c.telefono}`)}>
                <Phone className="h-4 w-4 mr-2" />
                Llamar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded arrival actions */}
      {isExpanded && !isVisited && !showMotivos && (
        <div className="px-3 pb-3 pt-1 flex gap-2 border-t border-border/50 bg-primary/[0.03]">
          <button
            onClick={() => onVender(c)}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 text-[13px] font-bold active:scale-[0.97] transition-transform shadow-md shadow-primary/20"
          >
            <ShoppingCart className="h-4 w-4" />
            Vender
          </button>
          <button
            onClick={() => setShowMotivos(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-card border border-border text-muted-foreground rounded-xl py-3 text-[13px] font-semibold active:scale-[0.97] transition-transform"
          >
            <XCircle className="h-4 w-4" />
            No compró
          </button>
        </div>
      )}

      {/* Inline motivo picker */}
      {isExpanded && !isVisited && showMotivos && (
        <div className="px-3 pb-3 pt-1 border-t border-border/50 bg-primary/[0.03] space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground">¿Por qué no compró?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MOTIVOS.map(m => (
              <button
                key={m}
                disabled={saving}
                onClick={() => {
                  if (m === 'Otro') {
                    setMotivo('Otro');
                  } else {
                    handleNoCompro(m);
                  }
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-[11px] font-medium text-left active:scale-[0.97] transition-all",
                  motivo === m
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {motivo === 'Otro' && (
            <div className="space-y-1.5">
              <textarea
                className="w-full bg-accent/40 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
                rows={2} placeholder="Describe el motivo..." value={notas} onChange={e => setNotas(e.target.value)} autoFocus
              />
              <button
                disabled={saving || !notas.trim()}
                onClick={() => handleNoCompro('Otro')}
                className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-[12px] font-bold disabled:opacity-40 active:scale-[0.97] transition-transform"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          )}
          <button
            onClick={() => { setShowMotivos(false); setMotivo(''); setNotas(''); }}
            className="w-full text-[11px] text-muted-foreground py-1"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
