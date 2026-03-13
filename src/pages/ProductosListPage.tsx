import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { OdooTabs } from '@/components/OdooTabs';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useProductos } from '@/hooks/useData';
import CatalogCRUD from '@/components/CatalogCRUD';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 80;

function ProductosTable() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const { data: productos, isLoading } = useProductos(search, statusFilter);

  const total = productos?.length ?? 0;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = productos?.slice(from - 1, to) ?? [];
  const allSelected = pageData.length > 0 && pageData.every(p => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map(p => p.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar por nombre o código..."
        >
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-odoo w-auto min-w-[120px]"
          >
            <option value="todos">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
            <option value="borrador">Borrador</option>
          </select>
        </OdooFilterBar>
        <button onClick={() => navigate('/productos/nuevo')} className="btn-odoo-primary shrink-0">
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={7} /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo w-10 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
                  </th>
                  <th className="th-odoo w-12">Img</th>
                  <th className="th-odoo text-left">Código</th>
                  <th className="th-odoo text-left">Nombre</th>
                  <th className="th-odoo text-left hidden md:table-cell">Marca</th>
                  <th className="th-odoo text-right">Precio</th>
                  <th className="th-odoo text-center hidden sm:table-cell">IVA</th>
                  <th className="th-odoo text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      No hay productos. Crea el primero.
                    </td>
                  </tr>
                )}
                {pageData.map(p => (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-table-border cursor-pointer transition-colors",
                      selected.has(p.id) ? "bg-primary/5" : "hover:bg-table-hover"
                    )}
                    onClick={() => navigate(`/productos/${p.id}`)}
                  >
                    <td className="py-1.5 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(p.id); }}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded border-input" />
                    </td>
                    <td className="py-1.5 px-3">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt="" className="h-7 w-7 rounded object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-secondary flex items-center justify-center text-xxs text-muted-foreground">—</div>
                      )}
                    </td>
                    <td className="py-1.5 px-3 font-mono text-xs">{p.codigo}</td>
                    <td className="py-1.5 px-3 font-medium">{p.nombre}</td>
                    <td className="py-1.5 px-3 hidden md:table-cell text-muted-foreground">{p.marcas?.nombre ?? '—'}</td>
                    <td className="py-1.5 px-3 text-right font-medium">${p.precio_principal?.toFixed(2)}</td>
                    <td className="py-1.5 px-3 hidden sm:table-cell text-center">
                      {p.tiene_iva ? (
                        <span className="text-xxs font-medium text-success">Sí</span>
                      ) : (
                        <span className="text-xxs text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <StatusChip status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > 0 && (
              <OdooPagination
                from={from}
                to={to}
                total={total}
                onPrev={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => p + 1)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ProductosListPage() {
  return (
    <div className="p-4 space-y-3 bg-secondary/50 min-h-full">
      <h1 className="text-xl font-semibold text-foreground">Productos & Catálogos</h1>
      <OdooTabs
        tabs={[
          { key: 'productos', label: 'Productos', content: <ProductosTable /> },
          { key: 'marcas', label: 'Marcas', content: <CatalogCRUD title="Marcas" tableName="marcas" queryKey="marcas" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
          { key: 'clasificaciones', label: 'Clasificaciones', content: <CatalogCRUD title="Clasificaciones" tableName="clasificaciones" queryKey="clasificaciones" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
          { key: 'proveedores', label: 'Proveedores', content: <CatalogCRUD title="Proveedores" tableName="proveedores" queryKey="proveedores" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
          { key: 'unidades', label: 'Unidades', content: <CatalogCRUD title="Unidades" tableName="unidades" queryKey="unidades" columns={[{ key: 'nombre', label: 'Nombre' }, { key: 'abreviatura', label: 'Abreviatura' }]} /> },
          { key: 'listas', label: 'Listas', content: <CatalogCRUD title="Listas" tableName="listas" queryKey="listas" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
          { key: 'almacenes', label: 'Almacenes', content: <CatalogCRUD title="Almacenes" tableName="almacenes" queryKey="almacenes" columns={[{ key: 'nombre', label: 'Nombre' }]} /> },
          { key: 'tasas_iva', label: 'Tasas IVA', content: <CatalogCRUD title="Tasas IVA" tableName="tasas_iva" queryKey="tasas_iva" columns={[{ key: 'nombre', label: 'Nombre' }, { key: 'porcentaje', label: 'Porcentaje %', type: 'number' }]} /> },
          { key: 'tasas_ieps', label: 'Tasas IEPS', content: <CatalogCRUD title="Tasas IEPS" tableName="tasas_ieps" queryKey="tasas_ieps" columns={[{ key: 'nombre', label: 'Nombre' }, { key: 'porcentaje', label: 'Porcentaje %', type: 'number' }]} /> },
        ]}
      />
    </div>
  );
}
