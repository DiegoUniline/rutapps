import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusChip } from '@/components/StatusChip';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useProductos } from '@/hooks/useData';

export default function ProductosListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const { data: productos, isLoading } = useProductos(search, statusFilter);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Productos</h1>
        <Button onClick={() => navigate('/productos/nuevo')} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="h-4 w-4 mr-1.5" /> Nuevo Producto
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="inactivo">Inactivo</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="section-card overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Img</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Marca</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="hidden sm:table-cell text-center">IVA</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No hay productos. Crea el primero.
                  </TableCell>
                </TableRow>
              )}
              {productos?.map(p => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/productos/${p.id}`)}
                >
                  <TableCell>
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        —
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{p.codigo}</TableCell>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{p.marcas?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">${p.precio_principal?.toFixed(2)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    {p.tiene_iva ? (
                      <span className="text-xs font-medium text-success">Sí</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusChip status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
