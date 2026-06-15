import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useNextUnseenPopup, resolveMediaUrl, toEmbedUrl, type Publicidad } from '@/hooks/usePublicidad';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ExternalLink, Sparkles } from 'lucide-react';

export default function PublicidadPopup() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const isAdminView = !location.pathname.startsWith('/ruta');
  const { data: ad } = useNextUnseenPopup();
  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [media, setMedia] = useState<string | null>(null);
  const [dismissedAdId, setDismissedAdId] = useState<string | null>(null);
  const seenKey = user?.id ? `publicidad_seen_${user.id}` : null;

  // Open dialog in the administrative desktop shell only; never in the route mobile app (/ruta).
  useEffect(() => {
    const locallySeen = seenKey ? localStorage.getItem(seenKey)?.split(',').includes(ad?.id || '') : false;
    if (ad && !open && isAdminView && ad.id !== dismissedAdId && !locallySeen) {
      setOpen(true);
      setCountdown(5);
    }
  }, [ad, open, isAdminView, dismissedAdId, seenKey]);

  // Resolve media URL (signed for storage paths)
  useEffect(() => {
    let cancelled = false;
    if (!ad) { setMedia(null); return; }
    if (ad.tipo_media === 'imagen' || ad.tipo_media === 'video') {
      resolveMediaUrl(ad.media_url).then(url => { if (!cancelled) setMedia(url); });
    } else if (ad.tipo_media === 'url_video') {
      setMedia(ad.media_url ? toEmbedUrl(ad.media_url) : null);
    } else {
      setMedia(null);
    }
    return () => { cancelled = true; };
  }, [ad]);

  // 5-second countdown while open
  useEffect(() => {
    if (!open || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [open, countdown]);

  const canClose = countdown <= 0;

  const markSeen = async () => {
    if (!ad || !user?.id) return;
    try {
      await supabase
        .from('publicidad_vistas')
        .insert({ anuncio_id: ad.id, user_id: user.id });
    } catch (e) {
      // Ignore unique-constraint races
    }
  };

  const handleClose = async () => {
    if (!canClose) return;
    if (ad) {
      setDismissedAdId(ad.id);
      if (seenKey) {
        const prev = localStorage.getItem(seenKey)?.split(',').filter(Boolean) || [];
        if (!prev.includes(ad.id)) localStorage.setItem(seenKey, [...prev, ad.id].join(','));
      }
    }
    setOpen(false);
    await markSeen();
    await queryClient.invalidateQueries({ queryKey: ['publicidad', 'next-unseen', user?.id] });
  };

  if (!ad) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="max-w-lg p-0 overflow-hidden border-2 [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => { if (!canClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!canClose) e.preventDefault(); }}
      >
        {/* Custom close button (right top) — hidden until countdown ends */}
        <button
          onClick={handleClose}
          disabled={!canClose}
          className="absolute top-3 right-3 z-50 h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed transition"
          aria-label="Cerrar"
        >
          {canClose ? <X className="h-4 w-4" /> : <span className="text-xs font-bold">{countdown}</span>}
        </button>

        {/* Media */}
        <MediaBlock ad={ad} media={media} />

        {/* Body */}
        <div className="p-5 space-y-3 bg-background">
          <div className="flex items-start gap-2">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight">{ad.titulo}</h2>
              {ad.descripcion && (
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{ad.descripcion}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-[11px] text-muted-foreground">
              {canClose ? 'Puedes cerrar la ventana' : `Espera ${countdown}s para cerrar`}
            </p>
            <div className="flex gap-2">
              {ad.cta_url && (
                <Button
                  size="sm"
                  onClick={() => window.open(ad.cta_url!, '_blank', 'noopener,noreferrer')}
                  className="gap-1.5"
                >
                  {ad.cta_label || 'Ver más'} <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={!canClose} onClick={handleClose}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaBlock({ ad, media }: { ad: Publicidad; media: string | null }) {
  if (ad.tipo_media === 'solo_texto') return null;
  if (!media) {
    return <div className="aspect-video w-full bg-muted animate-pulse" />;
  }
  if (ad.tipo_media === 'imagen') {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
        <img src={media} alt={ad.titulo} className="w-full h-full object-contain" />
      </div>
    );
  }
  if (ad.tipo_media === 'video') {
    return (
      <video src={media} controls autoPlay muted playsInline className="w-full max-h-[400px] bg-black" />
    );
  }
  if (ad.tipo_media === 'url_video') {
    return (
      <div className="relative w-full aspect-video bg-black">
        <iframe
          src={media}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title={ad.titulo}
        />
      </div>
    );
  }
  return null;
}
