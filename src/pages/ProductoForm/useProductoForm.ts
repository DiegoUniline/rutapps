import { useState, useEffect, useRef, useMemo, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useProducto, useSaveProducto, useDeleteProducto, useMarcas, useProveedores, useClasificaciones, useListas, useUnidades, useTasasIva, useTasasIeps, useAlmacenes, useUnidadesSat, useAllListasPrecios, useTarifaLineasForProducto, useSaveProductoProveedor, useDeleteProductoProveedor, useProductoProveedores } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { compressPhoto } from '@/lib/imageCompressor';
import { toast } from 'sonner';
import type { Producto } from '@/types';
import { confirmDialog } from '@/lib/confirm';
import { puedeReemplazarFormulario } from '@/lib/formSync';

async function quickCreateCatalog(
  tableName: string, nombre: string, queryKey: string,
  qc: ReturnType<typeof useQueryClient>, extra?: Record<string, any>,
): Promise<string | undefined> {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('empresa_id').eq('user_id', authUser?.id ?? '').maybeSingle();
    if (!profile?.empresa_id) { toast.error('Sin perfil de empresa'); return undefined; }
    const { data, error } = await (supabase.from as any)(tableName).insert({ nombre, empresa_id: profile.empresa_id, ...extra }).select('id').single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: [queryKey] });
    toast.success(`"${nombre}" creado`);
    return data.id as string;
  } catch (err: any) { toast.error(err.message); return undefined; }
}

export const defaultProduct: Partial<Producto & { usa_listas_precio?: boolean }> = {
  codigo: '', nombre: '', clave_alterna: '', costo: 0, precio_principal: 0, precio_sugerido_publico: 0,
  se_puede_comprar: true, se_puede_vender: true, vender_sin_stock: false,
  se_puede_inventariar: true, es_combo: false, min: 0, max: 0,
  factor_conversion: 1, permitir_descuento: false,
  monto_maximo: 0, cantidad: 0, tiene_comision: false, tipo_comision: 'porcentaje',
  es_granel: false, unidad_granel: 'kg',
  pct_comision: 0, status: 'activo', almacenes: [], tiene_iva: false,
  tiene_ieps: false, calculo_costo: 'promedio', codigo_sat: '',
  iva_pct: 16, ieps_pct: 0, ieps_tipo: 'porcentaje',
  costo_incluye_impuestos: false, usa_listas_precio: false, grupo_precio: null,
};

