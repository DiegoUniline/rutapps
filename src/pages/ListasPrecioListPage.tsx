import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Pencil, Trash2, Link2, Copy, Eye, ChevronRight } from 'lucide-react';
import VideoHelpButton from '@/components/VideoHelpButton';
import { TableSkeleton } from '@/components/TableSkeleton';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { useAllListasPrecios, useDeleteListaPrecio } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function ListasPrecioListPage() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const { data: listas, isLoading } = useAllListasPrecios(empresa?.id);
  const qc = useQueryClient();
  const deleteMutation = useDeleteListaPrecio();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nombre: string } | null>(null);

  const filtered = listas?.filter(l =>
    !search || l.nombre.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Lista eliminada');
      setDeleteTarget(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const goToLista = (l: any) => {
    navigate(`/tarifas/${l.tarifa_id}?lista=${encodeURIComponent(l.nombre)}`);
  };

  const setPrincipal = async (l: any) => {
    if (l.es_principal || !empresa?.id) return;
    try {
      await supabase.from('lista_precios').update({ es_principal: false } as any).eq('empresa_id', empresa.id);
      const { error } = await supabase.from('lista_precios').update({ es_principal: true } as any).eq('id', l.id);
      if (error) throw error;
      toast.success(`"${l.nombre}" es ahora la lista principal`);
      qc.invalidateQueries({ queryKey: ['lista_precios_all'] });
      qc.invalidateQueries({ queryKey: ['lista_precios'] });
      qc.invalidateQueries({ queryKey: ['tarifas'] });
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo cambiar la principal');
    }
  };

  const total = filtered.length;



  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Listas de Precios <VideoHelpButton module="tarifas" /></h1>
        <button onClick={() => navigate('/tarifas/nueva')} className="btn-odoo-primary shrink-0">
          <Plus className="h-3.5 w-3.5" /> Nueva lista
        </button>
      </div>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar lista..." />

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
      ) : isMobile ? (
        /* ─── Mobile: card layout ─── */
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-center py-12 text-muted-foreground text-sm">No hay listas de precios.</p>
          )}
          {filtered.map(l => (
            <button
              key={l.id}
              onClick={() => goToLista(l)}
              className="w-full bg-card border border-border rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {l.es_principal && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  <span className="text-[14px] font-semibold text-foreground truncate">{l.nombre}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {l.activa
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Activa</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Inactiva</span>
                  }
                  {l.es_principal && <span className="text-[10px] text-amber-600 font-medium">Principal</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-primary font-medium mr-1">Ver precios</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* ─── Desktop: table layout ─── */
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Nombre</th>
                <th className="th-odoo text-center">Principal</th>
                <th className="th-odoo text-center">Estado</th>
                <th className="th-odoo text-center">Catálogo</th>
                <th className="th-odoo text-center w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">No hay listas de precios.</td></tr>
              )}
              {filtered.map(l => (
                <tr
                  key={l.id}
                  className={cn("border-b border-table-border transition-colors cursor-pointer hover:bg-table-hover")}
                  onClick={() => goToLista(l)}
                >
                  <td className="py-1.5 px-3">
                    <span className="font-medium flex items-center gap-1.5 text-foreground">
                      {l.es_principal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                      {l.nombre}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    {l.es_principal ? <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    {l.activa ? <span className="status-pill status-activo">Activa</span> : <span className="status-pill status-borrador">Inactiva</span>}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        title={l.share_activo ? 'Desactivar catálogo público' : 'Activar catálogo público'}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const next = !l.share_activo;
                          await supabase.from('lista_precios').update({ share_activo: next } as any).eq('id', l.id);
                          toast.success(next ? 'Catálogo activado' : 'Catálogo desactivado');
                          qc.invalidateQueries({ queryKey: ['lista_precios_all'] });
                        }}
                        className={cn('p-1 rounded transition-colors', l.share_activo ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                      {l.share_activo && l.share_token && (
                        <button
                          title="Copiar link del catálogo"
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = `${window.location.origin}/catalogo/${l.share_token}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Link copiado al portapapeles');
                          }}
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={(e) => { e.stopPropagation(); goToLista(l); }} className="text-primary hover:text-primary/80 p-1.5 rounded-md hover:bg-primary/5" title="Ver precios">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); goToLista(l); }} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: l.id, nombre: l.nombre }); }}
                        className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-destructive/5"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 && <OdooPagination from={1} to={total} total={total} />}
        </div>
      )}


      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar lista de precios?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la lista <strong>"{deleteTarget?.nombre}"</strong> y todos sus precios asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
