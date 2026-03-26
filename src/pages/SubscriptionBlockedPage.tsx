import { useSubscription } from '@/hooks/useSubscription';
import { Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export default function SubscriptionBlockedPage() {
  const { signOut } = useAuth();
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-card p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">Acceso suspendido</h1>
        <p className="text-muted-foreground">
          Tu suscripción ha vencido o fue suspendida. Para continuar usando el sistema, 
          contacta al administrador o renueva tu plan.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
