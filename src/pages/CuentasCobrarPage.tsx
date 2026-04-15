import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { CreditCard, Search, Banknote, Plus, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn, fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import SaldoInicialModal from '@/components/SaldoInicialModal';
import SaldoInicialImportDialog from '@/components/SaldoInicialImportDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function useCuentasCobrar(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cuentas-cobrar', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status, es_saldo_inicial, concepto, clientes(nombre, codigo), vendedores:profiles!vendedor_id(nombre)')
        .eq('empresa_id', empresa!.id)
        .gt('saldo_pendiente', 0)
        .order('fecha', { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(v =>
          (v.folio ?? '').toLowerCase().includes(s) ||
          ((v.clientes as any)?.nombre ?? '').toLowerCase().includes(s)
        );
      }
      return filtered;
    },
  });
}

export default function CuentasCobrarPage() {
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: cuentas, isLoading } = useCuentasCobrar(search);
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Saldo inicial eliminado');
      qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      qc.invalidateQueries({ queryKey: ['saldos-iniciales'] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalPendiente = cuentas?.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0) ?? 0;
  const totalVentas = cuentas?.reduce((s, v) => s + (v.total ?? 0), 0) ?? 0;

  const today = new Date();
  const aging = { corriente: 0, d30: 0, d60: 0, d90: 0, masD90: 0 };
  cuentas?.forEach(v => {
    const dias = Math.floor((today.getTime() - new Date(v.fecha).getTime()) / 86400000);
    const saldo = v.saldo_pendiente ?? 0;
    if (dias <= 15) aging.corriente += saldo;
    else if (dias <= 30) aging.d30 += saldo;
    else if (dias <= 60) aging.d60 += saldo;
    else if (dias <= 90) aging.d90 += saldo;
    else aging.masD90 += saldo;
  });

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Cuentas por cobrar
          <HelpButton title={HELP.cuentasCobrar.title} sections={HELP.cuentasCobrar.sections} />
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Importar saldos
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Saldo inicial
          </Button>
          <Button onClick={() => navigate('/finanzas/aplicar-pagos')} className="gap-2" size="sm">
            <Banknote className="h-4 w-4" /> Aplicar pagos
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total pendiente</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendiente)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Documentos</p>
          <p className="text-2xl font-bold text-foreground">{cuentas?.length ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Venta total</p>
          <p className="text-2xl font-bold text-foreground">{fmt(totalVentas)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">% Cobrado</p>
          <p className="text-2xl font-bold text-success">{totalVentas > 0 ? Math.round(((totalVentas - totalPendiente) / totalVentas) * 100) : 0}%</p>
        </div>
      </div>

      {/* Aging */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Antigüedad de saldos</h3>
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { label: 'Corriente', val: aging.corriente, color: 'text-success' },
            { label: '16-30 días', val: aging.d30, color: 'text-warning' },
            { label: '31-60 días', val: aging.d60, color: 'text-orange-500' },
            { label: '61-90 días', val: aging.d90, color: 'text-destructive' },
            { label: '+90 días', val: aging.masD90, color: 'text-destructive font-bold' },
          ].map(a => (
            <div key={a.label}>
              <p className="text-[10px] text-muted-foreground">{a.label}</p>
              <p className={cn("text-sm font-bold", a.color)}>{fmt(a.val)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por folio o cliente..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px]">Condición</TableHead>
              <TableHead className="text-[11px] text-right">Total</TableHead>
              <TableHead className="text-[11px] text-right">Pagado</TableHead>
              <TableHead className="text-[11px] text-right">Pendiente</TableHead>
              <TableHead className="text-[11px] w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas?.map(v => {
              const pagado = (v.total ?? 0) - (v.saldo_pendiente ?? 0);
              const esSaldo = v.es_saldo_inicial === true;
              const canDelete = esSaldo && (v.saldo_pendiente ?? 0) === (v.total ?? 0);
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-[11px]">
                    {v.folio ?? v.id.slice(0, 8)}
                    {esSaldo && (
                      <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">Saldo Inicial</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-[12px]">{(v.clientes as any)?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">{(v.vendedores as any)?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px]">{fmtDate(v.fecha)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {esSaldo ? (v.concepto || 'Saldo anterior') : v.condicion_pago}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-[12px]">{fmt(v.total ?? 0)}</TableCell>
                  <TableCell className="text-right text-[12px] text-success">{fmt(pagado)}</TableCell>
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
            {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && cuentas?.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin cuentas pendientes 🎉</TableCell></TableRow>
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
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Solo se puede eliminar si no tiene abonos aplicados.
            </AlertDialogDescription>
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
