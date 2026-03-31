import { useState } from 'react';
import { PlayCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

function extractVideoId(url: string): string {
  const m1 = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m2) return m2[1];
  const m3 = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (m3) return m3[1];
  return url;
}

function embedUrl(url: string) {
  return `https://www.youtube.com/embed/${extractVideoId(url)}?rel=0`;
}

interface VideoRow { id: string; url: string; title: string; module: string | null; }

interface VideoHelpButtonProps {
  module: string;
}

export default function VideoHelpButton({ module }: VideoHelpButtonProps) {
  const { empresa } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<VideoRow | null>(null);

  const { data: videos } = useQuery({
    queryKey: ['tutorial-videos-module', empresa?.id, module],
    enabled: !!empresa?.id && !!module,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('tutorial_videos')
        .select('id, url, title, module')
        .eq('empresa_id', empresa!.id)
        .eq('module', module)
        .order('sort_order');
      return (data ?? []) as VideoRow[];
    },
  });

  if (!videos?.length) return null;

  const handleOpen = (v: VideoRow) => {
    setCurrent(v);
    setOpen(true);
  };

  return (
    <>
      {videos.length === 1 ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
          onClick={() => handleOpen(videos[0])}
        >
          <PlayCircle className="h-4 w-4" />
          Ver tutorial
        </Button>
      ) : (
        <div className="flex gap-1">
          {videos.map((v) => (
            <Button
              key={v.id}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
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
                src={embedUrl(current.url)}
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