import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Gauge, Download } from 'lucide-react';
import { formatBytes, todayKey, flushDataUsage } from '@/lib/dataUsage';
import { DataUsageCard } from '@/components/DataUsageCard';

interface ConsumoRow {
  id: string;
  user_id: string;
  fecha: string;
  origen: 'ruta' | 'escritorio';
  bytes_descarga: number;
  bytes_subida: number;
  peticiones: number;
  desglose: any;
}

function defaultDesde(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return todayKey(d);
}

export default function ConsumoDatosPage() {
  const { empresa } = useAuth();
  const [desde, setDesde] = useState(defaultDesde());
  const [hasta, setHasta] = useState(todayKey());

  const { data: usuarios = [] } = useQuery({
    queryKey: ['consumo-datos-usuarios', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, nombre').eq('empresa_id', empresa!.id);
      return data || [];
    },
  });

  const nombrePorUser = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of usuarios as any[]) if (u.user_id) map[u.user_id] = u.nombre;
    return map;
  }, [usuarios]);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['consumo-datos', empresa?.id, desde, hasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consumo_datos')
        .select('id, user_id, fecha, origen, bytes_descarga, bytes_subida, peticiones, desglose')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return (data || []) as ConsumoRow[];
    },
  });

  const totales = useMemo(() => {
    const totalBytes = rows.reduce((s, r) => s + Number(r.bytes_descarga) + Number(r.bytes_subida), 0);
    const ruta = rows.filter(r => r.origen === 'ruta').reduce((s, r) => s + Number(r.bytes_descarga) + Number(r.bytes_subida), 0);
    const escritorio = totalBytes - ruta;
    return { totalBytes, ruta, escritorio };
  }, [rows]);

  const porUsuario = useMemo(() => {
    const acc: Record<string, { bytes: number; peticiones: number; dias: Set<string> }> = {};
    for (const r of rows) {
      const key = r.user_id;
      acc[key] ||= { bytes: 0, peticiones: 0, dias: new Set() };
      acc[key].bytes += Number(r.bytes_descarga) + Number(r.bytes_subida);
      acc[key].peticiones += r.peticiones;
      acc[key].dias.add(r.fecha);
    }
    return Object.entries(acc)
      .map(([userId, v]) => ({
        userId,
        nombre: nombrePorUser[userId] || 'Usuario',
        bytes: v.bytes,
        peticiones: v.peticiones,
        dias: v.dias.size,
        promedioDia: v.dias.size ? v.bytes / v.dias.size : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);
  }, [rows, nombrePorUser]);

  const exportarCsv = () => {
    const header = 'Fecha,Usuario,Origen,MB descargados,MB subidos,Peticiones\n';
    const body = rows
      .map(r => [
        r.fecha,
        `"${(nombrePorUser[r.user_id] || 'Usuario').replace(/"/g, '')}"`,
        r.origen,
        (Number(r.bytes_descarga) / 1048576).toFixed(2),
        (Number(r.bytes_subida) / 1048576).toFixed(2),
        r.peticiones,
      ].join(','))
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumo-datos-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" /> Consumo de datos
          </h1>
          <p className="text-sm text-muted-foreground">
            Megas realmente consumidos por usuario y por fecha, en la app móvil (Ruta) y en escritorio.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={() => { void flushDataUsage().then(() => refetch()); }}>
            Actualizar
          </Button>
          <Button variant="outline" onClick={exportarCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Excel/CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total del periodo</p>
          <p className="text-2xl font-bold tabular-nums">{formatBytes(totales.totalBytes)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">App móvil (Ruta)</p>
          <p className="text-2xl font-bold tabular-nums">{formatBytes(totales.ruta)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Escritorio</p>
          <p className="text-2xl font-bold tabular-nums">{formatBytes(totales.escritorio)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Por usuario</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-2">Usuario</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Promedio por día</th>
                  <th className="p-2 text-right">Días activos</th>
                  <th className="p-2 text-right">Peticiones</th>
                </tr>
              </thead>
              <tbody>
                {porUsuario.map(u => (
                  <tr key={u.userId} className="border-t">
                    <td className="p-2">{u.nombre}</td>
                    <td className="p-2 text-right tabular-nums font-medium">{formatBytes(u.bytes)}</td>
                    <td className="p-2 text-right tabular-nums">{formatBytes(u.promedioDia)}</td>
                    <td className="p-2 text-right tabular-nums">{u.dias}</td>
                    <td className="p-2 text-right tabular-nums">{u.peticiones.toLocaleString('es-MX')}</td>
                  </tr>
                ))}
                {porUsuario.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
                    {isLoading ? 'Cargando…' : 'Sin registros en el periodo'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Detalle por fecha</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Usuario</th>
                  <th className="p-2">Origen</th>
                  <th className="p-2 text-right">Descarga</th>
                  <th className="p-2 text-right">Subida</th>
                  <th className="p-2 text-right">Peticiones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.fecha.split('-').reverse().join('/')}</td>
                    <td className="p-2">{nombrePorUser[r.user_id] || 'Usuario'}</td>
                    <td className="p-2">
                      <Badge variant={r.origen === 'ruta' ? 'default' : 'secondary'}>
                        {r.origen === 'ruta' ? 'Ruta' : 'Escritorio'}
                      </Badge>
                    </td>
                    <td className="p-2 text-right tabular-nums">{formatBytes(Number(r.bytes_descarga))}</td>
                    <td className="p-2 text-right tabular-nums">{formatBytes(Number(r.bytes_subida))}</td>
                    <td className="p-2 text-right tabular-nums">{r.peticiones.toLocaleString('es-MX')}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">
                    {isLoading ? 'Cargando…' : 'Sin registros en el periodo'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="max-w-md">
        <DataUsageCard />
      </div>
    </div>
  );
}
