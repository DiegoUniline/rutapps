import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gauge } from 'lucide-react';
import { getLocalUsage, formatBytes, todayKey, type UsageOrigen } from '@/lib/dataUsage';

/**
 * Tarjeta "Datos consumidos": megas reales medidos en ESTE dispositivo,
 * por fecha. Se usa en Ruta › Sincronizar.
 */
export function DataUsageCard({ origen }: { origen?: UsageOrigen }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const dias = useMemo(() => getLocalUsage(30, origen), [tick, origen]);

  const hoyKey = todayKey();
  const ayerDate = new Date();
  ayerDate.setDate(ayerDate.getDate() - 1);
  const ayerKey = todayKey(ayerDate);

  const hoy = dias.find(d => d.fecha === hoyKey);
  const ayer = dias.find(d => d.fecha === ayerKey);
  const total = (arr: typeof dias) => arr.reduce((s, d) => s + d.down + d.up, 0);
  const ultimos7 = total(dias.slice(0, 7));
  const mes = total(dias.filter(d => d.fecha.slice(0, 7) === hoyKey.slice(0, 7)));

  const topRecursos = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const d of dias) for (const [k, v] of Object.entries(d.recursos)) acc[k] = (acc[k] || 0) + v;
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [dias]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          Datos consumidos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Hoy" value={formatBytes((hoy?.down || 0) + (hoy?.up || 0))} />
          <Metric label="Ayer" value={formatBytes((ayer?.down || 0) + (ayer?.up || 0))} />
          <Metric label="Últimos 7 días" value={formatBytes(ultimos7)} />
          <Metric label="Este mes" value={formatBytes(mes)} />
        </div>

        {topRecursos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Qué consume más</p>
            {topRecursos.map(([nombre, bytes]) => (
              <div key={nombre} className="flex items-center justify-between text-xs">
                <span className="truncate pr-2">{nombre}</span>
                <span className="font-medium tabular-nums">{formatBytes(bytes)}</span>
              </div>
            ))}
          </div>
        )}

        {dias.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Por fecha</p>
            <div className="max-h-40 overflow-y-auto">
              {dias.map(d => (
                <div key={d.fecha} className="flex items-center justify-between text-xs py-0.5">
                  <span>{d.fecha.split('-').reverse().join('/')}</span>
                  <span className="tabular-nums">
                    {formatBytes(d.down + d.up)} · {d.req} peticiones
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Medición real de este dispositivo. Se envía al panel de la empresa para auditoría.
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
