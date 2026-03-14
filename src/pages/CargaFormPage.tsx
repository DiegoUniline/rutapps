import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Truck, Search } from 'lucide-react';
import { useCarga, useSaveCarga, useSaveCargaLineas, useUpdateCargaStatus, useDeleteCarga } from '@/hooks/useCargas';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface CargaLinea {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad_cargada: number;
  stock_actual: number;
}

export default function CargaFormPage() {
  const { id } = useParams();
  const isNew = id === 'nuevo';
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const { data: carga, isLoading } = useCarga(isNew ? undefined : id);
  const saveCarga = useSaveCarga();
  const saveCargaLineas = useSaveCargaLineas();
  const updateStatus = useUpdateCargaStatus();
  const deleteCarga = useDeleteCarga();

  const [vendedorId, setVendedorId] = useState('');
  const [repartidorId, setRepartidorId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<CargaLinea[]>([]);
  const [searchProd, setSearchProd] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const { data: vendedores } = useQuery({
    queryKey: ['vendedores-carga', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: productos } = useQuery({
    queryKey: ['productos-carga', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, codigo, nombre, cantidad, precio_principal').eq('empresa_id', empresa!.id).eq('status', 'activo').eq('se_puede_vender', true).order('nombre');
      return data ?? [];
    },
  });

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-carga', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  useEffect(() => {
    if (carga && !isNew) {
      setVendedorId(carga.vendedor_id ?? '');
      setRepartidorId((carga as any).repartidor_id ?? '');
      setAlmacenId((carga as any).almacen_id ?? '');
      setFecha(carga.fecha);
      setNotas(carga.notas ?? '');
      setLineas((carga.carga_lineas ?? []).map((l: any) => ({
        producto_id: l.producto_id,
        codigo: l.productos?.codigo ?? '',
        nombre: l.productos?.nombre ?? '',
        cantidad_cargada: l.cantidad_cargada,
        stock_actual: l.productos?.cantidad ?? 0,
      })));
    }
  }, [carga, isNew]);

  const filteredProducts = productos?.filter(p =>
    !searchProd || p.nombre.toLowerCase().includes(searchProd.toLowerCase()) || p.codigo.toLowerCase().includes(searchProd.toLowerCase())
  ).filter(p => !lineas.some(l => l.producto_id === p.id));

  const addProduct = (p: any) => {
    setLineas([...lineas, { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad_cargada: 1, stock_actual: p.cantidad ?? 0 }]);
    setSearchProd('');
    setShowSearch(false);
  };

  const updateQty = (idx: number, qty: number) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, cantidad_cargada: Math.max(0, qty) } : l));
  };

  const removeLine = (idx: number) => {
    setLineas(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!vendedorId) { toast.error('Selecciona un vendedor'); return; }
    if (lineas.length === 0) { toast.error('Agrega al menos un producto'); return; }
    try {
      const saved = await saveCarga.mutateAsync({
        id: isNew ? undefined : id,
        vendedor_id: vendedorId,
        repartidor_id: repartidorId || null,
        almacen_id: almacenId || null,
        fecha,
        notas: notas || null,
      });
      const cargaId = isNew ? saved.id : id!;
      await saveCargaLineas.mutateAsync({
        cargaId,
        lineas: lineas.map(l => ({ producto_id: l.producto_id, cantidad_cargada: l.cantidad_cargada })),
      });
      toast.success(isNew ? 'Carga creada' : 'Carga actualizada');
      navigate(`/cargas/${cargaId}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id || isNew) return;
    try {
      await updateStatus.mutateAsync({ id, status: newStatus });
      toast.success(`Status: ${newStatus}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('¿Eliminar esta carga?')) return;
    try {
      await deleteCarga.mutateAsync(id);
      toast.success('Carga eliminada');
      navigate('/almacen/cargas');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const currentStatus = carga?.status ?? 'pendiente';
  const isEditable = currentStatus === 'pendiente';

  if (!isNew && isLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/almacen/cargas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5" /> {isNew ? 'Nueva carga' : `Carga — ${fecha}`}
          </h1>
        </div>
        {!isNew && (
          <div className="flex gap-2">
            {currentStatus === 'pendiente' && (
              <Button size="sm" onClick={() => handleStatusChange('en_ruta')}>Enviar a ruta</Button>
            )}
            {currentStatus === 'en_ruta' && (
              <Button size="sm" variant="secondary" onClick={() => handleStatusChange('completada')}>Completar</Button>
            )}
            {isEditable && (
              <Button size="sm" variant="destructive" onClick={handleDelete}>Eliminar</Button>
            )}
          </div>
        )}
      </div>

      {!isNew && (
        <Badge variant={currentStatus === 'en_ruta' ? 'default' : currentStatus === 'completada' ? 'secondary' : 'outline'}>
          {currentStatus === 'pendiente' ? 'Pendiente' : currentStatus === 'en_ruta' ? 'En ruta' : currentStatus === 'completada' ? 'Completada' : 'Cancelada'}
        </Badge>
      )}

      {/* Form fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <label className="text-sm font-medium text-foreground">Vendedor *</label>
          <select
            className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
            value={vendedorId}
            onChange={e => setVendedorId(e.target.value)}
            disabled={!isEditable && !isNew}
          >
            <option value="">Seleccionar...</option>
            {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Repartidor</label>
          <select
            className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
            value={repartidorId}
            onChange={e => setRepartidorId(e.target.value)}
            disabled={!isEditable && !isNew}
          >
            <option value="">Mismo vendedor</option>
            {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Almacén origen</label>
          <select
            className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
            value={almacenId}
            onChange={e => setAlmacenId(e.target.value)}
            disabled={!isEditable && !isNew}
          >
            <option value="">Sin asignar</option>
            {almacenes?.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Fecha</label>
          <Input type="date" className="mt-1" value={fecha} onChange={e => setFecha(e.target.value)} disabled={!isEditable && !isNew} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Notas</label>
          <Input className="mt-1" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Instrucciones..." />
        </div>
      </div>

      {/* Products */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Productos a cargar</h2>
          {(isEditable || isNew) && (
            <Button size="sm" variant="outline" onClick={() => setShowSearch(!showSearch)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
            </Button>
          )}
        </div>

        {showSearch && (
          <div className="border border-border rounded-lg p-3 bg-card space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar producto..." className="pl-8" value={searchProd} onChange={e => setSearchProd(e.target.value)} autoFocus />
            </div>
            <div className="max-h-48 overflow-auto space-y-1">
              {filteredProducts?.slice(0, 20).map(p => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm flex justify-between"
                >
                  <span>{p.codigo} — {p.nombre}</span>
                  <span className="text-muted-foreground">Stock: {p.cantidad ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="w-24">Stock</TableHead>
                <TableHead className="w-32">Cantidad</TableHead>
                {!isNew && <TableHead className="w-24">Devuelto</TableHead>}
                {!isNew && <TableHead className="w-24">Vendido</TableHead>}
                {(isEditable || isNew) && <TableHead className="w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin productos</TableCell></TableRow>
              )}
              {lineas.map((l, idx) => (
                <TableRow key={l.producto_id}>
                  <TableCell className="text-muted-foreground text-xs">{l.codigo}</TableCell>
                  <TableCell className="font-medium">{l.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{l.stock_actual}</TableCell>
                  <TableCell>
                    {(isEditable || isNew) ? (
                      <Input
                        type="number"
                        className="w-24"
                        value={l.cantidad_cargada}
                        onChange={e => updateQty(idx, parseFloat(e.target.value) || 0)}
                        min={0}
                      />
                    ) : l.cantidad_cargada}
                  </TableCell>
                  {!isNew && <TableCell>{(carga?.carga_lineas as any)?.[idx]?.cantidad_devuelta ?? 0}</TableCell>}
                  {!isNew && <TableCell>{(carga?.carga_lineas as any)?.[idx]?.cantidad_vendida ?? 0}</TableCell>}
                  {(isEditable || isNew) && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Save */}
      {(isEditable || isNew) && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => navigate('/cargas')}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saveCarga.isPending}>
            <Save className="h-4 w-4 mr-1" /> {isNew ? 'Crear carga' : 'Guardar'}
          </Button>
        </div>
      )}
    </div>
  );
}
