import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Star, Pencil, Trash2, Check, X, Link2, LinkIcon, Copy } from 'lucide-react';
import { TableSkeleton } from '@/components/TableSkeleton';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { useAllListasPrecios, useSaveListaPrecio, useDeleteListaPrecio, useTarifasForSelect } from '@/hooks/useData';
import SearchableSelect from '@/components/SearchableSelect';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function ListasPrecioListPage() {
  const navigate = useNavigate();
  const { data: listas, isLoading } = useAllListasPrecios();
  const { data: tarifas } = useTarifasForSelect();
  const saveMutation = useSaveListaPrecio();
  const deleteMutation = useDeleteListaPrecio();

  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newTarifaId, setNewTarifaId] = useState('');
  const [newPrincipal, setNewPrincipal] = useState(false);

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editTarifaId, setEditTarifaId] = useState('');
  const [editPrincipal, setEditPrincipal] = useState(false);

  const tarifaMap = new Map((tarifas ?? []).map(t => [t.id, t.nombre]));
  const tarifaOptions = (tarifas ?? []).map(t => ({ value: t.id, label: t.nombre }));

  const filtered = listas?.filter(l =>
    !search || l.nombre.toLowerCase().includes(search.toLowerCase()) || (tarifaMap.get(l.tarifa_id) ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleCreate = async () => {
    if (!newNombre.trim()) { toast.error('Escribe un nombre'); return; }
    if (!newTarifaId) { toast.error('Selecciona una tarifa'); return; }
    try {
      await saveMutation.mutateAsync({ tarifa_id: newTarifaId, nombre: newNombre.trim(), es_principal: newPrincipal });
      toast.success('Lista creada');
      setShowNew(false);
      setNewNombre('');
      setNewTarifaId('');
      setNewPrincipal(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const startEdit = (l: any) => {
    setEditId(l.id);
    setEditNombre(l.nombre);
    setEditTarifaId(l.tarifa_id);
    setEditPrincipal(l.es_principal);
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    if (!editNombre.trim()) { toast.error('Escribe un nombre'); return; }
    if (!editTarifaId) { toast.error('Selecciona una tarifa'); return; }
    try {
      await saveMutation.mutateAsync({ id: editId, tarifa_id: editTarifaId, nombre: editNombre.trim(), es_principal: editPrincipal });
      toast.success('Lista actualizada');
      setEditId(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar la lista "${nombre}"?`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Lista eliminada');
    } catch (err: any) { toast.error(err.message); }
  };

  const total = filtered.length;

  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Listas de Precios</h1>
        <button onClick={() => setShowNew(true)} className="btn-odoo-primary shrink-0">
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </button>
      </div>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar lista o tarifa..." />

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                 <th className="th-odoo text-left">Nombre</th>
                  <th className="th-odoo text-left">Tarifa</th>
                  <th className="th-odoo text-center">Principal</th>
                  <th className="th-odoo text-center">Estado</th>
                  <th className="th-odoo text-center">Catálogo</th>
                  <th className="th-odoo text-center w-24">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {/* New row */}
                {showNew && (
                  <tr className="border-b border-table-border bg-primary/5">
                    <td className="py-1.5 px-3">
                      <input autoFocus type="text" className="input-odoo text-xs w-full" placeholder="Nombre de la lista"
                        value={newNombre} onChange={e => setNewNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false); }}
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <SearchableSelect
                        options={tarifaOptions}
                        value={newTarifaId}
                        onChange={setNewTarifaId}
                        placeholder="Seleccionar tarifa..."
                      />
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <input type="checkbox" checked={newPrincipal} onChange={e => setNewPrincipal(e.target.checked)} className="rounded border-input" />
                    </td>
                     <td className="py-1.5 px-3 text-center">
                       <span className="status-pill status-activo">Activa</span>
                     </td>
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
                   <tr>
                     <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">No hay listas de precios.</td>
                  </tr>
                )}
                {filtered.map(l => {
                  const isEditing = editId === l.id;
                  return (
                    <tr key={l.id} className={cn("border-b border-table-border transition-colors", isEditing ? "bg-primary/5" : "hover:bg-table-hover")}>
                      <td className="py-1.5 px-3">
                        {isEditing ? (
                          <input autoFocus type="text" className="input-odoo text-xs w-full" value={editNombre}
                            onChange={e => setEditNombre(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditId(null); }}
                          />
                        ) : (
                          <span className="font-medium flex items-center gap-1.5">
                            {l.es_principal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                            {l.nombre}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3">
                        {isEditing ? (
                          <SearchableSelect
                            options={tarifaOptions}
                            value={editTarifaId}
                            onChange={setEditTarifaId}
                            placeholder="Seleccionar tarifa..."
                          />
                        ) : (
                          <span className="text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => navigate(`/tarifas/${l.tarifa_id}`)}>
                            {tarifaMap.get(l.tarifa_id) ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        {isEditing ? (
                          <input type="checkbox" checked={editPrincipal} onChange={e => setEditPrincipal(e.target.checked)} className="rounded border-input" />
                        ) : (
                          l.es_principal ? <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 mx-auto" /> : <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        {l.activa
                          ? <span className="status-pill status-activo">Activa</span>
                          : <span className="status-pill status-borrador">Inactiva</span>
                        }
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <>
                              <button onClick={handleSaveEdit} className="text-primary hover:text-primary/80 p-1"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-destructive p-1"><X className="h-3.5 w-3.5" /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(l)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDelete(l.id, l.nombre)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
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
          </>
        )}
      </div>
    </div>
  );
}
