import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { TableSkeleton } from '@/components/TableSkeleton';

interface CatRow {
  id: string;
  clave: string;
  descripcion: string;
  activo?: boolean;
  persona_fisica?: boolean;
  persona_moral?: boolean;
  porcentaje?: number;
  nombre?: string;
}

interface CatalogDef {
  key: string;
  table: string;
  label: string;
  hasPersona: boolean;
  isTasa?: boolean;
  isUnidad?: boolean;
}

const CATALOGS: CatalogDef[] = [
  { key: 'regimen', table: 'cat_regimen_fiscal', label: 'Régimen Fiscal', hasPersona: true },
  { key: 'uso_cfdi', table: 'cat_uso_cfdi', label: 'Uso CFDI', hasPersona: true },
  { key: 'forma_pago', table: 'cat_forma_pago', label: 'Forma de Pago', hasPersona: false },
  { key: 'metodo_pago', table: 'cat_metodo_pago', label: 'Método de Pago', hasPersona: false },
  { key: 'moneda', table: 'cat_moneda', label: 'Moneda', hasPersona: false },
  { key: 'tipo_comp', table: 'cat_tipo_comprobante', label: 'Tipo Comprobante', hasPersona: false },
  { key: 'tasas_iva', table: 'tasas_iva', label: 'Tasas IVA', hasPersona: false, isTasa: true },
  { key: 'tasas_ieps', table: 'tasas_ieps', label: 'Tasas IEPS', hasPersona: false, isTasa: true },
  { key: 'tasas_isr_ret', table: 'tasas_isr_ret', label: 'Ret. ISR', hasPersona: false, isTasa: true },
  { key: 'tasas_iva_ret', table: 'tasas_iva_ret', label: 'Ret. IVA', hasPersona: false, isTasa: true },
  { key: 'unidades_sat', table: 'unidades_sat', label: 'Unidades SAT', hasPersona: false, isUnidad: true },
];

function CatalogTable({ catalog }: { catalog: CatalogDef }) {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['cat', catalog.table],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const selectCols = catalog.isTasa
        ? 'id, nombre, porcentaje'
        : catalog.isUnidad
        ? 'id, clave, nombre'
        : '*';
      const { data, error } = await (supabase.from as any)(catalog.table)
        .select(selectCols)
        .order(catalog.isTasa ? 'nombre' : catalog.isUnidad ? 'nombre' : 'clave');
      if (error) throw error;
      return data as CatRow[];
    },
  });

  const filtered = (data || []).filter((r) => {
    const q = search.toLowerCase();
    const desc = (r.descripcion || r.nombre || '').toLowerCase();
    const clave = (r.clave || '').toLowerCase();
    return desc.includes(q) || clave.includes(q);
  });

  if (isLoading) return <TableSkeleton rows={8} cols={3} />;

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-280px)]">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Badge variant="secondary" className="text-xs">{filtered.length} registros</Badge>
      </div>

      <div className="border rounded-lg overflow-hidden flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {catalog.isTasa ? (
                <>
                  <TableHead className="w-[200px]">Nombre</TableHead>
                  <TableHead className="w-[120px]">Porcentaje</TableHead>
                </>
              ) : catalog.isUnidad ? (
                <>
                  <TableHead className="w-[120px]">Clave</TableHead>
                  <TableHead>Nombre</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="w-[100px]">Clave</TableHead>
                  <TableHead>Descripción</TableHead>
                  {catalog.hasPersona && (
                    <>
                      <TableHead className="w-[100px] text-center">P. Física</TableHead>
                      <TableHead className="w-[100px] text-center">P. Moral</TableHead>
                    </>
                  )}
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin resultados</TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className="text-[13px]">
                  {catalog.isTasa ? (
                    <>
                      <TableCell className="font-medium">{row.nombre}</TableCell>
                      <TableCell>{row.porcentaje}%</TableCell>
                    </>
                  ) : catalog.isUnidad ? (
                    <>
                      <TableCell className="font-mono text-xs">{row.clave}</TableCell>
                      <TableCell>{row.nombre}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-mono text-xs font-semibold">{row.clave}</TableCell>
                      <TableCell>{row.descripcion}</TableCell>
                      {catalog.hasPersona && (
                        <>
                          <TableCell className="text-center">{row.persona_fisica ? '✓' : '—'}</TableCell>
                          <TableCell className="text-center">{row.persona_moral ? '✓' : '—'}</TableCell>
                        </>
                      )}
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function CatalogosTab() {
  return (
    <Tabs defaultValue="regimen" className="w-full">
      <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
        {CATALOGS.map((c) => (
          <TabsTrigger key={c.key} value={c.key} className="text-xs">{c.label}</TabsTrigger>
        ))}
      </TabsList>
      {CATALOGS.map((c) => (
        <TabsContent key={c.key} value={c.key} className="mt-4">
          <CatalogTable catalog={c} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
