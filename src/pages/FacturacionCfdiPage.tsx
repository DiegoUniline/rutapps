import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Search, Plus, Download, X, Eye, CheckCircle, XCircle, Loader2, Settings2, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CatalogosTab } from '@/components/facturacion/CatalogosTab';
import { TimbrarDialog } from '@/components/facturacion/TimbrarDialog';
import { ConfigEmisorCard } from '@/components/facturacion/ConfigEmisorCard';

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

export default function FacturacionCfdiPage() {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showTimbrar, setShowTimbrar] = useState(false);
  const [selectedCfdi, setSelectedCfdi] = useState<any>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

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

  const filtered = (cfdis || []).filter((c: any) => {
    const q = search.toLowerCase();
    return (
      (c.folio_fiscal || '').toLowerCase().includes(q) ||
      (c.receiver_name || '').toLowerCase().includes(q) ||
      (c.receiver_rfc || '').toLowerCase().includes(q) ||
      (c.folio || '').toLowerCase().includes(q)
    );
  });

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
        <TabsList className="bg-muted/50">
          <TabsTrigger value="facturas">Facturas</TabsTrigger>
          <TabsTrigger value="config">Configuración Emisor</TabsTrigger>
          <TabsTrigger value="catalogos">Catálogos SAT</TabsTrigger>
        </TabsList>

        {/* FACTURAS TAB */}
        <TabsContent value="facturas" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por RFC, nombre, folio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
            <Badge variant="secondary" className="text-xs">{filtered.length} facturas</Badge>
          </div>

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
                  <TableRow className="bg-muted/50">
                     <TableHead className="w-[100px]">Folio</TableHead>
                     <TableHead>Receptor</TableHead>
                     <TableHead className="w-[120px]">RFC</TableHead>
                     <TableHead className="w-[90px]">Venta</TableHead>
                     <TableHead className="w-[100px] text-right">Total</TableHead>
                     <TableHead className="w-[110px]">Status</TableHead>
                     <TableHead className="w-[100px]">Fecha</TableHead>
                     <TableHead className="w-[120px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((cfdi: any) => (
                    <TableRow key={cfdi.id} className="text-[13px] cursor-pointer" onClick={() => navigate(`/facturacion-cfdi/${cfdi.id}`)}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {cfdi.serie ? `${cfdi.serie}-` : ''}{cfdi.folio || '—'}
                      </TableCell>
                      <TableCell className="truncate max-w-[200px]">{cfdi.receiver_name || '—'}</TableCell>
                       <TableCell className="font-mono text-xs">{cfdi.receiver_rfc || '—'}</TableCell>
                       <TableCell className="font-mono text-xs text-primary">
                         {(cfdi.ventas as any)?.folio || '—'}
                       </TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(cfdi.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
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
                              onClick={() => { setCancelingId(cfdi.id); setShowCancel(true); }}
                              title="Cancelar"
                            >
                              <XCircle className="h-3.5 w-3.5" />
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
    </div>
  );
}
