import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Truck, Package, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useLogisticaKpis, useCargasDia } from '@/hooks/useLogistica';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/TableSkeleton';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { cn , todayLocal } from '@/lib/utils';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'outline' },
  confirmada: { label: 'Confirmada', variant: 'secondary' },
  en_ruta: { label: 'En ruta', variant: 'default' },
  completada: { label: 'Completada', variant: 'secondary' },
};

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
      <div className={cn('p-2.5 rounded-lg', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function LogisticaDashboardPage() {
  const navigate = useNavigate();
  const [fecha] = useState(() => todayLocal());
  const { data: kpis, isLoading: loadingKpis } = useLogisticaKpis(fecha);
  const { data: cargas, isLoading: loadingCargas } = useCargasDia(fecha);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" /> Logística — Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Resumen de operaciones del día</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Package} label="Pedidos del día" value={kpis?.totalPedidos ?? 0} color="bg-blue-500" />
        <KpiCard icon={AlertTriangle} label="Sin asignar" value={kpis?.sinAsignar ?? 0} color="bg-amber-500" />
        <KpiCard icon={Truck} label="Camiones" value={kpis?.totalCamiones ?? 0} color="bg-slate-500" />
        <KpiCard icon={CheckCircle} label="Cargas listas" value={kpis?.cargasListas ?? 0} color="bg-emerald-500" />
        <KpiCard icon={Clock} label="En ruta" value={kpis?.enRuta ?? 0} color="bg-violet-500" />
        <KpiCard icon={CheckCircle} label="Entregados" value={kpis?.entregados ?? 0} color="bg-green-600" />
      </div>

      {/* Cargas del día */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Camiones del día</h2>
        {loadingCargas ? <TableSkeleton /> : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Status carga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!cargas || cargas.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin camiones para hoy</TableCell></TableRow>
                )}
                {cargas?.map((c: any) => {
                  const sc = statusConfig[c.status] ?? statusConfig.pendiente;
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/logistica/orden-carga/${c.id}`)}>
                      <TableCell className="font-medium">{(c.vendedores as any)?.nombre ?? '—'}</TableCell>
                      <TableCell className="text-[13px]">{(c as any).almacen_origen?.nombre ?? '—'}</TableCell>
                      <TableCell className="text-[13px]">{(c as any).almacen_destino?.nombre ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{(c.carga_lineas ?? []).length} productos</TableCell>
                      <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
