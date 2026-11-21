import { useState } from 'react';
import { useSortState, ordenarFilas, SortableTableHead } from '@/hooks/useSortableTable';
import { useControlData } from '@/hooks/useControlData';
import { useCurrency } from '@/hooks/useCurrency';
import { subDays, format } from 'date-fns';
import { fmtDate } from '@/lib/utils';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  // Orden por columna de cada tabla de alertas (se recuerda por tabla).
  const oCanceladas = useSortState('control-canceladas');
  const oDescuentos = useSortState('control-descuentos');
  const oBajoCosto = useSortState('control-bajo-costo');
  const oDescargaLineas = useSortState('control-descarga-lineas');
  const oVencidas = useSortState('control-credito-vencido');
  const valorVenta = (v: any, k: string) => k === 'cliente' ? v.clientes?.nombre : k === 'vendedor' ? v.vendedores?.nombre : v[k];

  const alertCounts = {
    canceladas: data.canceladas.length,
    descuentos: data.descuentosAltos.length,
    bajoCosto: data.ventasBajoCosto.length,
    descargas: data.diferenciasDescarga.length,
    vencidas: data.creditoVencido.length,
  };
  const totalAlerts = Object.values(alertCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-full p-2 md:p-4">
    {/* D-037: una sola hoja blanca */}
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-clip px-3 md:px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

      {/* Resumen: franja con divide-x (D-037) */}
      <div className="grid grid-cols-2 md:grid-cols-5 -mx-3 md:-mx-4 border-t md:border-b border-border md:divide-x divide-border [&>*]:max-md:border-b [&>*:nth-child(odd)]:max-md:border-r">
        <SummaryCard icon={XCircle} label="Canceladas" count={alertCounts.canceladas} color="text-destructive bg-destructive/10" />
        <SummaryCard icon={PercentCircle} label="Descuento alto" count={alertCounts.descuentos} color="text-warning bg-warning/10" />
        <SummaryCard icon={TrendingDown} label="Bajo costo" count={alertCounts.bajoCosto} color="text-destructive bg-destructive/10" />
        <SummaryCard icon={Truck} label="Dif. descargas" count={alertCounts.descargas} color="text-brand-orange bg-brand-orange/10" />
        <SummaryCard icon={Clock} label="Crédito vencido" count={alertCounts.vencidas} color="text-primary bg-primary/10" />
      </div>

      {data.isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Cargando alertas...</div>
      ) : (
        <Tabs defaultValue="canceladas" className="space-y-4">
          <TabsList className="bg-accent p-1 h-auto flex-wrap justify-start">
            <TabsTrigger value="canceladas" className="gap-1.5 text-xs">
              <XCircle className="h-3.5 w-3.5" /> Canceladas {alertCounts.canceladas > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{alertCounts.canceladas}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="descuentos" className="gap-1.5 text-xs">
              <PercentCircle className="h-3.5 w-3.5" /> Descuentos {alertCounts.descuentos > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-warning text-warning-foreground">{alertCounts.descuentos}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="bajo_costo" className="gap-1.5 text-xs">
              <TrendingDown className="h-3.5 w-3.5" /> Bajo costo {alertCounts.bajoCosto > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{alertCounts.bajoCosto}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="descargas" className="gap-1.5 text-xs">
              <Truck className="h-3.5 w-3.5" /> Descargas {alertCounts.descargas > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-brand-orange text-brand-orange-foreground">{alertCounts.descargas}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="vencidas" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" /> Crédito vencido {alertCounts.vencidas > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-primary">{alertCounts.vencidas}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="historial" className="gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" /> Bitácora
            </TabsTrigger>
          </TabsList>

          {/* Canceladas */}
          <TabsContent value="canceladas">
            <section>
              <div className="pb-2">
                <h2 className="text-base font-semibold">Ventas canceladas</h2>
                <p className="text-xs text-muted-foreground">Ventas que fueron canceladas en el periodo. Revisa si hay patrones sospechosos.</p>
              </div>
              <div className="-mx-3 md:-mx-4 border-t border-border">
                {data.canceladas.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <SortableTableHead sortKey="folio" sort={oCanceladas.sort} onToggle={oCanceladas.toggle}>Folio</SortableTableHead><SortableTableHead sortKey="fecha" sort={oCanceladas.sort} onToggle={oCanceladas.toggle}>Fecha</SortableTableHead><SortableTableHead sortKey="cliente" sort={oCanceladas.sort} onToggle={oCanceladas.toggle}>Cliente</SortableTableHead><SortableTableHead sortKey="vendedor" sort={oCanceladas.sort} onToggle={oCanceladas.toggle}>Vendedor</SortableTableHead><SortableTableHead sortKey="total" sort={oCanceladas.sort} onToggle={oCanceladas.toggle} align="right" className="text-right">Total</SortableTableHead><TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {ordenarFilas(data.canceladas, oCanceladas.sort, valorVenta).map((v: any) => (
                        <TableRow key={v.id} className="cursor-pointer hover:bg-table-hover" onClick={() => navigate(`/ventas/${v.id}`)}>
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
              </div>
            </section>
          </TabsContent>

          {/* Descuentos altos */}
          <TabsContent value="descuentos">
            <section>
              <div className="pb-2">
                <h2 className="text-base font-semibold">Descuentos superiores al 15%</h2>
                <p className="text-xs text-muted-foreground">Ventas con descuentos inusualmente altos que podrían necesitar revisión.</p>
              </div>
              <div className="-mx-3 md:-mx-4 border-t border-border">
                {data.descuentosAltos.length === 0 ? <EmptyState /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <SortableTableHead sortKey="folio" sort={oDescuentos.sort} onToggle={oDescuentos.toggle}>Folio</SortableTableHead><SortableTableHead sortKey="fecha" sort={oDescuentos.sort} onToggle={oDescuentos.toggle}>Fecha</SortableTableHead><SortableTableHead sortKey="cliente" sort={oDescuentos.sort} onToggle={oDescuentos.toggle}>Cliente</SortableTableHead><SortableTableHead sortKey="vendedor" sort={oDescuentos.sort} onToggle={oDescuentos.toggle}>Vendedor</SortableTableHead><SortableTableHead sortKey="descuento_porcentaje" sort={oDescuentos.sort} onToggle={oDescuentos.toggle} align="right" className="text-right">Descuento</SortableTableHead><SortableTableHead sortKey="total" sort={oDescuentos.sort} onToggle={oDescuentos.toggle} align="right" className="text-right">Total</SortableTableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {ordenarFilas(data.descuentosAltos, oDescuentos.sort, valorVenta).map((v: any) => (
                        <TableRow key={v.id} className="cursor-pointer hover:bg-table-hover" onClick={() => navigate(`/ventas/${v.id}`)}>
                          <TableCell className="font-mono text-xs">{v.folio}</TableCell>
                          <TableCell className="text-xs">{fmtDate(v.fecha)}</TableCell>
                          <TableCell className="text-xs">{(v.clientes as any)?.nombre ?? '—'}</TableCell>
                          <TableCell className="text-xs">{(v.vendedores as any)?.nombre ?? '—'}</TableCell>
                          <TableCell className="text-right text-xs">
                            <Badge variant="outline" className="text-warning border-warning/40">{v.descuento_porcentaje}%</Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">{fmt(v.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </section>
          </TabsContent>

          {/* Ventas bajo costo */}
          <TabsContent value="bajo_costo">
            <section>
              <div className="pb-2">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> Ventas por debajo del costo
                </h2>
                <p className="text-xs text-muted-foreground">Productos vendidos a un precio inferior al costo registrado. Esto genera pérdida directa.</p>
              </div>
              <div className="-mx-3 md:-mx-4 border-t border-border">
                {data.ventasBajoCosto.length === 0 ? <EmptyState text="No se detectaron ventas por debajo del costo" /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <SortableTableHead sortKey="folio" sort={oBajoCosto.sort} onToggle={oBajoCosto.toggle}>Folio</SortableTableHead><SortableTableHead sortKey="producto" sort={oBajoCosto.sort} onToggle={oBajoCosto.toggle}>Producto</SortableTableHead><SortableTableHead sortKey="vendedor" sort={oBajoCosto.sort} onToggle={oBajoCosto.toggle}>Vendedor</SortableTableHead><SortableTableHead sortKey="costo" sort={oBajoCosto.sort} onToggle={oBajoCosto.toggle} align="right" className="text-right">Costo</SortableTableHead><SortableTableHead sortKey="precio_venta" sort={oBajoCosto.sort} onToggle={oBajoCosto.toggle} align="right" className="text-right">Precio venta</SortableTableHead><SortableTableHead sortKey="perdida" sort={oBajoCosto.sort} onToggle={oBajoCosto.toggle} align="right" className="text-right">Pérdida</SortableTableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {ordenarFilas(data.ventasBajoCosto, oBajoCosto.sort).map((a: any, i: number) => (
                        <TableRow key={i} className="cursor-pointer hover:bg-table-hover" onClick={() => navigate(`/ventas/${a.venta_id}`)}>
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
              </div>
            </section>
          </TabsContent>

          {/* Descargas con diferencia */}
          <TabsContent value="descargas">
            <section>
              <div className="pb-2">
                <h2 className="text-base font-semibold">Diferencias en descargas de ruta</h2>
                <p className="text-xs text-muted-foreground">Liquidaciones donde hay faltantes de producto o diferencias de efectivo.</p>
              </div>
              <div className="-mx-3 md:-mx-4 border-t border-border">
                {data.diferenciasDescarga.length === 0 ? <EmptyState text="No hay descargas con diferencias" /> : (
                  <div className="divide-y divide-border">
                    {data.diferenciasDescarga.map((d: any) => (
                      <div key={d.id} className="px-3 md:px-4 py-3">
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
                                <p className={`text-sm font-bold ${d.diferencia_efectivo < 0 ? 'text-destructive' : 'text-success'}`}>
                                  {fmt(d.diferencia_efectivo)}
                                </p>
                              </div>
                            )}
                            {d.productos_con_diferencia > 0 && (
                              <Badge variant="outline" className="text-brand-orange border-brand-orange/40">
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
                                <SortableTableHead sortKey="producto" sort={oDescargaLineas.sort} onToggle={oDescargaLineas.toggle} className="text-xs">Producto</SortableTableHead>
                                <SortableTableHead sortKey="esperada" sort={oDescargaLineas.sort} onToggle={oDescargaLineas.toggle} align="right" className="text-right text-xs">Esperada</SortableTableHead>
                                <SortableTableHead sortKey="real" sort={oDescargaLineas.sort} onToggle={oDescargaLineas.toggle} align="right" className="text-right text-xs">Real</SortableTableHead>
                                <SortableTableHead sortKey="diferencia" sort={oDescargaLineas.sort} onToggle={oDescargaLineas.toggle} align="right" className="text-right text-xs">Diferencia</SortableTableHead>
                              </TableRow></TableHeader>
                              <TableBody>
                                {ordenarFilas(d.lineas, oDescargaLineas.sort).map((l: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs">{l.producto}</TableCell>
                                    <TableCell className="text-right text-xs">{l.esperada}</TableCell>
                                    <TableCell className="text-right text-xs">{l.real}</TableCell>
                                    <TableCell className={`text-right text-xs font-bold ${l.diferencia < 0 ? 'text-destructive' : 'text-success'}`}>
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
              </div>
            </section>
          </TabsContent>

          {/* Crédito vencido */}
          <TabsContent value="vencidas">
            <section>
              <div className="pb-2">
                <h2 className="text-base font-semibold">Créditos vencidos</h2>
                <p className="text-xs text-muted-foreground">Ventas a crédito cuyo plazo ya venció y aún tienen saldo pendiente.</p>
              </div>
              <div className="-mx-3 md:-mx-4 border-t border-border">
                {data.creditoVencido.length === 0 ? <EmptyState text="No hay créditos vencidos" /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <SortableTableHead sortKey="folio" sort={oVencidas.sort} onToggle={oVencidas.toggle}>Folio</SortableTableHead><SortableTableHead sortKey="cliente" sort={oVencidas.sort} onToggle={oVencidas.toggle}>Cliente</SortableTableHead><SortableTableHead sortKey="vendedor" sort={oVencidas.sort} onToggle={oVencidas.toggle}>Vendedor</SortableTableHead><SortableTableHead sortKey="vencimiento" sort={oVencidas.sort} onToggle={oVencidas.toggle}>Vencimiento</SortableTableHead><SortableTableHead sortKey="dias_vencido" sort={oVencidas.sort} onToggle={oVencidas.toggle} align="right" className="text-right">Días vencido</SortableTableHead><SortableTableHead sortKey="saldo_pendiente" sort={oVencidas.sort} onToggle={oVencidas.toggle} align="right" className="text-right">Saldo</SortableTableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {ordenarFilas(data.creditoVencido, oVencidas.sort).map((v: any) => (
                        <TableRow key={v.id} className="cursor-pointer hover:bg-table-hover" onClick={() => navigate(`/ventas/${v.id}`)}>
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
              </div>
            </section>
          </TabsContent>

          {/* Bitácora */}
          <TabsContent value="historial">
            <section>
              <div className="pb-2">
                <h2 className="text-base font-semibold">Bitácora de actividad</h2>
                <p className="text-xs text-muted-foreground">Registro cronológico de todas las acciones críticas sobre ventas.</p>
              </div>
              <div className="-mx-3 md:-mx-4 border-t border-border">
                {data.historial.length === 0 ? <EmptyState text="No hay actividad registrada en el periodo" /> : (
                  <div className="space-y-1.5 max-h-[600px] overflow-y-auto px-3 md:px-4 pt-2">
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
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, count, color }: { icon: any; label: string; count: number; color: string }) {
  return (
    <div className="px-3 md:px-4 py-2.5 flex items-center gap-3 min-w-0">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground tabular-nums">{count}</p>
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ text = 'Sin alertas en este periodo' }: { text?: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground text-sm">{text}</div>
  );
}
