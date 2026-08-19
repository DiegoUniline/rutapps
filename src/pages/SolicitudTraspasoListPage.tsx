import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { ListPage } from '@/components/layout/ListPage';
import { StatusChip } from '@/components/StatusChip';
import { TableSkeleton } from '@/components/TableSkeleton';
import { fmtDate } from '@/lib/utils';
import {
  useSolicitudesTraspaso,
  SOLICITUD_STATUS_LABELS,
  type StatusSolicitudTraspaso,
} from '@/hooks/useSolicitudesTraspaso';

const STATUS_TABS: Array<{ value: 'todas' | StatusSolicitudTraspaso; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'borrador', label: 'Borradores' },
  { value: 'solicitada', label: 'Solicitadas' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'parcialmente_surtida', label: 'Parciales' },
  { value: 'surtida', label: 'Surtidas' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'cancelada', label: 'Canceladas' },
];

export default function SolicitudTraspasoListPage() {
  const navigate = useNavigate();
  const { data: solicitudes = [], isLoading } = useSolicitudesTraspaso();
  const [tab, setTab] = useState<'todas' | StatusSolicitudTraspaso>('todas');
  const [search, setSearch] = useState('');

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return solicitudes.filter(s => {
      if (tab !== 'todas' && s.status !== tab) return false;
      if (!q) return true;
      return [s.folio, s.almacen_origen?.nombre, s.almacen_destino?.nombre, s.solicitante?.nombre]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [solicitudes, tab, search]);

  const conteo = (value: 'todas' | StatusSolicitudTraspaso) =>
    value === 'todas' ? solicitudes.length : solicitudes.filter(s => s.status === value).length;

  return (
    <ListPage>
      <ListPage.Header
        title="Solicitudes de traspaso"
        actions={
          <button
            onClick={() => navigate('/almacen/solicitudes-traspaso/nueva')}
            className="btn-odoo-primary flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva solicitud
          </button>
        }
      />

      <ListPage.Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar folio, almacén o solicitante..."
              className="input-odoo pl-7 w-64 text-[12px]"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map(t => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-2.5 py-1 rounded text-[12px] border transition-colors ${
                  tab === t.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-foreground border-border hover:bg-secondary/50'
                }`}
              >
                {t.label} ({conteo(t.value)})
              </button>
            ))}
          </div>
        </div>
      </ListPage.Toolbar>

      <ListPage.Body>
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : filtradas.length === 0 ? (
            <p className="text-[12px] text-muted-foreground p-6 text-center">
              No hay solicitudes con este filtro.
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Solicitante</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Creada</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/almacen/solicitudes-traspaso/${s.id}`)}
                    className="border-b border-border cursor-pointer hover:bg-secondary/40"
                  >
                    <td className="px-3 py-2 font-medium">{s.folio || '—'}</td>
                    <td className="px-3 py-2">{fmtDate(s.fecha)}</td>
                    <td className="px-3 py-2">{s.almacen_origen?.nombre || '—'}</td>
                    <td className="px-3 py-2">{s.almacen_destino?.nombre || '—'}</td>
                    <td className="px-3 py-2">{s.solicitante?.nombre || '—'}</td>
                    <td className="px-3 py-2">
                      <StatusChip status={s.status} label={SOLICITUD_STATUS_LABELS[s.status]} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(s.created_at).toLocaleString('es-MX')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </ListPage.Body>
    </ListPage>
  );
}
