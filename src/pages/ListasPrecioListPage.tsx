import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Pencil, Trash2, Check, X, Link2, Copy, Eye, ChevronRight } from 'lucide-react';
import VideoHelpButton from '@/components/VideoHelpButton';
import { TableSkeleton } from '@/components/TableSkeleton';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { useAllListasPrecios, useSaveListaPrecio, useDeleteListaPrecio } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function ListasPrecioListPage() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const { data: listas, isLoading } = useAllListasPrecios(empresa?.id);
  const qc = useQueryClient();
  const saveMutation = useSaveListaPrecio();
  const deleteMutation = useDeleteListaPrecio();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newPrincipal, setNewPrincipal] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPrincipal, setEditPrincipal] = useState(false);

  const filtered = listas?.filter(l =>
    !search || l.nombre.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleCreate = async () => {
    if (!newNombre.trim()) { toast.error('Escribe un nombre'); return; }
    try {
      await saveMutation.mutateAsync({ nombre: newNombre.trim(), es_principal: newPrincipal });
      toast.success('Lista creada');
      setShowNew(false);
      setNewNombre('');
      setNewPrincipal(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const startEdit = (l: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditId(l.id);
    setEditNombre(l.nombre);
    setEditPrincipal(l.es_principal);
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    if (!editNombre.trim()) { toast.error('Escribe un nombre'); return; }
    const original = listas?.find(l => l.id === editId);
    try {
      await saveMutation.mutateAsync({ id: editId, tarifa_id: original?.tarifa_id, nombre: editNombre.trim(), es_principal: editPrincipal });
      toast.success('Lista actualizada');
      setEditId(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string, nombre: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar la lista "${nombre}"?`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Lista eliminada');
    } catch (err: any) { toast.error(err.message); }
  };

  const goToLista = (l: any) => {
    if (editId === l.id) return;
    navigate(`/tarifas/${l.tarifa_id}?lista=${encodeURIComponent(l.nombre)}`);
  };

  const total = filtered.length;

  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Listas de Precios <VideoHelpButton module="tarifas" /></h1>
        <button onClick={() => setShowNew(true)} className="btn-odoo-primary shrink-0">
          <Plus className="h-3.5 w-3.5" /> Nueva lista
        </button>
      </div>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar lista..." />

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
      ) : isMobile ? (
        /* ─── Mobile: card layout ─── */
        <div className="space-y-2">
          {showNew && (
            <div className="bg-card border border-primary/30 rounded-xl p-3 space-y-2">
              <input autoFocus type="text" className="input-odoo text-sm w-full" placeholder="Nombre de la lista"
                value={newNombre} onChange={e => setNewNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false); }}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={newPrincipal} onChange={e => setNewPrincipal(e.target.checked)} className="rounded border-input" />
                  Principal
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent">Cancelar</button>
                  <button onClick={handleCreate} className="px-3 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground font-semibold">Crear</button>
                </div>
              </div>
            </div>
          )}
          {filtered.length === 0 && !showNew && (
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
              {showNew && (
                <tr className="border-b border-table-border bg-primary/5">
                  <td className="py-1.5 px-3">
                    <input autoFocus type="text" className="input-odoo text-xs w-full" placeholder="Nombre de la lista"
                      value={newNombre} onChange={e => setNewNombre(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false); }}
                    />
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <input type="checkbox" checked={newPrincipal} onChange={e => setNewPrincipal(e.target.checked)} className="rounded border-input" />
                  </td>
                  <td className="py-1.5 px-3 text-center"><span className="status-pill status-activo">Activa</span></td>
                  <td className="py-1.5 px-3 text-center text-muted-foreground text-xs">—</td>
                  <td className="py-1.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={handleCreate} className="text-primary hover:text-primary/80 p-1"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-destructive p-1"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.length === 0 && !showNew && (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">No hay listas de precios.</td></tr>
              )}
              {filtered.map(l => {
                const isEditing = editId === l.id;
                return (
                  <tr
                    key={l.id}
                    className={cn("border-b border-table-border transition-colors cursor-pointer", isEditing ? "bg-primary/5" : "hover:bg-table-hover")}
                    onClick={() => goToLista(l)}
                  >
                    <td className="py-1.5 px-3">
                      {isEditing ? (
                        <input autoFocus type="text" className="input-odoo text-xs w-full" value={editNombre}
                          onChange={e => setEditNombre(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditId(null); }}
                        />
                      ) : (
                        <span className="font-medium flex items-center gap-1.5 text-foreground">
                          {l.es_principal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                          {l.nombre}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {isEditing ? (
                        <input type="checkbox" checked={editPrincipal} onChange={e => setEditPrincipal(e.target.checked)} onClick={e => e.stopPropagation()} className="rounded border-input" />
                      ) : (
                        l.es_principal ? <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 mx-auto" /> : <span className="text-muted-foreground">—</span>
                      )}
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
                        {isEditing ? (
                          <>
                            <button onClick={handleSaveEdit} className="text-primary hover:text-primary/80 p-1" title="Guardar"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-destructive p-1" title="Cancelar"><X className="h-3.5 w-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); goToLista(l); }} className="text-primary hover:text-primary/80 p-1.5 rounded-md hover:bg-primary/5" title="Ver precios">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={(e) => startEdit(l, e)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent" title="Editar nombre">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={(e) => handleDelete(l.id, l.nombre, e)} className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-destructive/5" title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > 0 && <OdooPagination from={1} to={total} total={total} />}
        </div>
      )}
    </div>
  );
}