import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MANTENIMIENTO } from '@/lib/mantenimiento';

export default function MantenimientoAviso({ onSalir }: { onSalir?: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
        <Wrench className="h-12 w-12 text-primary mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Estamos trabajando</h1>
        <p className="text-muted-foreground text-sm">{MANTENIMIENTO.mensaje}</p>
        <p className="text-muted-foreground text-xs">Tus datos están seguros. Gracias por tu paciencia.</p>
        {onSalir && (
          <Button variant="outline" onClick={onSalir}>Cerrar sesión</Button>
        )}
      </div>
    </div>
  );
}
