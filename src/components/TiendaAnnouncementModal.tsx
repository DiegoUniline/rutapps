import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Store, ArrowRight, Gift, Sparkles } from 'lucide-react';
import anuncioImg from '@/assets/anuncio-tienda-2026.jpg';

// Bump this key to force re-show for all users (e.g. when content changes)
const STORAGE_KEY = 'tienda_announcement_v1_seen';

export default function TiendaAnnouncementModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isAdminView = !location.pathname.startsWith('/ruta') && !location.pathname.startsWith('/tienda');

  useEffect(() => {
    if (!user?.id || !isAdminView) return;
    const key = `${STORAGE_KEY}_${user.id}`;
    const seen = localStorage.getItem(key);
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(t);
    }
  }, [user?.id, isAdminView]);

  const markSeen = () => {
    if (!user?.id) return;
    localStorage.setItem(`${STORAGE_KEY}_${user.id}`, new Date().toISOString());
  };

  const handleActivar = () => {
    markSeen();
    setOpen(false);
    navigate('/configuracion/tienda');
  };

  const handleClose = () => {
    markSeen();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl p-0 border-2 border-primary/30 max-h-[90vh] overflow-y-auto">
        {/* Hero image */}
        <div className="w-full bg-gradient-to-br from-blue-50 to-orange-50">
          <img
            src={anuncioImg}
            alt="Tienda en línea gratis 2026"
            className="w-full h-auto block max-h-[28vh] sm:max-h-[40vh] object-cover"
            width={1280}
            height={768}
          />
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 bg-background">
          <div className="flex items-start gap-2">
            <Sparkles className="h-6 w-6 text-primary shrink-0 mt-1" />
            <div>
              <h2 className="text-xl font-bold leading-tight">
                ¡Ya tienes Tienda en Línea incluida!
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Vende 24/7 a tus clientes con tu propio catálogo web estilo Mercado Libre / Amazon —
                con tus precios, tus listas y tu marca.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border-2 border-green-200 bg-green-50 dark:bg-green-950/20 p-3">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-green-600" />
                <span className="text-sm font-bold text-green-700 dark:text-green-400">GRATIS todo 2026</span>
              </div>
              <p className="text-xs text-green-700/80 dark:text-green-300/80 mt-1">
                Pruébala sin costo el resto del año.
              </p>
            </div>
            <div className="rounded-lg border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-bold text-blue-700 dark:text-blue-400">Desde 2027: $500 MXN/mes</span>
              </div>
              <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-1">
                Cobro adicional por empresa, si decides conservarla.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">¿Cómo se usa?</strong> Actívala en{' '}
            <strong>Configuración → Tienda en línea</strong>, sube tu banner y elige qué lista de precios
            mostrar. Tus clientes entran con su correo y contraseña inicial <code className="px-1 rounded bg-background">123456</code>.
            Los pedidos llegan a tu campanita 🛍️ arriba.
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              size="lg"
              onClick={handleActivar}
              className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Activar mi tienda ahora <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={handleClose}>
              Más tarde
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
