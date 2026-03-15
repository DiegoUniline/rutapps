import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, Search } from 'lucide-react';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { StatusChip } from '@/components/StatusChip';
import { fmtDate, cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

const COLUMNS: ExportColumn[] = [
  { key: 'folio', header: 'Folio', width: 12 },
  { key: 'proveedor', header: 'Proveedor', width: 25 },
  { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
  { key: 'total', header: 'Total', format: 'currency', width: 14 },
  { key: 'pagado', header: 'Pagado', format: 'currency', width: 14 },
  { key: 'saldo', header: 'Saldo', format: 'currency', width: 14 },
  { key: 'status', header: 'Estado', width: 12 },
];

const PAGE_SIZE = 80;

function useCuentasPagar(search: string) {
  return useQuery({
    queryKey: ['cuentas-pagar', search],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status, dias_credito, proveedores(nombre)')
        .eq('condicion_pago', 'credito' as any)
        .in('status', ['confirmada', 'recibida', 'pagada'] as any)
        .order('fecha', { ascending: true });
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter((c: any) =>
          (c.folio ?? '').toLowerCase().includes(s) ||
          ((c.proveedores as any)?.nombre ?? '').toLowerCase().includes(s)
        );
      }
      return filtered;
    },
  });
}

export default function CuentasPagarPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data: cuentas, isLoading } = useCuentasPagar(search);

  const total = cuentas?.length ?? 0;
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  const pageData = cuentas?.slice(from - 1, to) ?? [];

  const totalPorPagar = cuentas?.reduce((s, c: any) => s + (c.saldo_pendiente ?? 0), 0) ?? 0;
  const totalCompras = cuentas?.reduce((s, c: any) => s + (c.total ?? 0), 0) ?? 0;
  const conSaldo = cuentas?.filter((c: any) => (c.saldo_pendiente ?? 0) > 0).length ?? 0;

  const exportData = (cuentas ?? []).map((c: any) => ({
    folio: c.folio ?? '',
    proveedor: c.proveedores?.nombre ?? '',
    fecha: c.fecha,
    total: c.total ?? 0,
    pagado: (c.total ?? 0) - (c.saldo_pendiente ?? 0),
    saldo: c.saldo_pendiente ?? 0,
    status: c.status,
  }));

  return (
    <div className="p-4 space-y-3 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <TrendingDown className="h-5 w-5" /> Cuentas por pagar
      </h1>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total por pagar</p>
          <p className="text-2xl font-bold text-destructive">$ {fmt(totalPorPagar)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total compras crédito</p>
          <p className="text-2xl font-bold text-foreground">$ {fmt(totalCompras)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Con saldo pendiente</p>
          <p className="text-2xl font-bold text-warning">{conSaldo}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <OdooFilterBar
          search={search}
          onSearchChange={val => { setSearch(val); setPage(1); }}
          placeholder="Buscar proveedor o folio..."
        />
        <ExportButton
          onExcel={() => exportToExcel({
            fileName: 'CuentasPorPagar', title: 'Cuentas por Pagar',
            columns: COLUMNS, data: exportData,
            totals: { total: totalCompras, saldo: totalPorPagar },
          })}
          onPDF={() => exportToPDF({
            fileName: 'CuentasPorPagar', title: 'Cuentas por Pagar',
            columns: COLUMNS, data: exportData,
            totals: { total: totalCompras, saldo: totalPorPagar },
          })}
        />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-table-border">
              <th className="th-odoo text-left">Folio</th>
              <th className="th-odoo text-left">Proveedor</th>
              <th className="th-odoo text-left">Fecha</th>
              <th className="th-odoo text-center">Días crédito</th>
              <th className="th-odoo text-right">Total</th>
              <th className="th-odoo text-right">Pagado</th>
              <th className="th-odoo text-right">Saldo</th>
              <th className="th-odoo text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 && !isLoading && (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">Sin cuentas por pagar</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">Cargando...</td></tr>
            )}
            {pageData.map((c: any) => {
              const pagado = (c.total ?? 0) - (c.saldo_pendiente ?? 0);
              return (
                <tr
                  key={c.id}
                  className="border-b border-table-border cursor-pointer hover:bg-table-hover transition-colors"
                  onClick={() => navigate(`/almacen/compras/${c.id}`)}
                >
                  <td className="py-1.5 px-3 font-mono text-xs">{c.folio ?? c.id.slice(0, 8)}</td>
                  <td className="py-1.5 px-3 font-medium">{c.proveedores?.nombre ?? '—'}</td>
                  <td className="py-1.5 px-3">{fmtDate(c.fecha)}</td>
                  <td className="py-1.5 px-3 text-center text-muted-foreground">{c.dias_credito ?? 0} días</td>
                  <td className="py-1.5 px-3 text-right">$ {fmt(c.total ?? 0)}</td>
                  <td className="py-1.5 px-3 text-right text-success">$ {fmt(pagado)}</td>
                  <td className="py-1.5 px-3 text-right font-bold">
                    {(c.saldo_pendiente ?? 0) > 0 ? (
                      <span className="text-destructive">$ {fmt(c.saldo_pendiente)}</span>
                    ) : (
                      <span className="text-success">$ 0.00</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <StatusChip status={c.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {total > 0 && (
          <OdooPagination from={from} to={to} total={total}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => p + 1)}
          />
        )}
      </div>
    </div>
  );
}
