import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardList, Plus, Search, Eye, Smartphone, Warehouse } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import CrearConteoDialog from '@/components/conteos/CrearConteoDialog';
import ConteoDetailModal from '@/components/conteos/ConteoDetailModal';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  abierto: { label: 'Abierto', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  en_progreso: { label: 'En Progreso', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  cerrado: { label: 'Cerrado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ConteosFisicosPage() {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: conteos, isLoading } = useQuery({
    queryKey: ['conteos-fisicos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conteos_fisicos')
        .select('*, almacenes(nombre), clasificaciones(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = conteos ?? [];
    if (statusFilter !== 'todos') list = list.filter((c: any) => c.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c: any) =>
        c.folio.toLowerCase().includes(s) ||
        (c.almacenes as any)?.nombre?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [conteos, statusFilter, search]);

  const activos = (conteos ?? []).filter((c: any) => c.status === 'abierto' || c.status === 'en_progreso').length;
  const total = (conteos ?? []).length;
  const difTotal = (conteos ?? []).filter((c: any) => c.status === 'cerrado').reduce((s: number, c: any) => s + (c.diferencia_total_valor ?? 0), 0);

  const filters = [
    { key: 'todos', label: 'Todos' },
    { key: 'abierto', label: 'Abierto' },
    { key: 'en_progreso', label: 'En Progreso' },
    { key: 'cerrado', label: 'Cerrado' },
    { key: 'cancelado', label: 'Cancelado' },
  ];

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Conteos Físicos
        </h1>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Activos</p>
          <p className="text-2xl font-bold">{activos}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Diferencia (cerrados)</p>
          <p className={cn("text-2xl font-bold", difTotal >= 0 ? "text-green-600" : "text-red-600")}>
            $ {fmt(difTotal)}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              statusFilter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9 h-8 w-48" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Almacén</TableHead>
              <TableHead className="text-[11px]">Progreso</TableHead>
              <TableHead className="text-[11px]">Estado</TableHead>
              <TableHead className="text-[11px]">Apertura</TableHead>
              <TableHead className="text-[11px] text-right">Diferencia</TableHead>
              <TableHead className="text-[11px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin conteos</TableCell></TableRow>
            )}
            {filtered.map((c: any) => {
              const st = STATUS_MAP[c.status] ?? STATUS_MAP.abierto;
              const pct = c.total_productos > 0 ? Math.round((c.productos_contados / c.total_productos) * 100) : 0;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.folio}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <Warehouse className="h-3 w-3 text-muted-foreground" />
                      {(c.almacenes as any)?.nombre ?? '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{c.productos_contados}/{c.total_productos}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", st.color)}>{st.label}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(c.abierto_en), 'dd/MM/yy HH:mm', { locale: es })}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {c.status === 'cerrado' ? (
                      <span className={c.diferencia_total_valor >= 0 ? "text-green-600" : "text-red-600"}>
                        $ {fmt(c.diferencia_total_valor ?? 0)}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedId(c.id)} title="Ver detalle">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {(c.status === 'abierto' || c.status === 'en_progreso') && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/conteo/${c.id}`)} title="Ir a contar">
                          <Smartphone className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {showCreate && (
        <CrearConteoDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['conteos-fisicos'] });
          }}
        />
      )}

      {selectedId && (
        <ConteoDetailModal
          conteoId={selectedId}
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
