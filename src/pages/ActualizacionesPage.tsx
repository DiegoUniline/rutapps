import { useEffect, useState } from 'react';
import { usePublicidadList, resolveMediaUrl, toEmbedUrl, type Publicidad } from '@/hooks/usePublicidad';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ExternalLink, Calendar, ImageIcon, Video, Link2, FileText } from 'lucide-react';
import { fmtDate } from '@/lib/utils';

const TIPO_LABEL: Record<string, { label: string; icon: any }> = {
  imagen: { label: 'Imagen', icon: ImageIcon },
  video: { label: 'Video', icon: Video },
  url_video: { label: 'Video enlace', icon: Link2 },
  solo_texto: { label: 'Aviso', icon: FileText },
};

export default function ActualizacionesPage() {
  const { data: items, isLoading } = usePublicidadList();

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Actualizaciones</h1>
          <p className="text-sm text-muted-foreground">Novedades, mejoras y avisos importantes de Rutapp.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-40 animate-pulse" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Sparkles className="h-10 w-10 mx-auto opacity-30 mb-3" />
          <p>Aún no hay novedades publicadas.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map(ad => <UpdateCard key={ad.id} ad={ad} />)}
        </div>
      )}
    </div>
  );
}

function UpdateCard({ ad }: { ad: Publicidad }) {
  const [media, setMedia] = useState<string | null>(null);
  const meta = TIPO_LABEL[ad.tipo_media] || TIPO_LABEL.solo_texto;
  const Icon = meta.icon;

  useEffect(() => {
    let cancelled = false;
    if (ad.tipo_media === 'imagen' || ad.tipo_media === 'video') {
      resolveMediaUrl(ad.media_url).then(u => { if (!cancelled) setMedia(u); });
    } else if (ad.tipo_media === 'url_video') {
      setMedia(ad.media_url ? toEmbedUrl(ad.media_url) : null);
    }
    return () => { cancelled = true; };
  }, [ad]);

  return (
    <Card className="overflow-hidden">
      {ad.tipo_media === 'imagen' && media && (
        <img src={media} alt={ad.titulo} className="w-full max-h-[360px] object-cover bg-black" />
      )}
      {ad.tipo_media === 'video' && media && (
        <video src={media} controls className="w-full max-h-[360px] bg-black" />
      )}
      {ad.tipo_media === 'url_video' && media && (
        <div className="relative w-full aspect-video bg-black">
          <iframe
            src={media}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={ad.titulo}
          />
        </div>
      )}

      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <Icon className="h-3 w-3" /> {meta.label}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {fmtDate(ad.created_at)}
          </span>
        </div>
        <h2 className="text-xl font-bold leading-tight">{ad.titulo}</h2>
        {ad.descripcion && (
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{ad.descripcion}</p>
        )}
        {ad.cta_url && (
          <Button
            size="sm"
            onClick={() => window.open(ad.cta_url!, '_blank', 'noopener,noreferrer')}
            className="gap-1.5"
          >
            {ad.cta_label || 'Ver más'} <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
