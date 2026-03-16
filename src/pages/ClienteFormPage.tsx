import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Trash2, Star, Camera, Plus, Minus, Search, X, Crosshair, Loader2 } from 'lucide-react';
import GpsMapPicker from '@/components/GpsMapPicker';
import { useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField, OdooSection } from '@/components/OdooFormField';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { useCliente, useSaveCliente, useDeleteCliente, useZonas, useVendedores, useCobradores, usePedidoSugerido, useSavePedidoSugerido } from '@/hooks/useClientes';
import { useTarifasForSelect, useProductosForSelect } from '@/hooks/useData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Cliente, StatusCliente, FrecuenciaVisita } from '@/types';

const defaultCliente: Partial<Cliente> = {
  codigo: '', nombre: '', contacto: '', telefono: '', email: '', direccion: '',
  rfc: '', notas: '', colonia: '', frecuencia: 'semanal', dia_visita: [],
  credito: false, limite_credito: 0, dias_credito: 0, orden: 0, status: 'activo',
  requiere_factura: false, facturama_rfc: '', facturama_razon_social: '',
  facturama_regimen_fiscal: '', facturama_uso_cfdi: '', facturama_cp: '',
  facturama_correo_facturacion: '',
};

const statusSteps = [
  { key: 'activo', label: 'Activo' },
  { key: 'inactivo', label: 'Inactivo' },
  { key: 'suspendido', label: 'Suspendido' },
];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function ClienteFormPage() {
  const { id } = useParams();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';
  const { data: existing } = useCliente(isNew ? undefined : id);
  const saveMutation = useSaveCliente();
  const deleteMutation = useDeleteCliente();

  const { data: zonas } = useZonas();
  const { data: vendedores } = useVendedores();
  const { data: cobradores } = useCobradores();
  const { data: tarifas } = useTarifasForSelect();
  const { data: productosSelect } = useProductosForSelect();
  const { data: pedidoSugerido } = usePedidoSugerido(isNew ? undefined : id);
  const savePedidoMutation = useSavePedidoSugerido();

  // SAT catalogs for fiscal section
  const { data: catRegimen } = useQuery({
    queryKey: ['cat_regimen_fiscal'], staleTime: 10 * 60 * 1000,
    queryFn: async () => { const { data } = await supabase.from('cat_regimen_fiscal').select('clave, descripcion').eq('activo', true).order('clave'); return data ?? []; },
  });
  const { data: catUsoCfdi } = useQuery({
    queryKey: ['cat_uso_cfdi'], staleTime: 10 * 60 * 1000,
    queryFn: async () => { const { data } = await supabase.from('cat_uso_cfdi').select('clave, descripcion').eq('activo', true).order('clave'); return data ?? []; },
  });

  const [form, setForm] = useState<Partial<Cliente>>(defaultCliente);
  const [originalForm, setOriginalForm] = useState<Partial<Cliente>>(defaultCliente);
  const [starred, setStarred] = useState(false);
  const [capturingGps, setCapturingGps] = useState(false);

  // Pedido sugerido state
  const [pedidoItems, setPedidoItems] = useState<{ producto_id: string; nombre: string; codigo: string; cantidad: number }[]>([]);
  const [pedidoSearch, setPedidoSearch] = useState('');
  const [showPedidoSearch, setShowPedidoSearch] = useState(false);
  const [pedidoDirty, setPedidoDirty] = useState(false);

  useEffect(() => {
    if (existing) { setForm(existing); setOriginalForm(existing); }
  }, [existing]);

  useEffect(() => {
    if (pedidoSugerido) {
      setPedidoItems(pedidoSugerido.map(ps => ({
        producto_id: ps.producto_id,
        nombre: ps.productos?.nombre ?? '',
        codigo: ps.productos?.codigo ?? '',
        cantidad: ps.cantidad,
      })));
    }
  }, [pedidoSugerido]);

  const isDirty = isNew || JSON.stringify(form) !== JSON.stringify(originalForm);

  const set = (key: keyof Cliente, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.nombre) { toast.error('Nombre es obligatorio'); return; }
    try {
      const result = await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      // Save pedido sugerido
      const clienteId = isNew ? result?.id : id;
      if (clienteId && pedidoDirty) {
        await savePedidoMutation.mutateAsync({
          clienteId,
          items: pedidoItems.map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
        });
        setPedidoDirty(false);
      }
      toast.success('Cliente guardado');
      setOriginalForm({ ...form });
      if (isNew && result?.id) navigate(`/clientes/${result.id}`, { replace: true });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Cliente eliminado');
      navigate('/clientes');
    } catch (err: any) { toast.error(err.message); }
  };

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta GPS');
      return;
    }
    setCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm(prev => ({ ...prev, gps_lat: latitude, gps_lng: longitude }));
        setCapturingGps(false);
        toast.success('Ubicación GPS capturada');
      },
      (err) => {
        setCapturingGps(false);
        toast.error(err.code === 1 ? 'Permiso de GPS denegado' : 'No se pudo obtener ubicación');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const toggleDia = (dia: string) => {
    const current = form.dia_visita ?? [];
    set('dia_visita', current.includes(dia) ? current.filter(d => d !== dia) : [...current, dia]);
  };

  const frecuenciaOpts = [
    { value: 'diaria', label: 'Diaria' },
    { value: 'semanal', label: 'Semanal' },
    { value: 'quincenal', label: 'Quincenal' },
    { value: 'mensual', label: 'Mensual' },
  ];

  // Pedido sugerido helpers
  const addPedidoProduct = (p: { id: string; codigo: string; nombre: string }) => {
    if (pedidoItems.find(i => i.producto_id === p.id)) return;
    setPedidoItems(prev => [...prev, { producto_id: p.id, nombre: p.nombre, codigo: p.codigo, cantidad: 1 }]);
    setPedidoDirty(true);
    setShowPedidoSearch(false);
    setPedidoSearch('');
  };

  const updatePedidoQty = (productoId: string, qty: number) => {
    if (qty <= 0) {
      setPedidoItems(prev => prev.filter(i => i.producto_id !== productoId));
    } else {
      setPedidoItems(prev => prev.map(i => i.producto_id === productoId ? { ...i, cantidad: qty } : i));
    }
    setPedidoDirty(true);
  };

  const removePedidoItem = (productoId: string) => {
    setPedidoItems(prev => prev.filter(i => i.producto_id !== productoId));
    setPedidoDirty(true);
  };

  const filteredPedidoProducts = productosSelect?.filter(p =>
    !pedidoSearch || p.nombre.toLowerCase().includes(pedidoSearch.toLowerCase()) || p.codigo.toLowerCase().includes(pedidoSearch.toLowerCase())
  ).filter(p => !pedidoItems.find(i => i.producto_id === p.id));

  return (
    <div className="p-4 min-h-full">
      <div className="mb-0.5">
        <Link to="/clientes" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Clientes</Link>
      </div>

      {/* Title + Photos */}
      <div className="flex items-start gap-4 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setStarred(!starred)} className="text-warning hover:scale-110 transition-transform">
              <Star className={`h-5 w-5 ${starred ? 'fill-warning' : ''}`} />
            </button>
            <h1 className="text-[22px] font-bold text-foreground leading-tight">
              {isNew ? 'Nuevo Cliente' : form.nombre || 'Cliente'}
            </h1>
          </div>
        </div>
        <div className="hidden sm:flex gap-2 shrink-0">
          {form.foto_url ? (
            <img src={form.foto_url} alt="" className="w-[80px] h-[80px] rounded object-cover border border-border" />
          ) : (
            <div className="w-[80px] h-[80px] rounded border-2 border-dashed border-border flex flex-col items-center justify-center">
              <Camera className="h-5 w-5 text-muted-foreground/40" />
              <span className="text-[9px] text-muted-foreground">Foto</span>
            </div>
          )}
          {form.foto_fachada_url ? (
            <img src={form.foto_fachada_url} alt="" className="w-[80px] h-[80px] rounded object-cover border border-border" />
          ) : (
            <div className="w-[80px] h-[80px] rounded border-2 border-dashed border-border flex flex-col items-center justify-center">
              <Camera className="h-5 w-5 text-muted-foreground/40" />
              <span className="text-[9px] text-muted-foreground">Fachada</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons + statusbar */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={handleSave} disabled={saveMutation.isPending || (!isDirty && !pedidoDirty)} className={(isDirty || pedidoDirty) ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
          <Save className="h-3.5 w-3.5" /> Guardar
        </button>
        {!isNew && (
          <button onClick={handleDelete} className="btn-odoo-secondary text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        )}
        <div className="flex-1" />
        <OdooStatusbar
          steps={statusSteps}
          current={form.status ?? 'activo'}
          onStepClick={val => set('status', val as StatusCliente)}
        />
      </div>

      {/* Tabs */}
      <div className="bg-card border border-border rounded px-4 pb-4 pt-1">
      <OdooTabs tabs={[
        {
          key: 'general', label: 'Información General',
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-1">
              <div className="space-y-1">
                <OdooField label="Código" value={form.codigo} onChange={v => set('codigo', v)} placeholder="Se asigna automáticamente" readOnly={!isNew} />
                <OdooField label="Nombre" value={form.nombre} onChange={v => set('nombre', v)} placeholder="Nombre del cliente" alwaysEdit={isNew} />
                <OdooField label="Persona de Contacto" value={form.contacto} onChange={v => set('contacto', v)} />
                <OdooField label="Teléfono" value={form.telefono} onChange={v => {
                  const digits = v.replace(/\D/g, '');
                  // Auto-prefix 52 when user types exactly 10 digits
                  if (digits.length === 10 && !digits.startsWith('52')) {
                    set('telefono', '52' + digits);
                  } else {
                    set('telefono', v);
                  }
                }} placeholder="5210dígitos" />
                <OdooField label="Email" value={form.email} onChange={v => set('email', v)} />
                
              </div>
              <div className="space-y-1">
                <OdooField label="Dirección" value={form.direccion} onChange={v => set('direccion', v)} />
                <OdooField label="Colonia" value={form.colonia} onChange={v => set('colonia', v)} />
                <div className="odoo-field-row">
                  <span className="odoo-field-label">Ubicación GPS</span>
                  <div className="flex items-center gap-2 flex-1">
                    {form.gps_lat && form.gps_lng ? (
                      <span className="text-[11px] text-muted-foreground">
                        {Number(form.gps_lat).toFixed(6)}, {Number(form.gps_lng).toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Sin ubicación</span>
                    )}
                    <button
                      onClick={captureGps}
                      disabled={capturingGps}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
                    >
                      {capturingGps ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Crosshair className="h-3.5 w-3.5" />
                      )}
                      {form.gps_lat && form.gps_lng ? 'Actualizar GPS' : 'Capturar GPS'}
                    </button>
                    <GpsMapPicker
                      lat={form.gps_lat ? Number(form.gps_lat) : null}
                      lng={form.gps_lng ? Number(form.gps_lng) : null}
                      onChange={(lat, lng) => setForm(prev => ({ ...prev, gps_lat: lat, gps_lng: lng }))}
                      isLoaded={mapsLoaded}
                    />
                    {form.gps_lat && form.gps_lng && (
                      <button
                        onClick={() => setForm(prev => ({ ...prev, gps_lat: undefined, gps_lng: undefined }))}
                        className="text-[11px] text-destructive hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
                <OdooField label="Zona" value={form.zona_id} onChange={v => set('zona_id', v || null)} type="select"
                  options={zonas?.map(z => ({ value: z.id, label: z.nombre })) ?? []} />
                <OdooField label="Orden" value={form.orden} onChange={v => set('orden', +v)} type="number" />
                <div className="odoo-field-row">
                  <span className="odoo-field-label">Fecha de alta</span>
                  <div className="flex-1">
                    <OdooDatePicker value={form.fecha_alta ?? ''} onChange={v => set('fecha_alta', v)} />
                  </div>
                </div>
              </div>
            </div>
          ),
        },
        {
          key: 'fiscal', label: 'Datos Fiscales',
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-1">
              <div className="space-y-1">
                <div className="odoo-field-row">
                  <span className="odoo-field-label">¿Requiere factura?</span>
                  <input type="checkbox" checked={!!form.requiere_factura} onChange={e => set('requiere_factura', e.target.checked)} className="rounded border-input" />
                </div>
                {form.requiere_factura && (
                  <>
                    <OdooField label="RFC Fiscal" value={form.facturama_rfc} onChange={v => set('facturama_rfc', v?.toUpperCase())} placeholder="RFC del receptor" />
                    <OdooField label="Razón Social" value={form.facturama_razon_social} onChange={v => set('facturama_razon_social', v)} placeholder="Razón social como aparece en constancia" />
                    <OdooField label="Régimen Fiscal" value={form.facturama_regimen_fiscal} onChange={v => set('facturama_regimen_fiscal', v)} type="select"
                      options={(catRegimen ?? []).map(r => ({ value: r.clave, label: `${r.clave} - ${r.descripcion}` }))} />
                  </>
                )}
              </div>
              <div className="space-y-1">
                {form.requiere_factura && (
                  <>
                    <OdooField label="Uso CFDI" value={form.facturama_uso_cfdi} onChange={v => set('facturama_uso_cfdi', v)} type="select"
                      options={(catUsoCfdi ?? []).map(u => ({ value: u.clave, label: `${u.clave} - ${u.descripcion}` }))} />
                    <OdooField label="Código Postal" value={form.facturama_cp} onChange={v => set('facturama_cp', v)} placeholder="C.P. fiscal del receptor" />
                    <OdooField label="Correo Facturación" value={form.facturama_correo_facturacion} onChange={v => set('facturama_correo_facturacion', v)} placeholder="email@ejemplo.com" />
                  </>
                )}
              </div>
            </div>
          ),
        },
        {
          key: 'comercial', label: 'Comercial',
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-1">
              <div className="space-y-1">
                <OdooSection title="Precios">
                  <OdooField label="Tarifa" value={form.tarifa_id} onChange={v => set('tarifa_id', v || null)} type="select"
                    options={tarifas?.map(t => ({ value: t.id, label: t.nombre })) ?? []} />
                </OdooSection>
                <OdooSection title="Visitas">
                  <OdooField label="Frecuencia" value={form.frecuencia} onChange={v => set('frecuencia', v as FrecuenciaVisita)} type="select"
                    options={frecuenciaOpts} />
                  <div className="odoo-field-row">
                    <span className="odoo-field-label">Días de visita</span>
                    <div className="flex flex-wrap gap-1">
                      {DIAS.map(d => (
                        <button key={d} onClick={() => toggleDia(d)}
                          className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                            (form.dia_visita ?? []).includes(d)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-input text-muted-foreground hover:bg-accent'
                          }`}>
                          {d.substring(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                </OdooSection>
              </div>
              <div className="space-y-1">
                <OdooSection title="Asignación">
                  <OdooField label="Vendedor" value={form.vendedor_id} onChange={v => set('vendedor_id', v || null)} type="select"
                    options={vendedores?.map(v => ({ value: v.id, label: v.nombre })) ?? []} />
                  <OdooField label="Cobrador" value={form.cobrador_id} onChange={v => set('cobrador_id', v || null)} type="select"
                    options={cobradores?.map(c => ({ value: c.id, label: c.nombre })) ?? []} />
                </OdooSection>
                <OdooSection title="Crédito">
                  <div className="odoo-field-row">
                    <span className="odoo-field-label">¿Crédito?</span>
                    <input type="checkbox" checked={!!form.credito} onChange={e => set('credito', e.target.checked)} className="rounded border-input" />
                  </div>
                  {form.credito && (
                    <>
                      <OdooField label="Límite de Crédito" value={form.limite_credito} onChange={v => set('limite_credito', +v)} type="number"
                        format={(v: number) => `$ ${(v ?? 0).toFixed(2)}`} />
                      <OdooField label="Días de Crédito" value={form.dias_credito} onChange={v => set('dias_credito', +v)} type="number" />
                    </>
                  )}
                </OdooSection>
              </div>
            </div>
          ),
        },
        {
          key: 'pedido_sugerido', label: 'Pedido Sugerido',
          content: (
            <div className="max-w-3xl">
              <p className="text-[12px] text-muted-foreground mb-3">
                Define los productos y cantidades que normalmente se surten a este cliente. Se usará como base para calcular el pedido en ruta.
              </p>

              {/* Add product */}
              <div className="mb-3">
                {!showPedidoSearch ? (
                  <button onClick={() => setShowPedidoSearch(true)} className="btn-odoo-secondary text-[12px]">
                    <Plus className="h-3.5 w-3.5" /> Agregar producto
                  </button>
                ) : (
                  <div className="border border-border rounded-md p-2.5 bg-accent/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          className="w-full bg-background rounded-md pl-8 pr-3 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                          placeholder="Buscar producto..."
                          value={pedidoSearch}
                          onChange={e => setPedidoSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <button onClick={() => { setShowPedidoSearch(false); setPedidoSearch(''); }}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="max-h-40 overflow-auto space-y-0.5">
                      {filteredPedidoProducts?.slice(0, 15).map(p => (
                        <button
                          key={p.id}
                          onClick={() => addPedidoProduct(p)}
                          className="w-full text-left px-2.5 py-1.5 rounded hover:bg-accent text-[12px] flex justify-between text-foreground"
                        >
                          <span className="truncate">{p.codigo} — {p.nombre}</span>
                          <span className="text-muted-foreground shrink-0 ml-2">${(p.precio_principal ?? 0).toFixed(2)}</span>
                        </button>
                      ))}
                      {filteredPedidoProducts?.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-2">Sin resultados</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Items table */}
              {pedidoItems.length > 0 ? (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-1.5 font-medium">Producto</th>
                      <th className="text-left py-1.5 font-medium w-20">Código</th>
                      <th className="text-center py-1.5 font-medium w-28">Cantidad</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidoItems.map(item => (
                      <tr key={item.producto_id} className="border-b border-border/40">
                        <td className="py-1.5 text-foreground">{item.nombre}</td>
                        <td className="py-1.5 text-muted-foreground font-mono">{item.codigo}</td>
                        <td className="py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updatePedidoQty(item.producto_id, item.cantidad - 1)} className="w-6 h-6 rounded bg-accent flex items-center justify-center hover:bg-accent/80">
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              className="w-12 text-center bg-transparent text-foreground font-medium focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={item.cantidad}
                              onChange={e => updatePedidoQty(item.producto_id, parseInt(e.target.value) || 0)}
                            />
                            <button onClick={() => updatePedidoQty(item.producto_id, item.cantidad + 1)} className="w-6 h-6 rounded bg-accent flex items-center justify-center hover:bg-accent/80">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-1.5">
                          <button onClick={() => removePedidoItem(item.producto_id)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-[12px] text-muted-foreground text-center py-6 border border-dashed border-border rounded-md">
                  No hay productos configurados. Agrega productos para definir el pedido sugerido.
                </p>
              )}
            </div>
          ),
        },
        {
          key: 'notas', label: 'Notas',
          content: (
            <div className="max-w-2xl">
              <textarea
                className="input-odoo w-full min-h-[120px] text-[13px]"
                value={form.notas ?? ''}
                onChange={e => set('notas', e.target.value)}
                placeholder="Notas internas..."
              />
            </div>
          ),
        },
      ]} />
      </div>
    </div>
  );
}
