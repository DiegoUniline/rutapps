import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Database, HardDrive, AlertTriangle, Play, Clock } from "lucide-react";

type TableStat = {
  tabla: string;
  tamano: string;
  bytes: number;
  filas_vivas: number;
  dead_tuples: number;
  bloat_pct: number;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze?: string | null;
};

type BucketStat = {
  bucket: string;
  num_archivos: number;
  tamano: string;
  bytes: number;
};

type Health = {
  db_total_size: string;
  db_total_bytes: number;
  top_tables: TableStat[];
  bloat_tables: TableStat[];
  storage_buckets: BucketStat[];
  generated_at: string;
};

type LogEntry = {
  id: string;
  ejecutado_en: string;
  tablas_procesadas: string[];
  duracion_ms: number;
  notas: string | null;
};

const formatDate = (s: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
};

export default function DatabaseHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_database_health" as any);
      if (error) throw error;
      setHealth(data as unknown as Health);

      const { data: logData } = await supabase
        .from("maintenance_log" as any)
        .select("id, ejecutado_en, tablas_procesadas, duracion_ms, notas")
        .order("ejecutado_en", { ascending: false })
        .limit(20);
      setLogs((logData ?? []) as unknown as LogEntry[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al cargar salud de BD");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runVacuum = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("run_maintenance_vacuum" as any, {
        p_tables: null,
      });
      if (error) throw error;
      const ms = (data as any)?.duracion_ms ?? 0;
      toast.success(`ANALYZE completado en ${ms} ms`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al ejecutar VACUUM");
    } finally {
      setRunning(false);
    }
  };

  const lastVacuumByTable = (tabla: string): string | null => {
    const all = [...(health?.top_tables ?? []), ...(health?.bloat_tables ?? [])];
    const t = all.find((x) => x.tabla === tabla);
    if (!t) return null;
    const v = t.last_vacuum || t.last_autovacuum;
    return v ?? null;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/super-admin">
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6" /> Salud de Base de Datos
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitoreo de tamaño, bloat y mantenimiento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={running}>
                <Play className="h-4 w-4 mr-1" />
                {running ? "Ejecutando..." : "Ejecutar VACUUM"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Ejecutar VACUUM ANALYZE?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esto ejecutará una limpieza ligera (no bloqueante) sobre las tablas
                  principales: role_permisos, movimientos_inventario, ventas, venta_lineas,
                  cobros, cobro_aplicaciones, stock_almacen, productos y clientes.
                  La operación quedará registrada en el log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={runVacuum}>Ejecutar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Resumen general */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tamaño total de la BD</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Database className="h-6 w-6 text-primary" />
              {health?.db_total_size ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tablas con bloat &gt; 5%</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
              {health?.bloat_tables?.filter((t) => t.bloat_pct > 5).length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Buckets de Storage</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <HardDrive className="h-6 w-6 text-primary" />
              {health?.storage_buckets?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Top 10 tablas por tamaño */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Tablas por Tamaño</CardTitle>
          <CardDescription>
            Ordenadas por espacio total (datos + índices). Incluye dead tuples y % de bloat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabla</TableHead>
                  <TableHead className="text-right">Tamaño</TableHead>
                  <TableHead className="text-right">Filas vivas</TableHead>
                  <TableHead className="text-right">Dead tuples</TableHead>
                  <TableHead className="text-right">Bloat %</TableHead>
                  <TableHead>Último vacuum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(health?.top_tables ?? []).map((t) => (
                  <TableRow key={t.tabla}>
                    <TableCell className="font-mono text-xs">{t.tabla}</TableCell>
                    <TableCell className="text-right font-medium">{t.tamano}</TableCell>
                    <TableCell className="text-right">
                      {Number(t.filas_vivas ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(t.dead_tuples ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          t.bloat_pct > 20
                            ? "destructive"
                            : t.bloat_pct > 5
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {Number(t.bloat_pct ?? 0).toFixed(2)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(t.last_vacuum || t.last_autovacuum)}
                    </TableCell>
                  </TableRow>
                ))}
                {(!health || (health.top_tables ?? []).length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      {loading ? "Cargando..." : "Sin datos"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Storage buckets */}
      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>Espacio utilizado por bucket</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-right">Archivos</TableHead>
                  <TableHead className="text-right">Tamaño</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(health?.storage_buckets ?? []).map((b) => (
                  <TableRow key={b.bucket}>
                    <TableCell className="font-mono text-xs">{b.bucket}</TableCell>
                    <TableCell className="text-right">
                      {Number(b.num_archivos ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">{b.tamano}</TableCell>
                  </TableRow>
                ))}
                {(!health || (health.storage_buckets ?? []).length === 0) && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      Sin buckets
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Log de mantenimiento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Historial de Mantenimiento
          </CardTitle>
          <CardDescription>Últimas 20 ejecuciones de VACUUM</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tablas</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{formatDate(l.ejecutado_en)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {(l.tablas_procesadas ?? []).slice(0, 3).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t.replace("public.", "")}
                          </Badge>
                        ))}
                        {(l.tablas_procesadas ?? []).length > 3 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{(l.tablas_procesadas ?? []).length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {l.duracion_ms} ms
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.notas ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Sin ejecuciones registradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {health?.generated_at && (
        <p className="text-xs text-muted-foreground text-right">
          Datos generados: {formatDate(health.generated_at)}
        </p>
      )}
    </div>
  );
}
