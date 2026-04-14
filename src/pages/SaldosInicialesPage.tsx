import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Search, Plus, Upload, Trash2, Landmark, Users, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fmtDate, todayLocal } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import SaldoInicialModal from '@/components/SaldoInicialModal';
import SaldoInicialImportDialog from '@/components/SaldoInicialImportDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ClienteRow {
  clienteId: string;
  codigo: string;
  nombre: string;
  monto: string;
  fecha: string;
  fechaVencimiento: string;
  concepto: string;
  touched: boolean;
}

export default function SaldosInicialesPage() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [tab, setTab] = useState('registrados');

  // ─── Registered balances ─────────────────────────────────────
  const { data: saldos, isLoading } = useQuery({
    queryKey: ['saldos-iniciales', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, concepto, fecha_vencimiento, clientes(nombre, codigo)')
        .eq('empresa_id', empresa!.id)
        .eq('es_saldo_inicial', true)
        .order('fecha', { ascending: false });
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(v =>
          (v.folio ?? '').toLowerCase().includes(s) ||
          ((v.clientes as any)?.nombre ?? '').toLowerCase().includes(s) ||
          ((v.clientes as any)?.codigo ?? '').toLowerCase().includes(s)
        );
      }
      return filtered;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Saldo inicial eliminado');
      qc.invalidateQueries({ queryKey: ['saldos-iniciales'] });
      qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalOriginal = saldos?.reduce((s, v) => s + (v.total ?? 0), 0) ?? 0;
  const totalPendiente = saldos?.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0) ?? 0;

  // ─── Bulk loader ─────────────────────────────────────────────
  const [bulkRows, setBulkRows] = useState<ClienteRow[]>([]);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkLoaded, setBulkLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: clientes } = useQuery({
    queryKey: ['clientes-bulk', empresa?.id],
    enabled: !!empresa?.id && tab === 'masivo',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, codigo, nombre')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('codigo');
      if (error) throw error;
      return data ?? [];
    },
  });

  const loadAllClientes = () => {
    if (!clientes?.length) { toast.info('No hay clientes activos'); return; }
    const today = todayLocal();
    setBulkRows(clientes.map(c => ({
      clienteId: c.id,
      codigo: c.codigo ?? '',
      nombre: c.nombre,
      monto: '',
      fecha: today,
      fechaVencimiento: '',
      concepto: 'Saldo anterior',
      touched: false,
    })));
    setBulkLoaded(true);
  };

  const updateBulkRow = (idx: number, field: keyof ClienteRow, value: string) => {
    setBulkRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, [field]: value, touched: true } : r
    ));
  };

  const filteredBulk = useMemo(() => {
    if (!bulkSearch) return bulkRows;
    const s = bulkSearch.toLowerCase();
    return bulkRows.filter(r =>
      r.codigo.toLowerCase().includes(s) || r.nombre.toLowerCase().includes(s)
    );
  }, [bulkRows, bulkSearch]);

  const rowsToSave = bulkRows.filter(r => {
    const m = parseFloat(r.monto);
    return !isNaN(m) && m > 0;
  });

  const saveBulk = async () => {
    if (rowsToSave.length === 0) { toast.info('No hay montos capturados'); return; }
    setSaving(true);
    let ok = 0;
    const errors: string[] = [];

    for (const row of rowsToSave) {
      try {
        const { error } = await supabase.rpc('registrar_saldo_inicial', {
          p_empresa_id: empresa!.id,
          p_cliente_id: row.clienteId,
          p_monto: parseFloat(row.monto),
          p_fecha: row.fecha || todayLocal(),
          p_concepto: row.concepto || 'Saldo anterior',
          p_fecha_vencimiento: row.fechaVencimiento || null,
        });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        errors.push(`${row.codigo}: ${e.message}`);
      }
    }

    if (ok > 0) {
      toast.success(`${ok} saldo(s) registrados correctamente`);
      qc.invalidateQueries({ queryKey: ['saldos-iniciales'] });
      qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      // Clear saved rows
      setBulkRows(prev => prev.map(r => {
        const m = parseFloat(r.monto);
        if (!isNaN(m) && m > 0 && !errors.some(e => e.startsWith(r.codigo))) {
          return { ...r, monto: '', touched: false };
        }
        return r;
      }));
    }
    if (errors.length > 0) {
      toast.error(`${errors.length} error(es): ${errors[0]}`);
    }
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Landmark className="h-5 w-5" /> Saldos Iniciales
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Importar Excel
          </Button>
          <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Registrar saldo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Registros</p>
          <p className="text-2xl font-bold text-foreground">{saldos?.length ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Monto original</p>
          <p className="text-2xl font-bold text-foreground">{fmt(totalOriginal)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Pendiente</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendiente)}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="registrados">Registrados</TabsTrigger>
          <TabsTrigger value="masivo" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Carga masiva
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Registrados ═══ */}
        <TabsContent value="registrados" className="space-y-4 mt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente o folio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Folio</TableHead>
                  <TableHead className="text-[11px]">Cliente</TableHead>
                  <TableHead className="text-[11px]">Fecha</TableHead>
                  <TableHead className="text-[11px]">Concepto</TableHead>
                  <TableHead className="text-[11px] text-right">Monto original</TableHead>
                  <TableHead className="text-[11px] text-right">Pendiente</TableHead>
                  <TableHead className="text-[11px]">Vencimiento</TableHead>
                  <TableHead className="text-[11px] w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saldos?.map(v => {
                  const canDelete = (v.saldo_pendiente ?? 0) === (v.total ?? 0);
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-[11px]">
                        {v.folio ?? v.id.slice(0, 8)}
                        <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">Saldo Inicial</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-[12px]">
                        <span className="text-muted-foreground text-[10px] mr-1">{(v.clientes as any)?.codigo}</span>
                        {(v.clientes as any)?.nombre ?? '—'}
                      </TableCell>
                      <TableCell className="text-[12px]">{fmtDate(v.fecha)}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{v.concepto || 'Saldo anterior'}</TableCell>
                      <TableCell className="text-right text-[12px]">{fmt(v.total ?? 0)}</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{fmt(v.saldo_pendiente ?? 0)}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{v.fecha_vencimiento ? fmtDate(v.fecha_vencimiento) : '—'}</TableCell>
                      <TableCell>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteId(v.id)}
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                            title="Eliminar saldo inicial"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
                {!isLoading && saldos?.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin saldos iniciales registrados</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ═══ TAB: Carga masiva ═══ */}
        <TabsContent value="masivo" className="space-y-4 mt-4">
          {!bulkLoaded ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
              <Users className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Carga todos tus clientes en pantalla para capturar saldos iniciales de forma masiva.
              </p>
              <Button onClick={loadAllClientes} className="gap-2">
                <Users className="h-4 w-4" /> Cargar todos los clientes
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="relative max-w-sm flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar cliente..." className="pl-9" value={bulkSearch} onChange={e => setBulkSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {rowsToSave.length} de {bulkRows.length} con monto
                  </span>
                  <Button onClick={saveBulk} disabled={saving || rowsToSave.length === 0} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar {rowsToSave.length > 0 ? `(${rowsToSave.length})` : ''}
                  </Button>
                </div>
              </div>

              <div className="bg-card border border-border rounded overflow-x-auto max-h-[65vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="text-[11px] w-24">Código</TableHead>
                      <TableHead className="text-[11px]">Cliente</TableHead>
                      <TableHead className="text-[11px] w-32">Monto *</TableHead>
                      <TableHead className="text-[11px] w-36">Fecha</TableHead>
                      <TableHead className="text-[11px] w-36">Vencimiento</TableHead>
                      <TableHead className="text-[11px] w-40">Concepto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBulk.map((row, visibleIdx) => {
                      const realIdx = bulkRows.findIndex(r => r.clienteId === row.clienteId);
                      const hasMonto = row.monto && parseFloat(row.monto) > 0;
                      return (
                        <TableRow key={row.clienteId} className={hasMonto ? 'bg-primary/5' : ''}>
                          <TableCell className="font-mono text-[11px] text-muted-foreground">{row.codigo}</TableCell>
                          <TableCell className="font-medium text-[12px]">{row.nombre}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              className="h-8 text-[12px]"
                              tabIndex={visibleIdx + 1}
                              value={row.monto}
                              onChange={e => updateBulkRow(realIdx, 'monto', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              className="h-8 text-[12px]"
                              tabIndex={-1}
                              value={row.fecha}
                              onChange={e => updateBulkRow(realIdx, 'fecha', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              className="h-8 text-[12px]"
                              tabIndex={-1}
                              value={row.fechaVencimiento}
                              onChange={e => updateBulkRow(realIdx, 'fechaVencimiento', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-[12px]"
                              placeholder="Saldo anterior"
                              tabIndex={-1}
                              value={row.concepto}
                              onChange={e => updateBulkRow(realIdx, 'concepto', e.target.value)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <SaldoInicialModal open={showModal} onOpenChange={setShowModal} />
      <SaldoInicialImportDialog open={showImport} onOpenChange={setShowImport} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar saldo inicial?</AlertDialogTitle>
            <AlertDialogDescription>Solo se puede eliminar si no tiene abonos aplicados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
