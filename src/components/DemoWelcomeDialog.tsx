import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ShoppingCart, Package, Users, Warehouse, Truck, BarChart3,
  ArrowRight, Sparkles, MapPin, Receipt, RefreshCw, ClipboardCheck,
} from 'lucide-react';

const FEATURES = [
  {
    icon: ShoppingCart,
    title: 'Ventas y Pedidos',
    desc: 'Crea ventas directas o pedidos a crédito con cálculo automático de impuestos.',
  },
  {
    icon: Users,
    title: '12 Clientes listos',
    desc: 'Con zona, ruta, días de visita, GPS y condiciones de crédito configuradas.',
  },
  {
    icon: Package,
    title: '20 Productos',
    desc: '5 categorías (Bebidas, Botanas, Lácteos, Limpieza, Abarrotes) con stock y precios.',
  },
  {
    icon: Warehouse,
    title: '3 Almacenes',
    desc: 'General, Ruta Norte y Ruta Sur con inventario distribuido.',
  },
  {
    icon: RefreshCw,
    title: 'Traspasos',
    desc: 'Mueve mercancía entre almacenes y rastrea cada movimiento.',
  },
  {
    icon: Truck,
    title: 'Logística y Cargas',
    desc: 'Arma cargas para ruta, genera entregas y controla la descarga.',
  },
  {
    icon: ClipboardCheck,
    title: 'Conteos e Inventario',
    desc: 'Audita tu stock con conteos físicos y ajustes automáticos.',
  },
  {
    icon: MapPin,
    title: 'Mapa de clientes',
    desc: 'Visualiza tus clientes y rutas en un mapa interactivo.',
  },
  {
    icon: Receipt,
    title: 'Cobranza',
    desc: 'Registra cobros parciales o totales y lleva el estado de cuenta.',
  },
  {
    icon: BarChart3,
    title: 'Reportes',
    desc: 'Ventas por producto, cliente, vendedor, utilidad y más.',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DemoWelcomeDialog({ open, onClose }: Props) {
  const [page, setPage] = useState(0);
  const perPage = 5;
  const pages = Math.ceil(FEATURES.length / perPage);
  const current = FEATURES.slice(page * perPage, (page + 1) * perPage);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              ¡Bienvenido a la Demo!
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            Tienes un entorno completo listo para explorar. Todo se resetea cada vez que entras.
          </p>
        </div>

        {/* Features */}
        <div className="px-6 py-4 space-y-3">
          {current.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">{f.title}</p>
                <p className="text-xs text-muted-foreground leading-snug">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2 flex items-center justify-between border-t border-border">
          <div className="flex gap-1.5">
            {Array.from({ length: pages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === page ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          {page < pages - 1 ? (
            <Button size="sm" variant="ghost" onClick={() => setPage(page + 1)}>
              Siguiente <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={onClose}>
              ¡Empezar a explorar!
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
