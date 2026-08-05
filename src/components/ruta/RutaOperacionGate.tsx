import { CloudOff, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRutaReadiness, type RutaOperacion } from '@/lib/rutaReadiness';

const TITULOS: Record<RutaOperacion, string> = {
  venta: 'No puedes vender todavía',
  cobro: 'No puedes cobrar todavía',
  devolucion: 'No puedes registrar devoluciones',
  gasto: 'No puedes registrar gastos',
  visita: 'No puedes registrar visitas',
  entrega: 'No puedes registrar entregas',
  inventario: 'No puedes mover inventario',
};

/**
 * Portero de operaciones de /ruta: si falta algún dato indispensable en la
 * copia local, la pantalla no se monta. Evita documentos con precios,
 * promociones o permisos incorrectos por información incompleta.
 */
export function RutaOperacionGate({ operacion, children }: { operacion: RutaOperacion; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { loading, puede, motivos, refrescar } = useRutaReadiness();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (puede(operacion)) return <>{children}</>;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <CloudOff className="w-7 h-7 text-destructive" />
      </div>
      <div>
        <h1 className="text-lg font-semibold">{TITULOS[operacion]}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Falta información en este dispositivo. Conéctate y sincroniza para continuar.
        </p>
      </div>
      <ul className="text-left text-[13px] bg-muted/40 rounded-xl p-3 w-full max-w-sm space-y-1">
        {motivos(operacion).map(m => (
          <li key={m} className="flex gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
            <span>{m}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 w-full max-w-sm">
        <button onClick={refrescar} className="flex-1 h-11 rounded-xl border border-border font-medium text-sm">
          Revisar de nuevo
        </button>
        <button onClick={() => navigate('/ruta/sincronizar')} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm">
          Sincronizar
        </button>
      </div>
    </div>
  );
}
