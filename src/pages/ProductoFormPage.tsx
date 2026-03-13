import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProducto, useSaveProducto, useDeleteProducto, useMarcas, useProveedores, useClasificaciones, useListas, useUnidades, useTasasIva, useTasasIeps, useAlmacenes, useUnidadesSat, useTarifasForSelect } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Producto } from '@/types';

const defaultProduct: Partial<Producto> = {
  codigo: '', nombre: '', clave_alterna: '', costo: 0, precio_principal: 0,
  se_puede_comprar: true, se_puede_vender: true, vender_sin_stock: false,
  se_puede_inventariar: true, es_combo: false, min: 0, max: 0,
  manejar_lotes: false, factor_conversion: 1, permitir_descuento: false,
  monto_maximo: 0, cantidad: 0, tiene_comision: false, tipo_comision: 'porcentaje',
  pct_comision: 0, status: 'borrador', almacenes: [], tiene_iva: false,
  tiene_ieps: false, calculo_costo: 'promedio', codigo_sat: '', contador: 0,
  contador_tarifas: 0,
};

export default function ProductoFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';
  const { data: existing } = useProducto(isNew ? undefined : id);
  const saveMutation = useSaveProducto();
  const deleteMutation = useDeleteProducto();

  const { data: marcas } = useMarcas();
  const { data: proveedores } = useProveedores();
  const { data: clasificaciones } = useClasificaciones();
  const { data: listas } = useListas();
  const { data: unidades } = useUnidades();
  const { data: tasasIva } = useTasasIva();
  const { data: tasasIeps } = useTasasIeps();
  const { data: almacenes } = useAlmacenes();
  const { data: unidadesSat } = useUnidadesSat();
  const { data: tarifasDisp } = useTarifasForSelect();

  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [precioMode, setPrecioMode] = useState<'unico' | 'tarifas'>('unico');

  useEffect(() => {
    if (existing) {
      setForm(existing);
      setPrecioMode(existing.contador_tarifas > 0 ? 'tarifas' : 'unico');
    }
  }, [existing]);

  const set = (key: keyof Producto, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.codigo || !form.nombre) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    try {
      await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      toast.success('Producto guardado');
      navigate('/productos');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Producto eliminado');
      navigate('/productos');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/productos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">
          {isNew ? 'Nuevo Producto' : form.nombre || 'Producto'}
        </h1>
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/productos')}>
            <X className="h-4 w-4 mr-1" /> Descartar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="bg-info hover:bg-info/90 text-info-foreground">
            <Save className="h-4 w-4 mr-1" /> Guardar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="overflow-x-auto flex w-full justify-start bg-muted">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="precios">Precios & Tarifas</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
          <TabsTrigger value="almacenes">Almacenes</TabsTrigger>
        </TabsList>

        {/* Tab General */}
        <TabsContent value="general" className="space-y-6">
          <div className="section-card space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Código *</Label>
                <Input value={form.codigo ?? ''} onChange={e => set('codigo', e.target.value)} />
              </div>
              <div>
                <Label>Nombre *</Label>
                <Input value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
              </div>
              <div>
                <Label>Clave Alterna</Label>
                <Input value={form.clave_alterna ?? ''} onChange={e => set('clave_alterna', e.target.value)} />
              </div>
              <div>
                <Label>Marca</Label>
                <Select value={form.marca_id ?? ''} onValueChange={v => set('marca_id', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {marcas?.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Proveedor</Label>
                <Select value={form.proveedor_id ?? ''} onValueChange={v => set('proveedor_id', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {proveedores?.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Clasificación</Label>
                <Select value={form.clasificacion_id ?? ''} onValueChange={v => set('clasificacion_id', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {clasificaciones?.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lista</Label>
                <Select value={form.lista_id ?? ''} onValueChange={v => set('lista_id', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {listas?.map(l => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status ?? 'borrador'} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                    <SelectItem value="borrador">Borrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-foreground mb-3">Opciones</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6">
                {([
                  ['se_puede_comprar', 'Se puede Comprar'],
                  ['se_puede_vender', 'Se puede Vender'],
                  ['se_puede_inventariar', 'Inventariar'],
                  ['vender_sin_stock', 'Vender sin Stock'],
                  ['es_combo', 'Es Combo'],
                  ['manejar_lotes', 'Manejar Lotes'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch checked={!!form[key]} onCheckedChange={v => set(key, v)} />
                    <Label className="text-sm">{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div>
                <Label>Min Stock</Label>
                <Input type="number" value={form.min ?? 0} onChange={e => set('min', +e.target.value)} />
              </div>
              <div>
                <Label>Max Stock</Label>
                <Input type="number" value={form.max ?? 0} onChange={e => set('max', +e.target.value)} />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab Precios */}
        <TabsContent value="precios" className="space-y-4">
          <div className="section-card space-y-4">
            <div className="flex gap-2">
              <Button
                variant={precioMode === 'unico' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPrecioMode('unico')}
                className={precioMode === 'unico' ? 'bg-accent text-accent-foreground' : ''}
              >
                • Usar Precio Único
              </Button>
              <Button
                variant={precioMode === 'tarifas' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPrecioMode('tarifas')}
                className={precioMode === 'tarifas' ? 'bg-accent text-accent-foreground' : ''}
              >
                • Usar Tarifas
              </Button>
            </div>

            {precioMode === 'unico' ? (
              <div className="space-y-4">
                <div>
                  <Label>Precio Principal</Label>
                  <Input
                    type="number"
                    value={form.precio_principal ?? 0}
                    onChange={e => set('precio_principal', +e.target.value)}
                    className="text-2xl font-bold h-14 max-w-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!form.permitir_descuento} onCheckedChange={v => set('permitir_descuento', v)} />
                  <Label>Permitir Descuento</Label>
                </div>
                {form.permitir_descuento && (
                  <div className="max-w-xs">
                    <Label>Monto Máximo Descuento</Label>
                    <Input type="number" value={form.monto_maximo ?? 0} onChange={e => set('monto_maximo', +e.target.value)} />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Tarifas asignadas a este producto. Gestiona las tarifas desde el módulo Tarifas.</p>
                {tarifasDisp?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No hay tarifas disponibles.</p>
                ) : (
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Nombre Tarifa</th>
                          <th className="text-left p-2 font-medium">Tipo</th>
                          <th className="text-center p-2 font-medium">Activa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tarifasDisp?.map(t => (
                          <tr key={t.id} className="border-b last:border-0">
                            <td className="p-2">{t.nombre}</td>
                            <td className="p-2 text-muted-foreground">{t.tipo}</td>
                            <td className="p-2 text-center">
                              {t.activa ? <span className="text-success text-xs font-medium">Sí</span> : <span className="text-muted-foreground text-xs">No</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button className="odoo-link" onClick={() => navigate('/tarifas')}>+ Agregar Tarifa</button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab Fiscal */}
        <TabsContent value="fiscal">
          <div className="section-card space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={!!form.tiene_iva} onCheckedChange={v => set('tiene_iva', v)} />
              <Label>IVA</Label>
            </div>
            {form.tiene_iva && (
              <div className="max-w-xs">
                <Label>Tasa IVA</Label>
                <Select value={form.tasa_iva_id ?? ''} onValueChange={v => set('tasa_iva_id', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar tasa" /></SelectTrigger>
                  <SelectContent>
                    {tasasIva?.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre} ({t.porcentaje}%)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={!!form.tiene_ieps} onCheckedChange={v => set('tiene_ieps', v)} />
              <Label>IEPS</Label>
            </div>
            {form.tiene_ieps && (
              <div className="max-w-xs">
                <Label>Tasa IEPS</Label>
                <Select value={form.tasa_ieps_id ?? ''} onValueChange={v => set('tasa_ieps_id', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar tasa" /></SelectTrigger>
                  <SelectContent>
                    {tasasIeps?.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre} ({t.porcentaje}%)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Código SAT</Label>
              <Input value={form.codigo_sat ?? ''} onChange={e => set('codigo_sat', e.target.value)} className="max-w-xs" />
            </div>
            <div className="max-w-xs">
              <Label>Unidad de Medida SAT</Label>
              <Select value={form.udem_sat_id ?? ''} onValueChange={v => set('udem_sat_id', v || null)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {unidadesSat?.map(u => <SelectItem key={u.id} value={u.id}>{u.clave} - {u.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-w-xs">
              <Label>Cálculo de Costo</Label>
              <Select value={form.calculo_costo ?? 'promedio'} onValueChange={v => set('calculo_costo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="promedio">Promedio</SelectItem>
                  <SelectItem value="ultimo">Último</SelectItem>
                  <SelectItem value="estandar">Estándar</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* Tab Unidades */}
        <TabsContent value="unidades">
          <div className="section-card space-y-4">
            <div className="max-w-xs">
              <Label>Unidad de Compra</Label>
              <Select value={form.unidad_compra_id ?? ''} onValueChange={v => set('unidad_compra_id', v || null)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {unidades?.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-w-xs">
              <Label>Unidad de Venta</Label>
              <Select value={form.unidad_venta_id ?? ''} onValueChange={v => set('unidad_venta_id', v || null)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {unidades?.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-w-xs">
              <Label>Factor de Conversión</Label>
              <Input type="number" step="0.01" value={form.factor_conversion ?? 1} onChange={e => set('factor_conversion', +e.target.value)} />
            </div>
          </div>
        </TabsContent>

        {/* Tab Comisiones */}
        <TabsContent value="comisiones">
          <div className="section-card space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={!!form.tiene_comision} onCheckedChange={v => set('tiene_comision', v)} />
              <Label>¿Maneja Comisión?</Label>
            </div>
            {form.tiene_comision && (
              <>
                <div className="max-w-xs">
                  <Label>Tipo</Label>
                  <Select value={form.tipo_comision ?? 'porcentaje'} onValueChange={v => set('tipo_comision', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="porcentaje">Porcentaje</SelectItem>
                      <SelectItem value="monto_fijo">Monto Fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="max-w-xs">
                  <Label>Valor ({form.tipo_comision === 'porcentaje' ? '%' : '$'})</Label>
                  <Input type="number" step="0.01" value={form.pct_comision ?? 0} onChange={e => set('pct_comision', +e.target.value)} />
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* Tab Almacenes */}
        <TabsContent value="almacenes">
          <div className="section-card space-y-3">
            <p className="text-sm text-muted-foreground">Selecciona los almacenes donde está disponible este producto.</p>
            {almacenes?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No hay almacenes configurados.</p>
            ) : (
              <div className="space-y-2">
                {almacenes?.map(a => (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.almacenes?.includes(a.id) ?? false}
                      onChange={e => {
                        const current = form.almacenes ?? [];
                        set('almacenes', e.target.checked ? [...current, a.id] : current.filter(x => x !== a.id));
                      }}
                      className="rounded border-input"
                    />
                    <span className="text-sm">{a.nombre}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
