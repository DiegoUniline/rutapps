import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useProducto, useSaveProducto, useDeleteProducto, useMarcas, useProveedores, useClasificaciones, useListas, useUnidades, useTasasIva, useTasasIeps, useAlmacenes, useUnidadesSat, useTarifasForSelect, useTarifaLineasForProducto, useSaveProductoProveedor, useDeleteProductoProveedor, useProductoProveedores } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { compressPhoto } from '@/lib/imageCompressor';
import { toast } from 'sonner';
import type { Producto } from '@/types';

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
  codigo: '', nombre: '', clave_alterna: '', costo: 0, precio_principal: 0,
  se_puede_comprar: true, se_puede_vender: true, vender_sin_stock: false,
  se_puede_inventariar: true, es_combo: false, min: 0, max: 0,
  manejar_lotes: false, factor_conversion: 1, permitir_descuento: false,
  monto_maximo: 0, cantidad: 0, tiene_comision: false, tipo_comision: 'porcentaje',
  pct_comision: 0, status: 'activo', almacenes: [], tiene_iva: false,
  tiene_ieps: false, calculo_costo: 'promedio', codigo_sat: '', contador: 0,
  contador_tarifas: 0, iva_pct: 16, ieps_pct: 0, ieps_tipo: 'porcentaje',
  costo_incluye_impuestos: false, usa_listas_precio: false,
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
  const { data: tarifasDisp } = useTarifasForSelect();
  const { data: tarifaLineas } = useTarifaLineasForProducto(isNew ? undefined : id, undefined);
  const { data: prodProveedores } = useProductoProveedores(isNew ? undefined : id);
  const saveProvMut = useSaveProductoProveedor();
  const deleteProvMut = useDeleteProductoProveedor();

  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [originalForm, setOriginalForm] = useState<Partial<Producto>>(defaultProduct);
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

  useEffect(() => { if (existing) { setForm(existing); setOriginalForm(existing); } }, [existing]);

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
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('¿Eliminar este producto?')) return;
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
    marcas, proveedores, clasificaciones, listas, unidades,
    tasasIva, tasasIeps, almacenes, unidadesSat, tarifasDisp,
    tarifaLineas, prodProveedores, saveProvMut, deleteProvMut,
    createMarca, createClasificacion, createUnidad, createLista, createProveedor,
  };
}
