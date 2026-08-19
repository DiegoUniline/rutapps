import { useLocation } from 'react-router-dom';
import { OdooTabs } from '@/components/OdooTabs';
import { PreciosTab } from '@/components/producto/PreciosTab';
import { useProductoForm } from './useProductoForm';
import { ProductoHeader } from './ProductoHeader';
import { ProductoGeneralFields } from './ProductoGeneralFields';
import { ProductoFiscalTab } from './ProductoFiscalTab';
import { ProductoComisionesTab } from './ProductoComisionesTab';
import { InventarioTabContent, MinMaxAlmacenTabContent, ProveedoresTabWrapper, KardexTabWrapper } from './ProductoExtraTabs';
import { ProductoPresentacionesTab } from './ProductoPresentacionesTab';
import { ProductoUnidadesStockTab } from './ProductoUnidadesStockTab';
import { ProductoConfigCompraTab } from './ProductoConfigCompraTab';

export default function ProductoFormPage() {
  const h = useProductoForm();
  const location = useLocation();
  const fromPath = (location.state as { from?: string } | null)?.from || '/productos';

  return (
    <div className="p-4 min-h-full">
      <ProductoHeader
        form={h.form} set={h.set} setForm={h.setForm as any} isNew={h.isNew} isDirty={h.isDirty}
        starred={h.starred} setStarred={h.setStarred} editingName={h.editingName} setEditingName={h.setEditingName}
        nameInputRef={h.nameInputRef as any} imageInputRef={h.imageInputRef as any} uploadingImage={h.uploadingImage}
        handleImageUpload={h.handleImageUpload} handleSave={h.handleSave} handleDelete={h.handleDelete}
        onDiscard={() => h.navigate(fromPath)} saving={h.saveMutation.isPending}
      />
      <div className="bg-card border border-border rounded px-4 pb-4 pt-3">
        <ProductoGeneralFields
          form={h.form} set={h.set} setForm={h.setForm as any}
          marcas={h.marcas} clasificaciones={h.clasificaciones} listas={h.listas}
          tarifasDisp={h.tarifasDisp as any}
          unidades={h.unidades} unidadesSat={h.unidadesSat}
          createMarca={h.createMarca} createClasificacion={h.createClasificacion}
          createUnidad={h.createUnidad} createLista={h.createLista}
        />
        <OdooTabs tabs={[
          ...((h.form as any).usa_listas_precio ? [{
            key: 'precios', label: 'Reglas de precio',
            content: <PreciosTab form={h.form} tarifaLineas={h.tarifaLineas} tarifasDisp={h.tarifasDisp} productoId={h.id} isNew={h.isNew} navigate={h.navigate} />,
          }] : []),
          ...(!h.isNew && (h.form as any).usa_presentaciones ? [{
            key: 'presentaciones', label: 'Presentaciones',
            content: <ProductoPresentacionesTab productoId={h.id} isNew={h.isNew} esGranel={!!(h.form as any).es_granel} unidadGranel={(h.form as any).unidad_granel || 'kg'} precioPorUnidadBase={Number((h.form as any).precio_principal) || 0} />,
          }] : []),
          ...(!h.isNew ? [{
            key: 'unidades_stock', label: 'Unidades de Stock',
            content: <ProductoUnidadesStockTab productoId={h.id} isNew={h.isNew} esGranel={!!(h.form as any).es_granel} unidadGranel={(h.form as any).unidad_granel || 'kg'} />,
          }] : []),
          { key: 'fiscal', label: 'Fiscal', content: <ProductoFiscalTab form={h.form} set={h.set} unidadesSat={h.unidadesSat} /> },
          { key: 'comisiones', label: 'Comisiones', content: <ProductoComisionesTab form={h.form} set={h.set} tarifaLineas={h.tarifaLineas} /> },
          { key: 'inventario', label: 'Inventario', content: <InventarioTabContent form={h.form} set={h.set} productoId={h.form?.id} isNew={h.isNew} /> },
          { key: 'minmax_almacen', label: 'Mín/Máx por almacén', content: <MinMaxAlmacenTabContent form={h.form} set={h.set} productoId={h.form?.id} isNew={h.isNew} /> },
          { key: 'proveedores', label: 'Proveedores', content: <ProveedoresTabWrapper productoId={h.id} isNew={h.isNew} proveedores={h.proveedores ?? []} prodProveedores={h.prodProveedores ?? []} saveProvMut={h.saveProvMut} deleteProvMut={h.deleteProvMut} createProveedor={h.createProveedor} /> },
          { key: 'config_compra', label: 'Config. compra', content: <ProductoConfigCompraTab form={h.form} set={h.set} proveedores={h.proveedores} createProveedor={h.createProveedor} /> },
          { key: 'kardex', label: 'Kardex', content: <KardexTabWrapper productoId={h.id} isNew={h.isNew} /> },
        ]} />
      </div>
    </div>
  );
}