export function useProductoForm() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';
  const { data: existing } = useProducto(isNew ? undefined : id);
  const saveMutation = useSaveProducto();
  const deleteMutation = useDeleteProducto();

  const createMarca = (name: string) => quickCreateCatalog('marcas', name, 'marcas', qc);
  const createClasificacion = (name: string) => quickCreateCatalog('clasificaciones', name, 'clasificaciones', qc);
  const createUnidad = (name: string) => quickCreateCatalog('unidades', name, 'unidades', qc);
  const createLista = (name: string) => quickCreateCatalog('listas', name, 'listas', qc);
  const createProveedor = (name: string) => quickCreateCatalog('proveedores', name, 'proveedores', qc);

  const { data: marcas } = useMarcas();
  const { data: proveedores } = useProveedores();
  const { data: clasificaciones } = useClasificaciones();
  const { data: listas } = useListas();
  const { data: unidades } = useUnidades();
  const { data: tasasIva } = useTasasIva();
  const { data: tasasIeps } = useTasasIeps();
  const { data: almacenes } = useAlmacenes();
  const { data: unidadesSat } = useUnidadesSat();
  const { data: tarifasDisp } = useAllListasPrecios(empresa?.id);
  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [originalForm, setOriginalForm] = useState<Partial<Producto>>(defaultProduct);

  // Categoría/marca/unidad asignadas pero dadas de baja: se agregan a las opciones marcadas
  // «(inactiva)» para que el detalle muestre lo mismo que la lista (antes el campo salía vacío).
  const faltantes = useMemo(() => {
    const falta = (lista: { id: string }[] | undefined, id?: string | null) => (id && lista && !lista.some(x => x.id === id) ? [id] : []);
    return {
      marcas: falta(marcas, form.marca_id),
      clasificaciones: falta(clasificaciones, form.clasificacion_id),
      unidades: Array.from(new Set([...falta(unidades, form.unidad_venta_id), ...falta(unidades, form.unidad_compra_id)])),
    };
  }, [marcas, clasificaciones, unidades, form.marca_id, form.clasificacion_id, form.unidad_venta_id, form.unidad_compra_id]);
  const { data: inactivos } = useQuery({
    queryKey: ['producto-catalogos-inactivos', faltantes],
    enabled: faltantes.marcas.length + faltantes.clasificaciones.length + faltantes.unidades.length > 0,
    queryFn: async () => {
      const leer = async (tabla: string, ids: string[], cols: string) => {
        if (!ids.length) return [] as any[];
        const { data, error } = await (supabase.from as any)(tabla).select(cols).in('id', ids);
        if (error) throw error;
        return (data ?? []) as any[];
      };
      const [m, c, u] = await Promise.all([
        leer('marcas', faltantes.marcas, 'id, nombre'),
        leer('clasificaciones', faltantes.clasificaciones, 'id, nombre'),
        leer('unidades', faltantes.unidades, 'id, nombre, abreviatura'),
      ]);
      const inact = (x: any) => ({ ...x, nombre: `${x.nombre} (inactiva)` });
      return { marcas: m.map(inact), clasificaciones: c.map(inact), unidades: u.map(inact) };
    },
  });
  const marcasOpc = useMemo(() => [...(marcas ?? []), ...(inactivos?.marcas ?? [])], [marcas, inactivos]);
  const clasificacionesOpc = useMemo(() => [...(clasificaciones ?? []), ...(inactivos?.clasificaciones ?? [])], [clasificaciones, inactivos]);
  const unidadesOpc = useMemo(() => [...(unidades ?? []), ...(inactivos?.unidades ?? [])], [unidades, inactivos]);

  const { data: tarifaLineas } = useTarifaLineasForProducto(isNew ? undefined : id, form.clasificacion_id, (form as any).lista_id);
  const { data: prodProveedores } = useProductoProveedores(isNew ? undefined : id);
  const saveProvMut = useSaveProductoProveedor();
  const deleteProvMut = useDeleteProductoProveedor();

  const [starred, setStarred] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isNew) return;
    setForm(prev => {
      const updates: Partial<Producto> = {};
      if (almacenes?.length && !(prev.almacenes ?? []).length) updates.almacenes = almacenes.map(a => a.id);
      if (unidades?.length && !prev.unidad_venta_id) {
        const pieza = unidades.find(u => u.nombre.toLowerCase() === 'pieza') ?? unidades[0];
        updates.unidad_venta_id = pieza.id;
        updates.unidad_compra_id = pieza.id;
      }
      if (listas?.length && !prev.lista_id) {
        const general = listas.find(l => l.nombre.toLowerCase().includes('general')) ?? listas[0];
        updates.lista_id = general.id;
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [isNew, almacenes, unidades, listas]);

  // Un refresco del registro (guardar algo relacionado aquí o en otra pantalla) se refleja,
  // pero nunca pisa cambios sin guardar del usuario.
  useEffect(() => {
    if (existing && puedeReemplazarFormulario(form, originalForm, existing)) { setForm(existing); setOriginalForm(existing); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al llegar una versión nueva del registro
  }, [existing]);

  const set = (key: keyof Producto, value: any) => setForm(prev => ({ ...prev, [key]: value }));
  const isDirty = isNew || JSON.stringify(form) !== JSON.stringify(originalForm);

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !empresa?.id) return;
    setUploadingImage(true);
    try {
      const compressed = await compressPhoto(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const productId = id && !isNew ? id : crypto.randomUUID();
      const path = `${empresa.id}/productos/${productId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('empresa-assets').upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(path);
      set('imagen_url', urlData.publicUrl + '?t=' + Date.now());
      toast.success('Imagen cargada');
    } catch (err: any) { toast.error('Error al subir imagen: ' + err.message); }
    finally { setUploadingImage(false); if (imageInputRef.current) imageInputRef.current.value = ''; }
  };

  const handleSave = async () => {
    if (!form.codigo || !form.nombre) { toast.error('Código y nombre son obligatorios'); return; }
    try {
      const result = await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      toast.success('Producto guardado');
      setOriginalForm({ ...form });
      if (isNew && result?.id) navigate(`/productos/${result.id}`, { replace: true });
    } catch (err: any) { console.error('Error guardando producto:', err); toast.error(err.message || 'Error al guardar'); }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!await confirmDialog('¿Eliminar este producto?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Producto eliminado');
      navigate('/productos');
    } catch (err: any) { toast.error(err.message); }
  };

  return {
    id, isNew, navigate, form, setForm, set, isDirty, starred, setStarred,
    editingName, setEditingName, nameInputRef, imageInputRef, uploadingImage,
    handleImageUpload, handleSave, handleDelete, saveMutation,
    marcas: marcasOpc, proveedores, clasificaciones: clasificacionesOpc, listas, unidades: unidadesOpc,
    tasasIva, tasasIeps, almacenes, unidadesSat, tarifasDisp,
    tarifaLineas, prodProveedores, saveProvMut, deleteProvMut,
    createMarca, createClasificacion, createUnidad, createLista, createProveedor,
  };
}
