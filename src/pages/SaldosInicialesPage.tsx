import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Search, Plus, Upload, Trash2, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import SaldoInicialModal from '@/components/SaldoInicialModal';
import SaldoInicialImportDialog from '@/components/SaldoInicialImportDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SaldosInicialesPage() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: saldos, isLoading } = useQuery({
    queryKey: ['saldos-iniciales', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, concepto, clientes(nombre, codigo)')
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
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && saldos?.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin saldos iniciales registrados</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
