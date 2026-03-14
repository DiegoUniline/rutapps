import { MapPin, Truck } from 'lucide-react';

export default function RutasMapPage() {
  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <MapPin className="h-5 w-5" /> Optimización de rutas
      </h1>

      <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center">
          <Truck className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Próximamente</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          El módulo de optimización de rutas con Google Maps te permitirá planificar las rutas más
          eficientes para tus vendedores, visualizar clientes en el mapa y calcular tiempos de entrega.
        </p>
        <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto pt-4">
          <div className="bg-accent/50 rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground">Optimización</p>
            <p className="text-sm font-semibold">Rutas óptimas</p>
          </div>
          <div className="bg-accent/50 rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground">Visualización</p>
            <p className="text-sm font-semibold">Mapa interactivo</p>
          </div>
          <div className="bg-accent/50 rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground">Seguimiento</p>
            <p className="text-sm font-semibold">Tiempo real</p>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">Requiere configurar una API key de Google Maps</p>
      </div>
    </div>
  );
}
