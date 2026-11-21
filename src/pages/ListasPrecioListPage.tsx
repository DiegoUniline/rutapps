import { useState } from 'react';
import { useSortableTable, SortableTh } from '@/hooks/useSortableTable';
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
import { ListPage, TABLE_CARD, SCROLL_AREA } from '@/components/layout/ListPage';
import { ListaTarjetaMovil, ListaTarjetasMovil, useCargarMasMovil } from '@/components/layout/ListaTarjetaMovil';

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
  const movil = useCargarMasMovil(filtered, search);
  const { sorted: listasOrdenadas, sort, toggle } = useSortableTable(filtered, (l: any, k) => {
    if (k === 'es_principal') return l.es_principal ? 0 : 1;
    if (k === 'activa') return l.activa ? 'Activa' : 'Inactiva';
    if (k === 'share_activo') return l.share_activo ? 0 : 1;
    return l[k];
  }, undefined, 'listas-precio');

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

  const toggleActiva = async (l: any) => {
    const next = !l.activa;
    try {
      const { error } = await supabase.from('lista_precios').update({ activa: next } as any).eq('id', l.id);
      if (error) throw error;
      // Also sync the parent tarifa so it's consistent everywhere
      if (l.tarifa_id) {
        await supabase.from('tarifas').update({ activa: next } as any).eq('id', l.tarifa_id);
      }
      toast.success(next ? 'Lista activada' : 'Lista desactivada');
      qc.invalidateQueries({ queryKey: ['lista_precios_all'] });
      qc.invalidateQueries({ queryKey: ['lista_precios'] });
      qc.invalidateQueries({ queryKey: ['tarifas'] });
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo cambiar el estado');
    }
  };

  const total = filtered.length;



  return (
    <ListPage>
      <ListPage.Toolbar>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Listas de Precios <VideoHelpButton module="tarifas" /></h1>
        <button onClick={() => navigate('/tarifas/nueva')} className="btn-odoo-primary shrink-0">
          <Plus className="h-3.5 w-3.5" /> Nueva lista
        </button>
      </div>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar lista..." />
      </ListPage.Toolbar>

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
      ) : isMobile ? (
        /* ─── Teléfono: renglones estándar ─── */
        <ListPage.Body card={false}>
          <ListaTarjetasMovil vacia={filtered.length === 0} mensajeVacio="No hay listas de precios." {...movil}>
            {movil.visibles.map(l => (
              <ListaTarjetaMovil
                key={l.id}
                titulo={l.nombre}
                linea2={l.es_principal ? '★ Principal' : 'Ver precios'}
                pildora={l.activa ? 'Activa' : 'Inactiva'}
                tono={l.activa ? 'exito' : 'neutro'}
                onClick={() => goToLista(l)}
                acciones={[
                  { key: 'activa', label: l.activa ? 'Desactivar' : 'Activar', onClick: () => toggleActiva(l) },
                  ...(!l.es_principal ? [{ key: 'principal', label: 'Hacer principal', icon: Star, onClick: () => setPrincipal(l) }] : []),
                ]}
              />
            ))}
          </ListaTarjetasMovil>
        </ListPage.Body>
      ) : (
        /* ─── Desktop: table layout ─── */
        <div className={TABLE_CARD}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <SortableTh sortKey="nombre" sort={sort} onToggle={toggle} className="th-odoo text-left">Nombre</SortableTh>
                <SortableTh sortKey="es_principal" sort={sort} onToggle={toggle} align="center" className="th-odoo text-center">Principal</SortableTh>
                <SortableTh sortKey="activa" sort={sort} onToggle={toggle} align="center" className="th-odoo text-center">Estado</SortableTh>
                <SortableTh sortKey="share_activo" sort={sort} onToggle={toggle} align="center" className="th-odoo text-center">Catálogo</SortableTh>
                <th className="th-odoo text-center w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">No hay listas de precios.</td></tr>
              )}
              {listasOrdenadas.map(l => (
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
                  <td className="py-1.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                    {l.es_principal ? (
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 mx-auto" />
                    ) : (
                      <button
                        onClick={() => setPrincipal(l)}
                        title="Marcar como principal"
                        className="text-muted-foreground hover:text-amber-500 transition-colors text-[11px] underline underline-offset-2"
                      >
                        Hacer principal
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleActiva(l)}
                      title={l.activa ? 'Clic para desactivar' : 'Clic para activar'}
                      className="focus:outline-none"
                    >
                      {l.activa
                        ? <span className="status-pill status-activo cursor-pointer">Activa</span>
                        : <span className="status-pill status-borrador cursor-pointer">Inactiva</span>}
                    </button>
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
            <AlertDialogAction onClick={confirmDelete} className="border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListPage>
  );
}
