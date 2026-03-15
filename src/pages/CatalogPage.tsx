import { useParams } from 'react-router-dom';
import CatalogCRUD, { type CatalogColumn } from '@/components/CatalogCRUD';

const CATALOGS: Record<string, { title: string; tableName: string; queryKey: string; columns: CatalogColumn[] }> = {
  marcas: { title: 'Marcas', tableName: 'marcas', queryKey: 'marcas', columns: [{ key: 'nombre', label: 'Nombre' }] },
  clasificaciones: { title: 'Clasificaciones', tableName: 'clasificaciones', queryKey: 'clasificaciones', columns: [{ key: 'nombre', label: 'Nombre' }] },
  proveedores: { title: 'Proveedores', tableName: 'proveedores', queryKey: 'proveedores', columns: [{ key: 'nombre', label: 'Nombre' }] },
  unidades: { title: 'Unidades', tableName: 'unidades', queryKey: 'unidades', columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'abreviatura', label: 'Abreviatura' }] },
  listas: { title: 'Listas de precios', tableName: 'listas', queryKey: 'listas', columns: [{ key: 'nombre', label: 'Nombre' }] },
  almacenes: { title: 'Almacenes', tableName: 'almacenes', queryKey: 'almacenes', columns: [{ key: 'nombre', label: 'Nombre' }] },
  'tasas-iva': { title: 'Tasas IVA', tableName: 'tasas_iva', queryKey: 'tasas_iva', columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'porcentaje', label: 'Porcentaje %', type: 'number' }] },
  'tasas-ieps': { title: 'Tasas IEPS', tableName: 'tasas_ieps', queryKey: 'tasas_ieps', columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'porcentaje', label: 'Porcentaje %', type: 'number' }] },
};

export default function CatalogPage() {
  const { catalog } = useParams<{ catalog: string }>();
  const config = CATALOGS[catalog ?? ''];

  if (!config) {
    return <div className="p-4 text-muted-foreground">Catálogo no encontrado.</div>;
  }

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground">{config.title}</h1>
      <CatalogCRUD
        title={config.title}
        tableName={config.tableName}
        queryKey={config.queryKey}
        columns={config.columns}
      />
    </div>
  );
}
