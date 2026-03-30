import { useState } from 'react';
import { useControlData } from '@/hooks/useControlData';
import { useCurrency } from '@/hooks/useCurrency';
import { subDays, format } from 'date-fns';
import { fmtDate } from '@/lib/utils';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import {
  ShieldAlert, XCircle, PercentCircle, TrendingDown, Truck, Clock,
  History, AlertTriangle, ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ControlPage() {
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const data = useControlData({
    from: new Date(dateFrom + 'T00:00:00'),
    to: new Date(dateTo + 'T23:59:59'),
  });
  const [expandedDescarga, setExpandedDescarga] = useState<string | null>(null);

  const alertCounts = {
    canceladas: data.canceladas.length,
    descuentos: data.descuentosAltos.length,
    bajoCosto: data.ventasBajoCosto.length,
    descargas: data.diferenciasDescarga.length,
    vencidas: data.creditoVencido.length,
  };
  const totalAlerts = Object.values(alertCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Control y Auditoría</h1>
            <p className="text-xs text-muted-foreground">Detecta anomalías, previene fraudes y revisa la bitácora</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OdooDatePicker value={dateFrom} onChange={setDateFrom} />
          <OdooDatePicker value={dateTo} onChange={setDateTo} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={XCircle} label="Canceladas" count={alertCounts.canceladas} color="text-destructive bg-destructive/10" />
        <SummaryCard icon={PercentCircle} label="Descuento alto" count={alertCounts.descuentos} color="text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30" />
        <SummaryCard icon={TrendingDown} label="Bajo costo" count={alertCounts.bajoCosto} color="text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30" />
        <SummaryCard icon={Truck} label="Dif. descargas" count={alertCounts.descargas} color="text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30" />
        <SummaryCard icon={Clock} label="Crédito vencido" count={alertCounts.vencidas} color="text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30" />
      </div>

      {data.isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Cargando alertas...</div>
      ) : (
        <Tabs defaultValue="canceladas" className="space-y-4">
          <TabsList className="bg-card border border-border/60 p-1 h-auto flex-wrap">
            <TabsTrigger value="canceladas" className="gap-1.5 text-xs">
              <XCircle className="h-3.5 w-3.5" /> Canceladas {alertCounts.canceladas > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{alertCounts.canceladas}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="descuentos" className="gap-1.5 text-xs">
              <PercentCircle className="h-3.5 w-3.5" /> Descuentos {alertCounts.descuentos > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-amber-500">{alertCounts.descuentos}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="bajo_costo" className="gap-1.5 text-xs">
              <TrendingDown className="h-3.5 w-3.5" /> Bajo costo {alertCounts.bajoCosto > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{alertCounts.bajoCosto}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="descargas" className="gap-1.5 text-xs">
              <Truck className="h-3.5 w-3.5" /> Descargas {alertCounts.descargas > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-orange-500">{alertCounts.descargas}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="vencidas" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" /> Crédito vencido {alertCounts.vencidas > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-purple-500">{alertCounts.vencidas}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="historial" className="gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" /> Bitácora
            </TabsTrigger>
          </TabsList>

          {/* Canceladas */}
          <TabsContent value="canceladas">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ventas canceladas</CardTitle>
                <CardDescription>Ventas que fueron canceladas en el periodo. Revisa si hay patrones sospechosos.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.canceladas.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Folio</TableHead><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.canceladas.map((v: any) => (
                        <TableRow key={v.id} className="cursor-pointer hover:bg-card" onClick={() => navigate(`/ventas/${v.id}`)}>
                          <TableCell className="font-mono text-xs">{v.folio}</TableCell>
                          <TableCell className="text-xs">{fmtDate(v.fecha)}</TableCell>
                          <TableCell className="text-xs">{(v.clientes as any)?.nombre ?? '—'}</TableCell>
                          <TableCell className="text-xs">{(v.vendedores as any)?.nombre ?? '—'}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{fmt(v.total)}</TableCell>
                          <TableCell><Eye className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Descuentos altos */}
          <TabsContent value="descuentos">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Descuentos superiores al 15%</CardTitle>
                <CardDescription>Ventas con descuentos inusualmente altos que podrían necesitar revisión.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.descuentosAltos.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Folio</TableHead><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">Descuento</TableHead><TableHead className="text-right">Total</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.descuentosAltos.map((v: any) => (
                        <TableRow key={v.id} className="cursor-pointer hover:bg-card" onClick={() => navigate(`/ventas/${v.id}`)}>
                          <TableCell className="font-mono text-xs">{v.folio}</TableCell>
                          <TableCell className="text-xs">{fmtDate(v.fecha)}</TableCell>
                          <TableCell className="text-xs">{(v.clientes as any)?.nombre ?? '—'}</TableCell>
                          <TableCell className="text-xs">{(v.vendedores as any)?.nombre ?? '—'}</TableCell>
                          <TableCell className="text-right text-xs">
                            <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400">{v.descuento_porcentaje}%</Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">{fmt(v.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ventas bajo costo */}
          <TabsContent value="bajo_costo">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> Ventas por debajo del costo
                </CardTitle>
                <CardDescription>Productos vendidos a un precio inferior al costo registrado. Esto genera pérdida directa.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.ventasBajoCosto.length === 0 ? <EmptyState text="No se detectaron ventas por debajo del costo" /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Folio</TableHead><TableHead>Producto</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">Costo</TableHead><TableHead className="text-right">Precio venta</TableHead><TableHead className="text-right">Pérdida</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.ventasBajoCosto.map((a: any, i: number) => (
                        <TableRow key={i} className="cursor-pointer hover:bg-card" onClick={() => navigate(`/ventas/${a.venta_id}`)}>
                          <TableCell className="font-mono text-xs">{a.folio}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{a.producto}</TableCell>
                          <TableCell className="text-xs">{a.vendedor}</TableCell>
                          <TableCell className="text-right text-xs">{fmt(a.costo)}</TableCell>
                          <TableCell className="text-right text-xs text-destructive font-medium">{fmt(a.precio_venta)}</TableCell>
                          <TableCell className="text-right text-xs text-destructive font-bold">-{fmt(a.perdida)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Descargas con diferencia */}
          <TabsContent value="descargas">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Diferencias en descargas de ruta</CardTitle>
                <CardDescription>Liquidaciones donde hay faltantes de producto o diferencias de efectivo.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.diferenciasDescarga.length === 0 ? <EmptyState text="No hay descargas con diferencias" /> : (
                  <div className="space-y-2">
                    {data.diferenciasDescarga.map((d: any) => (
                      <div key={d.id} className="border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="text-sm font-medium">{d.vendedor}</p>
                              <p className="text-xs text-muted-foreground">{fmtDate(d.fecha)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {d.diferencia_efectivo !== 0 && (
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground">Dif. efectivo</p>
                                <p className={`text-sm font-bold ${d.diferencia_efectivo < 0 ? 'text-destructive' : 'text-green-600'}`}>
                                  {fmt(d.diferencia_efectivo)}
                                </p>
                              </div>
                            )}
                            {d.productos_con_diferencia > 0 && (
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                {d.productos_con_diferencia} productos
                              </Badge>
                            )}
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setExpandedDescarga(expandedDescarga === d.id ? null : d.id)}
                            >
                              {expandedDescarga === d.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                        {expandedDescarga === d.id && d.lineas.length > 0 && (
                          <div className="mt-3 border-t pt-2">
                            <Table>
                              <TableHeader><TableRow>
                                <TableHead className="text-xs">Producto</TableHead>
                                <TableHead className="text-right text-xs">Esperada</TableHead>
                                <TableHead className="text-right text-xs">Real</TableHead>
                                <TableHead className="text-right text-xs">Diferencia</TableHead>
                              </TableRow></TableHeader>
                              <TableBody>
                                {d.lineas.map((l: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs">{l.producto}</TableCell>
                                    <TableCell className="text-right text-xs">{l.esperada}</TableCell>
                                    <TableCell className="text-right text-xs">{l.real}</TableCell>
                                    <TableCell className={`text-right text-xs font-bold ${l.diferencia < 0 ? 'text-destructive' : 'text-green-600'}`}>
                                      {l.diferencia > 0 ? '+' : ''}{l.diferencia}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Crédito vencido */}
          <TabsContent value="vencidas">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Créditos vencidos</CardTitle>
                <CardDescription>Ventas a crédito cuyo plazo ya venció y aún tienen saldo pendiente.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.creditoVencido.length === 0 ? <EmptyState text="No hay créditos vencidos" /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Folio</TableHead><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead><TableHead>Vencimiento</TableHead><TableHead className="text-right">Días vencido</TableHead><TableHead className="text-right">Saldo</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.creditoVencido.map((v: any) => (
                        <TableRow key={v.id} className="cursor-pointer hover:bg-card" onClick={() => navigate(`/ventas/${v.id}`)}>
                          <TableCell className="font-mono text-xs">{v.folio}</TableCell>
                          <TableCell className="text-xs">{v.cliente}</TableCell>
                          <TableCell className="text-xs">{v.vendedor}</TableCell>
                          <TableCell className="text-xs">{v.vencimiento}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={v.dias_vencido > 30 ? 'destructive' : 'outline'} className="text-[10px]">
                              {v.dias_vencido}d
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold text-destructive">{fmt(v.saldo_pendiente)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bitácora */}
          <TabsContent value="historial">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Bitácora de actividad</CardTitle>
                <CardDescription>Registro cronológico de todas las acciones críticas sobre ventas.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.historial.length === 0 ? <EmptyState text="No hay actividad registrada en el periodo" /> : (
                  <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                    {data.historial.map((h: any) => (
                      <div key={h.id} className="flex items-start gap-3 border-b border-border/50 pb-2 last:border-0">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-foreground">{(h.profiles as any)?.nombre ?? 'Sistema'}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{h.accion}</Badge>
                            <span className="text-xs font-mono text-muted-foreground">{(h.ventas as any)?.folio ?? '—'}</span>
                          </div>
                          {h.detalle && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-lg">
                              {typeof h.detalle === 'string' ? h.detalle : JSON.stringify(h.detalle)}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {format(new Date(h.created_at), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => navigate(`/ventas/${h.venta_id}`)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, count, color }: { icon: any; label: string; count: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{count}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text = 'Sin alertas en este periodo' }: { text?: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground text-sm">{text}</div>
  );
}
