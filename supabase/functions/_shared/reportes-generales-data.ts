// Fetch + cómputo server-side para los Reportes Generales (espejo de useReportesData).
// Reutilizado por el bot WhatsApp.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function fetchAll<T = any>(builder: (from: number, to: number) => any): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const out: T[] = [];
  for (;;) {
    const { data, error } = await builder(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export interface ReportesGeneralesData {
  empresa: any;
  desde: string;
  hasta: string;
  totalVentas: number;
  totalCobros: number;
  totalGastos: number;
  totalPendiente: number;
  totalContado: number;
  totalCredito: number;
  costoTotal: number;
  utilidadBruta: number;
  utilidadNeta: number;
  metodosPago: { metodo: string; total: number; pct: number }[];
  ventasPorProducto: { codigo: string; nombre: string; cantidad: number; total: number; costo: number; utilidad: number }[];
  ventasPorCliente: { nombre: string; ventas: number; total: number; pendiente: number; costo: number; utilidad: number }[];
  topVendedores: { nombre: string; ventas: number; total: number; utilidad: number }[];
  gastosDesglose: { concepto: string; monto: number }[];
}

export async function fetchReportesGenerales(empresaId: string, desde: string, hasta: string): Promise<ReportesGeneralesData> {
  const activeStatuses = ["borrador", "confirmado", "entregado", "facturado"];

  const [empresaRes, ventas, ventaLineas, promoAplicadas, cobros, gastos, productos] = await Promise.all([
    admin.from("empresas")
      .select("nombre, razon_social, rfc, direccion, colonia, ciudad, estado, cp, telefono, moneda")
      .eq("id", empresaId).maybeSingle(),
    fetchAll((f, t) => admin.from("ventas")
      .select("id, folio, fecha, total, saldo_pendiente, status, condicion_pago, cliente_id, vendedor_id, clientes(nombre), vendedores:profiles!vendedor_id(nombre)")
      .eq("empresa_id", empresaId).eq("es_saldo_inicial", false)
      .gte("fecha", desde).lte("fecha", hasta).in("status", activeStatuses).range(f, t)),
    fetchAll((f, t) => admin.from("venta_lineas")
      .select("id, producto_id, cantidad, total, productos(codigo, nombre, costo), ventas!inner(empresa_id, fecha, status, cliente_id, vendedor_id, clientes(nombre), vendedores:profiles!vendedor_id(nombre))")
      .eq("ventas.empresa_id", empresaId)
      .gte("ventas.fecha", desde).lte("ventas.fecha", hasta).in("ventas.status", activeStatuses).range(f, t)),
    fetchAll((f, t) => admin.from("promocion_aplicada")
      .select("venta_linea_id, descuento_aplicado, ventas!inner(empresa_id, fecha, status)")
      .eq("ventas.empresa_id", empresaId)
      .gte("ventas.fecha", desde).lte("ventas.fecha", hasta).in("ventas.status", activeStatuses).range(f, t)),
    fetchAll((f, t) => admin.from("cobros")
      .select("id, monto, fecha, metodo_pago, cliente_id, clientes(nombre)")
      .eq("empresa_id", empresaId).neq("status", "cancelado")
      .gte("fecha", desde).lte("fecha", hasta).range(f, t)),
    fetchAll((f, t) => admin.from("gastos")
      .select("id, monto, concepto, fecha")
      .eq("empresa_id", empresaId).gte("fecha", desde).lte("fecha", hasta).range(f, t)),
    fetchAll((f, t) => admin.from("productos")
      .select("id, codigo, nombre, costo")
      .eq("empresa_id", empresaId).eq("status", "activo").range(f, t)),
  ]);

  const promoDescByLinea: Record<string, number> = {};
  for (const p of promoAplicadas as any[]) {
    if (!p.venta_linea_id) continue;
    promoDescByLinea[p.venta_linea_id] = (promoDescByLinea[p.venta_linea_id] ?? 0) + Number(p.descuento_aplicado || 0);
  }
  const lineTotalEfectivo = (l: any) => Math.max(0, Number(l.total || 0) - (promoDescByLinea[l.id] ?? 0));

  const totalVentas = ventas.reduce((s: number, v: any) => s + Number(v.total || 0), 0);
  const totalCobros = cobros.reduce((s: number, c: any) => s + Number(c.monto || 0), 0);
  const totalGastos = gastos.reduce((s: number, g: any) => s + Number(g.monto || 0), 0);
  const totalPendiente = ventas.reduce((s: number, v: any) => s + Number(v.saldo_pendiente || 0), 0);
  const totalContado = ventas.filter((v: any) => v.condicion_pago === "contado").reduce((s: number, v: any) => s + Number(v.total || 0), 0);
  const totalCredito = ventas.filter((v: any) => v.condicion_pago === "credito").reduce((s: number, v: any) => s + Number(v.total || 0), 0);

  const mp: Record<string, number> = {};
  for (const c of cobros as any[]) { const k = c.metodo_pago || "otro"; mp[k] = (mp[k] || 0) + Number(c.monto || 0); }
  const metodosPago = Object.entries(mp).map(([metodo, total]) => ({ metodo, total, pct: totalCobros > 0 ? (total / totalCobros) * 100 : 0 })).sort((a, b) => b.total - a.total);

  const prodById = new Map<string, any>((productos as any[]).map((p) => [p.id, p]));

  // Ventas por producto
  const prodMap: Record<string, any> = {};
  for (const l of ventaLineas as any[]) {
    const pid = l.producto_id ?? "";
    const prod = prodById.get(pid);
    if (!prodMap[pid]) prodMap[pid] = { codigo: l.productos?.codigo ?? "", nombre: l.productos?.nombre ?? "—", cantidad: 0, total: 0, costo: Number(prod?.costo || 0) };
    prodMap[pid].cantidad += Number(l.cantidad || 0);
    prodMap[pid].total += lineTotalEfectivo(l);
  }
  const ventasPorProducto = Object.values(prodMap).map((v: any) => ({ ...v, utilidad: v.total - v.costo * v.cantidad })).sort((a: any, b: any) => b.total - a.total);

  // Ventas por cliente
  const cliMap: Record<string, any> = {};
  for (const v of ventas as any[]) {
    const cid = v.cliente_id ?? "";
    if (!cliMap[cid]) cliMap[cid] = { nombre: v.clientes?.nombre ?? "—", total: 0, ventas: 0, pendiente: 0, costo: 0, utilidad: 0 };
    cliMap[cid].total += Number(v.total || 0);
    cliMap[cid].ventas += 1;
    cliMap[cid].pendiente += Number(v.saldo_pendiente || 0);
  }
  for (const l of ventaLineas as any[]) {
    const cid = l.ventas?.cliente_id ?? "";
    if (!cliMap[cid]) continue;
    const prod = prodById.get(l.producto_id);
    const costo = Number(prod?.costo || 0) * Number(l.cantidad || 0);
    cliMap[cid].costo += costo;
    cliMap[cid].utilidad += lineTotalEfectivo(l) - costo;
  }
  const ventasPorCliente = Object.values(cliMap).sort((a: any, b: any) => b.total - a.total);

  // Top vendedores
  const vendMap: Record<string, any> = {};
  for (const v of ventas as any[]) {
    const vid = v.vendedor_id ?? "";
    if (!vendMap[vid]) vendMap[vid] = { nombre: v.vendedores?.nombre ?? "—", total: 0, ventas: 0, utilidad: 0 };
    vendMap[vid].total += Number(v.total || 0);
    vendMap[vid].ventas += 1;
  }
  for (const l of ventaLineas as any[]) {
    const vid = l.ventas?.vendedor_id ?? "";
    if (!vendMap[vid]) continue;
    const prod = prodById.get(l.producto_id);
    const costo = Number(prod?.costo || 0) * Number(l.cantidad || 0);
    vendMap[vid].utilidad += Number(l.total || 0) - costo;
  }
  const topVendedores = Object.values(vendMap).sort((a: any, b: any) => b.total - a.total);

  const costoTotal = (ventaLineas as any[]).reduce((s: number, l: any) => {
    const prod = prodById.get(l.producto_id);
    return s + Number(prod?.costo || 0) * Number(l.cantidad || 0);
  }, 0);

  const gpc: Record<string, number> = {};
  for (const g of gastos as any[]) { gpc[g.concepto] = (gpc[g.concepto] || 0) + Number(g.monto || 0); }
  const gastosDesglose = Object.entries(gpc).map(([concepto, monto]) => ({ concepto, monto })).sort((a, b) => b.monto - a.monto);

  return {
    empresa: empresaRes.data || {},
    desde, hasta,
    totalVentas, totalCobros, totalGastos, totalPendiente,
    totalContado, totalCredito,
    costoTotal,
    utilidadBruta: totalVentas - costoTotal,
    utilidadNeta: totalVentas - costoTotal - totalGastos,
    metodosPago,
    ventasPorProducto, ventasPorCliente, topVendedores,
    gastosDesglose,
  };
}
