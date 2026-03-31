import { useState } from 'react';
import { PlayCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { getVideosForModule, youtubeEmbedUrl, extractVideoId, type TutorialVideo } from '@/lib/tutorialVideos';

interface VideoHelpButtonProps {
  module: string;
}

/**
 * Botón contextual que muestra el video tutorial del módulo actual.
 * Solo se renderiza si hay videos vinculados a ese módulo.
 */
export default function VideoHelpButton({ module }: VideoHelpButtonProps) {
  const videos = getVideosForModule(module);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<TutorialVideo | null>(null);

  if (videos.length === 0) return null;

  const handleOpen = (v: TutorialVideo) => {
    setCurrent(v);
    setOpen(true);
  };

  return (
    <>
      {videos.length === 1 ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => handleOpen(videos[0])}
          title="Ver video tutorial"
        >
          <PlayCircle className="h-5 w-5" />
        </Button>
      ) : (
        <div className="flex gap-1">
          {videos.map((v) => (
            <Button
              key={v.videoId}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary gap-1 text-xs"
              onClick={() => handleOpen(v)}
            >
              <PlayCircle className="h-4 w-4" />
              {v.title}
            </Button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-foreground text-sm truncate pr-4">
              {current?.title}
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {current && (
            <AspectRatio ratio={16 / 9}>
              <iframe
                src={youtubeEmbedUrl(current.videoId)}
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </AspectRatio>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
