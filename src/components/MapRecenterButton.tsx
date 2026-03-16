import { Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onClick: () => void;
  className?: string;
}

export default function MapRecenterButton({ onClick, className = '' }: Props) {
  return (
    <Button
      size="icon"
      variant="secondary"
      className={`absolute z-10 shadow-lg border border-border bg-card hover:bg-accent h-9 w-9 ${className}`}
      onClick={onClick}
      title="Centrar mapa"
    >
      <Crosshair className="h-4 w-4 text-foreground" />
    </Button>
  );
}
