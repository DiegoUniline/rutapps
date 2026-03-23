import { OdooTabs } from '@/components/OdooTabs';
import { PreciosTab } from '@/components/producto/PreciosTab';
import { useProductoForm } from './useProductoForm';
import { ProductoHeader } from './ProductoHeader';
import { ProductoGeneralFields } from './ProductoGeneralFields';
import { ProductoFiscalTab } from './ProductoFiscalTab';
import { ProductoComisionesTab } from './ProductoComisionesTab';
import { AlmacenesTabContent, InventarioTabContent, ProveedoresTabWrapper, KardexTabWrapper } from './ProductoExtraTabs';

export default function ProductoFormPage() {
  const h = useProductoForm();

  return (
    <div className="p-4 min-h-full">
      <ProductoHeader
        form={h.form} set={h.set} setForm={h.setForm as any} isNew={h.isNew} isDirty={h.isDirty}
        starred={h.starred} setStarred={h.setStarred} editingName={h.editingName} setEditingName={h.setEditingName}
        nameInputRef={h.nameInputRef as any} imageInputRef={h.imageInputRef as any} uploadingImage={h.uploadingImage}
        handleImageUpload={h.handleImageUpload} handleSave={h.handleSave} handleDelete={h.handleDelete}
        onDiscard={() => h.navigate('/productos')} saving={h.saveMutation.isPending}
      />
      <div className="bg-card border border-border rounded px-4 pb-4 pt-3">
        <ProductoGeneralFields
          form={h.form} set={h.set} setForm={h.setForm as any}
          marcas={h.marcas} clasificaciones={h.clasificaciones} listas={h.listas}
          unidades={h.unidades} unidadesSat={h.unidadesSat}
          createMarca={h.createMarca} createClasificacion={h.createClasificacion}
          createUnidad={h.createUnidad} createLista={h.createLista}
        />
        <OdooTabs tabs={[
          ...((h.form as any).usa_listas_precio ? [{
            key: 'precios', label: 'Reglas de precio',
            content: <PreciosTab form={h.form} tarifaLineas={h.tarifaLineas} tarifasDisp={h.tarifasDisp} productoId={h.id} isNew={h.isNew} navigate={h.navigate} />,
          }] : []),
          { key: 'fiscal', label: 'Fiscal', content: <ProductoFiscalTab form={h.form} set={h.set} unidadesSat={h.unidadesSat} /> },
          { key: 'comisiones', label: 'Comisiones', content: <ProductoComisionesTab form={h.form} set={h.set} tarifaLineas={h.tarifaLineas} /> },
          { key: 'almacenes', label: 'Almacenes', content: <AlmacenesTabContent form={h.form} set={h.set} almacenes={h.almacenes} /> },
          { key: 'inventario', label: 'Inventario', content: <InventarioTabContent form={h.form} set={h.set} /> },
          { key: 'proveedores', label: 'Proveedores', content: <ProveedoresTabWrapper productoId={h.id} isNew={h.isNew} proveedores={h.proveedores ?? []} prodProveedores={h.prodProveedores ?? []} saveProvMut={h.saveProvMut} deleteProvMut={h.deleteProvMut} createProveedor={h.createProveedor} /> },
          { key: 'kardex', label: 'Kardex', content: <KardexTabWrapper productoId={h.id} isNew={h.isNew} /> },
        ]} />
      </div>
    </div>
  );
}
