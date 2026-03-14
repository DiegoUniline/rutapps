import { Warehouse } from 'lucide-react';
import CatalogCRUD from '@/components/CatalogCRUD';

export default function AlmacenesPage() {
  return (
    <div className="p-4 space-y-4 min-h-full">
      <CatalogCRUD
        title="Almacenes"
        tableName="almacenes"
        columns={[{ key: 'nombre', label: 'Nombre', type: 'text' }]}
        queryKey="almacenes"
      />
    </div>
  );
}
