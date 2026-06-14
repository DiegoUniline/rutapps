// Genera el Reporte de ventas en XLSX para envío automático por WhatsApp.
// Usa SheetJS (xlsx) en runtime Deno.
import * as XLSX from "npm:xlsx@0.18.5";

type Empresa = { nombre?: string; rfc?: string | null; moneda?: string | null };

export interface ReporteXlsxInput {
  empresa: Empresa;
  label: string;
  fechaISO: string;
  totals: {
    totalVentas: number; totalContado: number; totalCredito: number; totalCancelado: number;
    totalCobros: number; totalGastos: number;
    cobrosPorMetodo: Record<string, number>;
    countVentas: number; countCobros: number; countGastos: number;
  };
  ventasActivas: Array<{ folio: string; cliente: string; condicion_pago: string; total: number }>;
  ventasCanceladas: Array<{ folio: string; cliente: string; total: number }>;
  productos: Array<{ codigo: string; nombre: string; cantidad: number; total: number }>;
  cobros: Array<{ cliente: string; metodo_pago: string; referencia?: string | null; monto: number }>;
  gastos: Array<{ concepto: string; notas?: string | null; monto: number }>;
}

export function generarReporteBotXlsx(input: ReporteXlsxInput): Uint8Array {
  const wb = XLSX.utils.book_new();
  const empresa = input.empresa?.nombre || "Empresa";

  // Resumen
  const resumen = [
    [empresa],
    [input.label],
    [`Generado: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`],
    [],
    ["Concepto", "Cantidad", "Total"],
    ["Ventas", input.totals.countVentas, input.totals.totalVentas],
    ["  Contado", "", input.totals.totalContado],
    ["  Crédito", "", input.totals.totalCredito],
    ["Canceladas", input.ventasCanceladas.length, input.totals.totalCancelado],
    ["Cobros", input.totals.countCobros, input.totals.totalCobros],
    ["Gastos", input.totals.countGastos, input.totals.totalGastos],
    [],
    ["Cobros por método", "", ""],
    ...Object.entries(input.totals.cobrosPorMetodo).map(([m, v]) => [m, "", v]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  // Ventas
  const ventasRows = [
    ["Folio", "Cliente", "Condición", "Total"],
    ...input.ventasActivas.map((v) => [v.folio, v.cliente, v.condicion_pago, v.total]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ventasRows), "Ventas");

  // Productos
  const prodRows = [
    ["Código", "Producto", "Cantidad", "Total"],
    ...input.productos.map((p) => [p.codigo, p.nombre, p.cantidad, p.total]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodRows), "Productos");

  // Cobros
  const cobrosRows = [
    ["Cliente", "Método", "Referencia", "Monto"],
    ...input.cobros.map((c) => [c.cliente, c.metodo_pago, c.referencia || "", c.monto]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cobrosRows), "Cobros");

  // Gastos
  const gastosRows = [
    ["Concepto", "Notas", "Monto"],
    ...input.gastos.map((g) => [g.concepto, g.notas || "", g.monto]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gastosRows), "Gastos");

  // Canceladas
  if (input.ventasCanceladas.length) {
    const cancRows = [
      ["Folio", "Cliente", "Total"],
      ...input.ventasCanceladas.map((v) => [v.folio, v.cliente, v.total]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cancRows), "Canceladas");
  }

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}
