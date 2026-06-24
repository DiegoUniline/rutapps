import { useMemo, useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Wallet, Search, ExternalLink, Loader2, CalendarIcon, ChevronDown, ChevronRight, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  onSelectEmpresa: (empresaId: string, tab?: 'pagos') => void;
}

const fmtMXN = (v: number) =>
  `$${(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Row = {
  id: string;
  fecha: string;
  empresa_id: string;
  empresa_nombre: string;
  factura: string;
  monto: number;
  metodo: string;
  origen: 'automatico' | 'manual';
  referencia: string | null;
};

type GroupBy = 'ninguno' | 'anio' | 'mes' | 'metodo' | 'origen' | 'empresa';

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function AdminPagosTab({ onSelectEmpresa }: Props) {
  const [search, setSearch] = useState('');
  const [metodo, setMetodo] = useState<string>('todos');
  const [origen, setOrigen] = useState<string>('todos');
  const [empresaId, setEmpresaId] = useState<string>('todos');
  const [desde, setDesde] = useState<Date | undefined>();
  const [hasta, setHasta] = useState<Date | undefined>();
  const [groupBy, setGroupBy] = useState<GroupBy>('ninguno');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-pagos-global'],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      for (;;) {
        const { data, error } = await supabase
          .from('facturas')
          .select('id, fecha_pago, fecha_emision, numero_factura, total, metodo_pago, stripe_payment_intent_id, referencia_pago, empresa_id, empresas(nombre)')
          .eq('estado', 'pagada')
          .order('fecha_pago', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return all.map<Row>((f) => ({
        id: f.id,
        fecha: f.fecha_pago || f.fecha_emision,
        empresa_id: f.empresa_id,
        empresa_nombre: (f.empresas as any)?.nombre || '—',
        factura: f.numero_factura || 'sin folio',
        monto: Number(f.total || 0),
        metodo: f.metodo_pago || (f.stripe_payment_intent_id ? 'stripe' : 'manual'),
        origen: f.stripe_payment_intent_id && !f.metodo_pago ? 'automatico' : 'manual',
        referencia: f.referencia_pago,
      }));
    },
  });

  const metodos = useMemo(() => Array.from(new Set(rows.map((r) => r.metodo))).sort(), [rows]);
  const empresas = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.empresa_id, r.empresa_nombre));
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const desdeTs = desde ? new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).getTime() : null;
    const hastaTs = hasta ? new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(), 23, 59, 59).getTime() : null;
    return rows.filter((r) => {
      if (metodo !== 'todos' && r.metodo !== metodo) return false;
      if (origen !== 'todos' && r.origen !== origen) return false;
      if (empresaId !== 'todos' && r.empresa_id !== empresaId) return false;
      if (desdeTs || hastaTs) {
        if (!r.fecha) return false;
        const t = new Date(r.fecha).getTime();
        if (desdeTs && t < desdeTs) return false;
        if (hastaTs && t > hastaTs) return false;
      }
      if (q) {
        return (
          r.empresa_nombre.toLowerCase().includes(q) ||
          r.factura.toLowerCase().includes(q) ||
          (r.referencia || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, metodo, origen, empresaId, desde, hasta]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.monto, 0), [filtered]);

  const grouped = useMemo(() => {
    if (groupBy === 'ninguno') return null;
    const keyOf = (r: Row) => {
      if (!r.fecha && (groupBy === 'anio' || groupBy === 'mes')) return 'Sin fecha';
      const d = r.fecha ? new Date(r.fecha) : null;
      switch (groupBy) {
        case 'anio': return String(d!.getFullYear());
        case 'mes': return `${d!.getFullYear()}-${String(d!.getMonth() + 1).padStart(2, '0')}`;
        case 'metodo': return r.metodo;
        case 'origen': return r.origen;
        case 'empresa': return `${r.empresa_id}||${r.empresa_nombre}`;
      }
    };
    const labelOf = (k: string) => {
      if (groupBy === 'mes' && /^\d{4}-\d{2}$/.test(k)) {
        const [y, m] = k.split('-');
        return `${MESES_ES[Number(m) - 1]} ${y}`;
      }
      if (groupBy === 'empresa') return k.split('||')[1] || k;
      if (groupBy === 'origen') return k === 'automatico' ? 'Automático' : 'Manual';
      return k;
    };
    const map = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    const out = Array.from(map.entries()).map(([k, items]) => ({
      key: k,
      label: labelOf(k),
      items,
      total: items.reduce((s, r) => s + r.monto, 0),
      count: items.length,
    }));
    out.sort((a, b) => {
      if (groupBy === 'anio' || groupBy === 'mes') return b.key.localeCompare(a.key);
      return b.total - a.total;
    });
    return out;
  }, [filtered, groupBy]);

  const toggleGroup = (k: string) => setOpenGroups((p) => ({ ...p, [k]: !p[k] }));

  const clearFilters = () => {
    setSearch(''); setMetodo('todos'); setOrigen('todos'); setEmpresaId('todos');
    setDesde(undefined); setHasta(undefined); setGroupBy('ninguno');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Pagos registrados
          </h1>
          <p className="text-xs text-muted-foreground">Todas las facturas pagadas de la plataforma</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">Total filtrado</div>
            <div className="text-lg font-bold tabular-nums">{fmtMXN(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">Pagos</div>
            <div className="text-lg font-bold tabular-nums">{filtered.length}</div>
          </div>
        </div>
      </div>

      {/* Filtros fila 1: búsqueda */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa, factura o referencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filtros fila 2: selects + fechas + agrupar */}
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="todos">Todas las empresas</SelectItem>
              {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={metodo} onValueChange={setMetodo}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Método" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los métodos</SelectItem>
              {metodos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={origen} onValueChange={setOrigen}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Origen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los orígenes</SelectItem>
              <SelectItem value="automatico">Automático</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start text-left font-normal w-[150px]', !desde && 'text-muted-foreground')}>
                <CalendarIcon className="h-4 w-4 mr-2" />
                {desde ? format(desde, 'dd/MM/yyyy') : 'Desde'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={desde} onSelect={setDesde} initialFocus locale={es} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start text-left font-normal w-[150px]', !hasta && 'text-muted-foreground')}>
                <CalendarIcon className="h-4 w-4 mr-2" />
                {hasta ? format(hasta, 'dd/MM/yyyy') : 'Hasta'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={hasta} onSelect={setHasta} initialFocus locale={es} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Select value={groupBy} onValueChange={(v: GroupBy) => setGroupBy(v)}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Agrupar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguno">Sin agrupar</SelectItem>
              <SelectItem value="anio">Agrupar por año</SelectItem>
              <SelectItem value="mes">Agrupar por mes</SelectItem>
              <SelectItem value="metodo">Agrupar por método</SelectItem>
              <SelectItem value="origen">Agrupar por origen</SelectItem>
              <SelectItem value="empresa">Agrupar por empresa</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Limpiar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando pagos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Sin pagos</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped ? (
                    grouped.map((g) => {
                      const open = openGroups[g.key] ?? true;
                      return (
                        <Fragment key={g.key}>
                          <TableRow className="bg-muted/40 hover:bg-muted/60 cursor-pointer" onClick={() => toggleGroup(g.key)}>
                            <TableCell colSpan={6} className="font-semibold">
                              <div className="flex items-center gap-2">
                                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                {g.label}
                                <Badge variant="secondary" className="ml-1">{g.count}</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold tabular-nums">{fmtMXN(g.total)}</TableCell>
                            <TableCell />
                          </TableRow>
                          {open && g.items.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {p.fecha ? format(new Date(p.fecha), 'dd/MM/yyyy') : '—'}
                              </TableCell>
                              <TableCell className="font-medium">{p.empresa_nombre}</TableCell>
                              <TableCell className="text-sm">{p.factura}</TableCell>
                              <TableCell><Badge variant="outline">{p.metodo}</Badge></TableCell>
                              <TableCell>
                                <Badge variant={p.origen === 'automatico' ? 'default' : 'secondary'}>
                                  {p.origen === 'automatico' ? 'Automático' : 'Manual'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{p.referencia || '—'}</TableCell>
                              <TableCell className="text-right font-bold tabular-nums">{fmtMXN(p.monto)}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="outline" onClick={() => onSelectEmpresa(p.empresa_id, 'pagos')} className="gap-1.5">
                                  <ExternalLink className="h-3.5 w-3.5" /> Ver empresa
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })
                  ) : (
                    filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {p.fecha ? format(new Date(p.fecha), 'dd/MM/yyyy') : '—'}
                        </TableCell>
                        <TableCell className="font-medium">{p.empresa_nombre}</TableCell>
                        <TableCell className="text-sm">{p.factura}</TableCell>
                        <TableCell><Badge variant="outline">{p.metodo}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={p.origen === 'automatico' ? 'default' : 'secondary'}>
                            {p.origen === 'automatico' ? 'Automático' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.referencia || '—'}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{fmtMXN(p.monto)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => onSelectEmpresa(p.empresa_id, 'pagos')} className="gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" /> Ver empresa
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="bg-primary/5 font-bold">
                    <TableCell colSpan={6} className="text-right">TOTAL</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMXN(total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
