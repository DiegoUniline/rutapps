import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useTarifas } from '@/hooks/useData';

const tipoLabel: Record<string, string> = { general: 'General', por_cliente: 'Por Cliente', por_ruta: 'Por Ruta' };

export default function TarifasListPage() {
  const navigate = useNavigate();
  const { data: tarifas, isLoading } = useTarifas();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Tarifas</h1>
        <Button onClick={() => navigate('/tarifas/nueva')} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="h-4 w-4 mr-1.5" /> Nueva Tarifa
        </Button>
      </div>

      <div className="section-card overflow-x-auto">
        {isLoading ? <TableSkeleton rows={5} cols={5} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead className="text-center"># Productos</TableHead>
                <TableHead className="text-center">Activa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tarifas?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No hay tarifas.</TableCell>
                </TableRow>
              )}
              {tarifas?.map(t => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/tarifas/${t.id}`)}>
                  <TableCell className="font-medium">{t.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{tipoLabel[t.tipo] ?? t.tipo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.vigencia_inicio && t.vigencia_fin ? `${t.vigencia_inicio} — ${t.vigencia_fin}` : '—'}
                  </TableCell>
                  <TableCell className="text-center">{t.tarifa_lineas?.length ?? 0}</TableCell>
                  <TableCell className="text-center">
                    {t.activa ? <span className="status-chip status-activo">Activa</span> : <span className="status-chip status-borrador">Inactiva</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
