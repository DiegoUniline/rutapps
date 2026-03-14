import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Warehouse, Search } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CatalogCRUD } from '@/components/CatalogCRUD';

export default function AlmacenesPage() {
  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Warehouse className="h-5 w-5" /> Almacenes
      </h1>
      <CatalogCRUD tableName="almacenes" singularLabel="almacén" pluralLabel="Almacenes" />
    </div>
  );
}
