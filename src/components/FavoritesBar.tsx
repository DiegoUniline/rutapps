import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Star, StarOff, Plus, X, Search } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface NavOption {
  label: string;
  path: string;
  group?: string;
}

interface FavoritesBarProps {
  /** All available routes with labels for the picker */
  options: NavOption[];
}

export default function FavoritesBar({ options }: FavoritesBarProps) {
  const { favorites, add, remove, isFavorite } = useFavorites();
  const location = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.group ?? '').toLowerCase().includes(q)
    );
  }, [options, search]);

  const grouped = useMemo(() => {
    const map: Record<string, NavOption[]> = {};
    filtered.forEach(o => {
      const key = o.group ?? 'General';
      (map[key] ??= []).push(o);
    });
    return map;
  }, [filtered]);

  return (
    <>
      <div className="flex items-center gap-1.5 px-4 py-1.5 bg-card border-b border-border overflow-x-auto">
        <Star className="h-3.5 w-3.5 text-warning shrink-0" fill="currentColor" />
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0 mr-1">Favoritos:</span>

        {favorites.length === 0 && (
          <span className="text-[11px] text-muted-foreground/60 italic shrink-0">
            Aún no tienes favoritos
          </span>
        )}

        {favorites.map(f => {
          const active = location.pathname === f.path || location.pathname.startsWith(f.path + '/');
          return (
            <div key={f.id} className="flex items-center group shrink-0">
              <Link
                to={f.path}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border",
                  active
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background text-foreground/80 border-border hover:bg-accent hover:text-foreground"
                )}
              >
                <span className="truncate max-w-[140px]">{f.label}</span>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(f.path); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  title="Quitar de favoritos"
                >
                  <X className="h-3 w-3" />
                </button>
              </Link>
            </div>
          );
        })}

        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all shrink-0 ml-auto"
          title="Agregar favorito"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Agregar</span>
        </button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-warning" fill="currentColor" />
              Configurar favoritos
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar vista..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-1">
                  {group}
                </div>
                <div className="space-y-0.5">
                  {items.map(opt => {
                    const fav = isFavorite(opt.path);
                    return (
                      <button
                        key={opt.path}
                        onClick={() => fav ? remove(opt.path) : add({ path: opt.path, label: opt.label })}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-[13px] hover:bg-accent transition-colors text-left"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-foreground truncate">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{opt.path}</span>
                        </div>
                        {fav ? (
                          <Star className="h-4 w-4 text-warning shrink-0" fill="currentColor" />
                        ) : (
                          <StarOff className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                No se encontraron vistas
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
            Tus favoritos se guardan por usuario y se sincronizan en cualquier dispositivo
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
