import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, MapPin, Image as ImageIcon } from 'lucide-react';

export default function JornadasRutaPage() {
  const { empresa } = useAuth();
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: sesiones = [], isLoading } = useQuery({
    queryKey: ['ruta-sesiones', empresa?.id, desde, hasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ruta_sesiones')
        .select('*, vehiculos(alias, placa), profiles!ruta_sesiones_vendedor_id_fkey(nombre)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('inicio_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDur = (start: string, end?: string | null) => {
    if (!end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3.6e6);
    const m = Math.floor((ms % 3.6e6) / 6e4);
    return `${h}h ${m}m`;
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" /> Jornadas de ruta
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Auditoría de salidas a ruta: vehículo, kilometraje, fotos y tiempo.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="w-44" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="w-44" />
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {sesiones.length} jornada{sesiones.length !== 1 ? 's' : ''}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-3 text-left">Fecha</th>
              <th className="px-3 py-3 text-left">Vendedor</th>
              <th className="px-3 py-3 text-left">Vehículo</th>
              <th className="px-3 py-3 text-left">Inicio</th>
              <th className="px-3 py-3 text-left">Fin</th>
              <th className="px-3 py-3 text-right">KM ini</th>
              <th className="px-3 py-3 text-right">KM fin</th>
              <th className="px-3 py-3 text-right">Recorrido</th>
              <th className="px-3 py-3 text-left">Duración</th>
              <th className="px-3 py-3 text-left">Estado</th>
              <th className="px-3 py-3 text-center">Fotos</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Cargando...</td></tr>
            ) : sesiones.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Sin jornadas en este rango.</td></tr>
            ) : sesiones.map((s: any) => (
              <tr key={s.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-3 py-2.5">{s.fecha}</td>
                <td className="px-3 py-2.5 font-medium">{s.profiles?.nombre || '—'}</td>
                <td className="px-3 py-2.5">{s.vehiculos?.alias} {s.vehiculos?.placa && <span className="text-muted-foreground">({s.vehiculos.placa})</span>}</td>
                <td className="px-3 py-2.5">{fmtTime(s.inicio_at)}</td>
                <td className="px-3 py-2.5">{fmtTime(s.fin_at)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{Number(s.km_inicio).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.km_fin != null ? Number(s.km_fin).toLocaleString() : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{s.km_recorridos != null ? Number(s.km_recorridos).toLocaleString() : '—'}</td>
                <td className="px-3 py-2.5">{fmtDur(s.inicio_at, s.fin_at)}</td>
                <td className="px-3 py-2.5">
                  <Badge variant={s.status === 'en_ruta' ? 'default' : s.status === 'cerrada' ? 'secondary' : 'outline'}>
                    {s.status === 'en_ruta' ? 'En ruta' : s.status === 'cerrada' ? 'Cerrada' : 'Cancelada'}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {s.foto_inicio_url && <a href={s.foto_inicio_url} target="_blank" rel="noreferrer" title="Foto inicio"><ImageIcon className="h-4 w-4 text-success" /></a>}
                    {s.foto_fin_url && <a href={s.foto_fin_url} target="_blank" rel="noreferrer" title="Foto fin"><ImageIcon className="h-4 w-4 text-primary" /></a>}
                    {s.lat_inicio && <a href={`https://www.google.com/maps?q=${s.lat_inicio},${s.lng_inicio}`} target="_blank" rel="noreferrer" title="Ubicación inicio"><MapPin className="h-4 w-4 text-muted-foreground" /></a>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
