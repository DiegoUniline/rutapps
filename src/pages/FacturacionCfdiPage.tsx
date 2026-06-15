import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Search, Plus, Download, X, Eye, CheckCircle, XCircle, Loader2, Settings2, RefreshCw, Stamp, Trash2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCurrency } from '@/hooks/useCurrency';
import { CatalogosTab } from '@/components/facturacion/CatalogosTab';
import { TimbrarDialog } from '@/components/facturacion/TimbrarDialog';
import { ConfigEmisorCard } from '@/components/facturacion/ConfigEmisorCard';
import ClientesListPage from '@/pages/ClientesListPage';
import ProductosListPage from '@/pages/ProductosListPage';

const STATUS_COLORS: Record<string, string> = {
  timbrado: 'default',
  borrador: 'secondary',
  error: 'destructive',
  cancelado: 'outline',
  cancelacion_pendiente: 'secondary',
  cancelacion_rechazada: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  timbrado: 'Timbrado',
  borrador: 'Borrador',
  error: 'Error',
  cancelado: 'Cancelado',
  cancelacion_pendiente: 'Cancel. Pendiente',
  cancelacion_rechazada: 'Cancel. Rechazada',
};

type FacturaSubTab = 'todas' | 'borrador' | 'timbrado' | 'error' | 'canceladas';

