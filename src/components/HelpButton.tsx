import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface HelpSection {
  title: string;
  content: string;
}

interface HelpButtonProps {
  title: string;
  sections: HelpSection[];
  compact?: boolean;
}

export default function HelpButton({ title, sections, compact }: HelpButtonProps) {

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "text-muted-foreground hover:text-primary",
          compact ? "h-7 w-7" : "h-8 w-8"
        )}
        onClick={() => setOpen(true)}
        title="Ayuda"
      >
        <HelpCircle className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} />
      </Button>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {sections.map((s, i) => (
              <div key={i} className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{s.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
