import { useState } from 'react';
import { PlayCircle, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  TUTORIAL_VIDEOS,
  YOUTUBE_CHANNEL_URL,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  type TutorialVideo,
} from '@/lib/tutorialVideos';

export default function TutorialesPage() {
  const [selected, setSelected] = useState<TutorialVideo | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Video Tutoriales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aprende a usar cada módulo del sistema con nuestros videos paso a paso.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Ver canal
          </a>
        </Button>
      </div>

      {TUTORIAL_VIDEOS.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <PlayCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay videos agregados aún</p>
          <p className="text-xs mt-1">Agrega videos en <code className="bg-muted px-1 py-0.5 rounded text-xs">src/lib/tutorialVideos.ts</code></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TUTORIAL_VIDEOS.map((video, i) => (
            <Card
              key={video.url + i}
              className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden group"
              onClick={() => setSelected(video)}
            >
              <div className="relative">
                <AspectRatio ratio={16 / 9}>
                  <img
                    src={youtubeThumbnailUrl(video.url)}
                    alt={video.title}
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </AspectRatio>
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <PlayCircle className="h-12 w-12 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                </div>
                {video.module && (
                  <span className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded capitalize">
                    {video.module}
                  </span>
                )}
              </div>
              <CardContent className="p-3">
                <h3 className="font-semibold text-sm text-foreground line-clamp-2">{video.title}</h3>
                {video.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{video.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-foreground text-sm truncate pr-4">{selected?.title}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selected && (
            <AspectRatio ratio={16 / 9}>
              <iframe
                src={youtubeEmbedUrl(selected.url)}
                title={selected.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </AspectRatio>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