export default function FacturacionCfdiPage() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showTimbrar, setShowTimbrar] = useState(false);
  const [selectedCfdi, setSelectedCfdi] = useState<any>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [facturaSubTab, setFacturaSubTab] = useState<FacturaSubTab>('todas');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkCancel, setShowBulkCancel] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Load timbre balance
  const { data: timbreSaldo } = useQuery({
    queryKey: ['timbres-saldo', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('timbres_saldo')
        .select('saldo')
        .eq('empresa_id', empresa!.id)
        .single();
      return data?.saldo ?? 0;
    },
  });

  // Load CFDIs
  const { data: cfdis, isLoading } = useQuery({
    queryKey: ['cfdis', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cfdis')
        .select('*, ventas(folio)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Verify connection
  const verificarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: { action: 'verificar_conexion' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.ok) toast.success('Conexión con Facturama exitosa ✓');
      else toast.error(`Error de conexión: status ${data.status}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Cancel mutation
  const cancelarMutation = useMutation({
    mutationFn: async (cfdiId: string) => {
      const cfdi = cfdis?.find((c: any) => c.id === cfdiId);
      if (!cfdi) throw new Error('CFDI no encontrado');

      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'cancelar',
          cfdi_id: cfdiId,
          rfc_emisor: empresa?.rfc || '',
          motivo: '02',
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Cancelación procesada');
      queryClient.invalidateQueries({ queryKey: ['cfdis'] });
      setShowCancel(false);
      setCancelingId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Delete mutation (only borrador or error)
  const eliminarMutation = useMutation({
    mutationFn: async (cfdiId: string) => {
      const cfdi = cfdis?.find((c: any) => c.id === cfdiId);
      if (!cfdi) throw new Error('CFDI no encontrado');
      if (cfdi.status !== 'borrador' && cfdi.status !== 'error') {
        throw new Error('No se puede eliminar un CFDI timbrado o cancelado. Se conservan para auditoría.');
      }

      const { error } = await supabase
        .from('cfdis')
        .delete()
        .eq('id', cfdiId)
        .eq('empresa_id', empresa!.id);
      if (error) throw error;
      return cfdiId;
    },
    onSuccess: () => {
      toast.success('CFDI eliminado correctamente');
      queryClient.invalidateQueries({ queryKey: ['cfdis'] });
      setShowDelete(false);
      setDeletingId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelStatuses = ['cancelado', 'cancelacion_pendiente', 'cancelacion_rechazada'];

  const filtered = (cfdis || []).filter((c: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      (c.folio_fiscal || '').toLowerCase().includes(q) ||
      (c.receiver_name || '').toLowerCase().includes(q) ||
      (c.receiver_rfc || '').toLowerCase().includes(q) ||
      (c.folio || '').toLowerCase().includes(q);
    if (!matchSearch) return false;

    switch (facturaSubTab) {
      case 'borrador':
        return c.status === 'borrador';
      case 'timbrado':
        return c.status === 'timbrado';
      case 'error':
        return c.status === 'error';
      case 'canceladas':
        return cancelStatuses.includes(c.status);
      default:
        return true;
    }
  });

  const counts = (cfdis || []).reduce(
    (acc: any, c: any) => {
      acc.todas++;
      if (c.status === 'borrador') acc.borrador++;
      else if (c.status === 'timbrado') acc.timbrado++;
      else if (c.status === 'error') acc.error++;
      else if (cancelStatuses.includes(c.status)) acc.canceladas++;
      return acc;
    },
    { todas: 0, borrador: 0, timbrado: 0, error: 0, canceladas: 0 },
  );

  const selectedList = (cfdis || []).filter((c: any) => selectedIds.has(c.id));
  const selectedDeletable = selectedList.filter((c: any) => c.status === 'borrador' || c.status === 'error');
  const selectedCancelable = selectedList.filter((c: any) => c.status === 'timbrado');
  const allFilteredSelected = filtered.length > 0 && filtered.every((c: any) => selectedIds.has(c.id));

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c: any) => next.delete(c.id));
      else filtered.forEach((c: any) => next.add(c.id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const runBulkDelete = async () => {
    if (selectedDeletable.length === 0) return;
    setBulkProcessing(true);
    try {
      const ids = selectedDeletable.map((c: any) => c.id);
      const { error } = await supabase.from('cfdis').delete().in('id', ids).eq('empresa_id', empresa!.id);
      if (error) throw error;
      toast.success(`${ids.length} CFDI(s) eliminado(s)`);
      queryClient.invalidateQueries({ queryKey: ['cfdis'] });
      clearSelection();
      setShowBulkDelete(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkProcessing(false);
    }
  };

  const runBulkCancel = async () => {
    if (selectedCancelable.length === 0) return;
    setBulkProcessing(true);
    let ok = 0, fail = 0;
    for (const cfdi of selectedCancelable) {
      try {
        const { data, error } = await supabase.functions.invoke('facturama', {
          body: { action: 'cancelar', cfdi_id: cfdi.id, rfc_emisor: empresa?.rfc || '', motivo: '02' },
        });
        if (error || data?.error) throw new Error(error?.message || data?.error);
        ok++;
      } catch (e) {
        fail++;
      }
    }
    setBulkProcessing(false);
    if (ok) toast.success(`${ok} cancelación(es) procesada(s)`);
    if (fail) toast.error(`${fail} fallaron`);
    queryClient.invalidateQueries({ queryKey: ['cfdis'] });
    clearSelection();
    setShowBulkCancel(false);
  };




  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Facturación</h1>
            <p className="text-xs text-muted-foreground">CFDI 4.0 · Facturama</p>
          </div>
          <Badge variant={(timbreSaldo ?? 0) > 0 ? 'secondary' : 'destructive'} className="text-xs flex items-center gap-1">
            <Stamp className="h-3 w-3" />
            {timbreSaldo ?? 0} timbres
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => verificarMutation.mutate()}
            disabled={verificarMutation.isPending}
          >
            {verificarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Probar conexión</span>
          </Button>
          <Button size="sm" onClick={() => setShowTimbrar(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Timbrar CFDI
          </Button>
        </div>
      </div>

      <Tabs defaultValue="facturas" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="facturas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Facturas</TabsTrigger>
          <TabsTrigger value="clientes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Clientes</TabsTrigger>
          <TabsTrigger value="productos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Productos</TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Configuración Emisor</TabsTrigger>
          <TabsTrigger value="catalogos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Catálogos SAT</TabsTrigger>
        </TabsList>

        {/* FACTURAS TAB */}
        <TabsContent value="facturas" className="mt-4 space-y-3">
            <Tabs value={facturaSubTab} onValueChange={(v) => setFacturaSubTab(v as FacturaSubTab)}>
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="todas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Todas <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.todas}</Badge></TabsTrigger>
                <TabsTrigger value="borrador" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Borradores <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.borrador}</Badge></TabsTrigger>
                <TabsTrigger value="timbrado" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Timbradas <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.timbrado}</Badge></TabsTrigger>
                <TabsTrigger value="error" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Errores <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.error}</Badge></TabsTrigger>
                <TabsTrigger value="canceladas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Canceladas <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.canceladas}</Badge></TabsTrigger>
              </TabsList>
            </Tabs>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por RFC, nombre, folio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
            <Badge variant="secondary" className="text-xs">{filtered.length} facturas</Badge>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg border bg-primary/5">
              <span className="text-sm font-medium">{selectedIds.size} seleccionada(s)</span>
              <div className="flex-1" />
              {selectedCancelable.length > 0 && (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setShowBulkCancel(true)} disabled={bulkProcessing}>
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Cancelar ({selectedCancelable.length})
                </Button>
              )}
              {selectedDeletable.length > 0 && (
                <Button size="sm" variant="destructive" onClick={() => setShowBulkDelete(true)} disabled={bulkProcessing}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Eliminar ({selectedDeletable.length})
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={clearSelection}>Limpiar</Button>
            </div>
          )}



          {isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No hay facturas aún. Presiona "Timbrar CFDI" para crear tu primera factura.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                     <TableHead className="w-[40px]">
                       <Checkbox
                         checked={allFilteredSelected}
                         onCheckedChange={toggleAll}
                         aria-label="Seleccionar todas"
                       />
                     </TableHead>
                     <TableHead className="w-[100px]">Folio</TableHead>
                     <TableHead>Receptor</TableHead>
                     <TableHead className="w-[120px]">RFC</TableHead>
                     <TableHead className="w-[90px]">Venta</TableHead>
                     <TableHead className="w-[100px] text-right">Total</TableHead>
                     <TableHead className="w-[110px]">Status</TableHead>
                     <TableHead className="w-[100px]">Fecha</TableHead>
                     <TableHead className="w-[140px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((cfdi: any) => (
                    <TableRow key={cfdi.id} data-state={selectedIds.has(cfdi.id) ? 'selected' : undefined} className="text-[13px] cursor-pointer" onClick={() => navigate(`/facturacion-cfdi/${cfdi.id}`)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(cfdi.id)}
                          onCheckedChange={() => toggleOne(cfdi.id)}
                          aria-label="Seleccionar fila"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">
                        {cfdi.serie ? `${cfdi.serie}-` : ''}{cfdi.folio || '—'}
                      </TableCell>
                      <TableCell className="truncate max-w-[200px]">{cfdi.receiver_name || '—'}</TableCell>
                       <TableCell className="font-mono text-xs">{cfdi.receiver_rfc || '—'}</TableCell>
                       <TableCell className="font-mono text-xs text-primary">
                         {(cfdi.ventas as any)?.folio || '—'}
                       </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmt(Number(cfdi.total || 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={(STATUS_COLORS[cfdi.status] || 'secondary') as any} className="text-[10px]">
                          {STATUS_LABELS[cfdi.status] || cfdi.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(cfdi.created_at), 'd MMM yy', { locale: es })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {cfdi.pdf_url && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={cfdi.pdf_url} target="_blank" rel="noopener noreferrer" title="PDF">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {cfdi.xml_url && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={cfdi.xml_url} target="_blank" rel="noopener noreferrer" title="XML">
                                <FileText className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {cfdi.status === 'timbrado' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={(e) => { e.stopPropagation(); setCancelingId(cfdi.id); setShowCancel(true); }}
                              title="Cancelar"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(cfdi.status === 'borrador' || cfdi.status === 'error') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={(e) => { e.stopPropagation(); setDeletingId(cfdi.id); setShowDelete(true); }}
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* CLIENTES TAB */}
        <TabsContent value="clientes" className="mt-4">
          <div className="-mx-4 md:-mx-6">
            <ClientesListPage />
          </div>
        </TabsContent>

        {/* PRODUCTOS TAB */}
        <TabsContent value="productos" className="mt-4">
          <div className="-mx-4 md:-mx-6">
            <ProductosListPage />
          </div>
        </TabsContent>


        {/* CONFIG TAB */}
        <TabsContent value="config" className="mt-4">
          <ConfigEmisorCard />
        </TabsContent>

        {/* CATALOGOS TAB */}
        <TabsContent value="catalogos" className="mt-4">
          <CatalogosTab />
        </TabsContent>
      </Tabs>

      {/* Timbrar Dialog */}
      <TimbrarDialog
        open={showTimbrar}
        onOpenChange={setShowTimbrar}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['cfdis'] });
          setShowTimbrar(false);
        }}
      />

      {/* Cancel Dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar Factura</DialogTitle>
            <DialogDescription>
              Esta acción enviará la solicitud de cancelación al SAT. ¿Deseas continuar?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCancel(false)}>No</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={cancelarMutation.isPending}
              onClick={() => cancelingId && cancelarMutation.mutate(cancelingId)}
            >
              {cancelarMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Eliminar CFDI
            </DialogTitle>
            <DialogDescription>
              Esta acción eliminará permanentemente el CFDI. No se puede deshacer.
              Las facturas timbradas o canceladas no se pueden eliminar porque se conservan para auditoría ante el SAT.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowDelete(false)}>No, conservar</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={eliminarMutation.isPending}
              onClick={() => deletingId && eliminarMutation.mutate(deletingId)}
            >
              {eliminarMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Eliminar {selectedDeletable.length} CFDI(s)
            </DialogTitle>
            <DialogDescription>
              Se eliminarán permanentemente los borradores y CFDIs con error seleccionados. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowBulkDelete(false)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" disabled={bulkProcessing} onClick={runBulkDelete}>
              {bulkProcessing ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Cancel Dialog */}
      <Dialog open={showBulkCancel} onOpenChange={setShowBulkCancel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar {selectedCancelable.length} factura(s)</DialogTitle>
            <DialogDescription>
              Se enviará la solicitud de cancelación al SAT para cada CFDI timbrado seleccionado. ¿Deseas continuar?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowBulkCancel(false)}>No</Button>
            <Button variant="destructive" className="flex-1" disabled={bulkProcessing} onClick={runBulkCancel}>
              {bulkProcessing ? 'Cancelando...' : 'Sí, cancelar todas'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
