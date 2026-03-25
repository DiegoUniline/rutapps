/**
 * Ticket HTML para liquidación de ruta — formato térmico 80mm
 */

const fmtNum = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const makeFmt = (sym: string) => (n: number) => `${sym}${fmtNum(n)}`;

export interface StockLineItem {
  nombre: string;
  codigo: string;
  cargada: number;
  vendida: number;
  devuelta: number;
  restante: number;
}

export interface LiquidacionTicketData {
  empresaNombre: string;
  vendedorNombre: string;
  fechaInicio: string;
  fechaFin: string;
  status: string;
  efectivoEntregado: number;
  ventas: { folio: string; cliente: string; condicion: string; total: number }[];
  cobros: { cliente: string; metodo: string; monto: number }[];
  gastos: { concepto: string; monto: number }[];
  devoluciones: { nombre: string; cantidad: number; motivo: string }[];
  cuadre: {
    totalContado: number;
    totalCredito: number;
    cobrosEfectivo: number;
    totalGastos: number;
    efectivoEsperado: number;
    diferencia: number;
  };
  stockInicio?: { fecha: string; lineas: StockLineItem[] };
  stockFin?: { fecha: string; lineas: StockLineItem[] };
}

const statusLabel: Record<string, string> = {
  pendiente: '⏳ Pendiente', aprobada: '✅ Aprobada', rechazada: '❌ Rechazada',
};

export function buildLiquidacionTicketHTML(data: LiquidacionTicketData): string {
  const {
    empresaNombre, vendedorNombre, fechaInicio, fechaFin, status,
    efectivoEntregado, ventas, cobros, gastos, devoluciones, cuadre,
  } = data;

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const totalCobros = cobros.reduce((s, c) => s + c.monto, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const periodoLabel = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} al ${fechaFin}`;

  function buildStockSection(stock: { fecha: string; lineas: StockLineItem[] } | undefined, title: string) {
    if (!stock || stock.lineas.length === 0) return '';
    const rows = stock.lineas.map(l => `
      <div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:4px">${l.nombre}</span>
        <span style="white-space:nowrap;color:#888;font-size:9px">C:${l.cargada} V:${l.vendida} D:${l.devuelta}</span>
        <span style="font-weight:600;white-space:nowrap;min-width:30px;text-align:right">${l.restante}</span>
      </div>
    `).join('');
    return `
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="padding:4px 0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:4px">📦 ${title} (${stock.fecha})</div>
      ${rows}
    </div>`;
  }

  const ventasHtml = ventas.map(v => `
    <div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:4px"><b>${v.folio}</b> ${v.cliente}</span>
      <span style="font-weight:600;white-space:nowrap">${fmt(v.total)}</span>
    </div>
  `).join('');

  const cobrosHtml = cobros.map(c => `
    <div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:4px">${c.cliente} <span style="color:#888;text-transform:capitalize">(${c.metodo})</span></span>
      <span style="font-weight:600;white-space:nowrap">${fmt(c.monto)}</span>
    </div>
  `).join('');

  const gastosHtml = gastos.map(g => `
    <div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0">
      <span style="color:#666">${g.concepto}</span>
      <span style="font-weight:600;color:#dc2626;white-space:nowrap">-${fmt(g.monto)}</span>
    </div>
  `).join('');

  const devHtml = devoluciones.map(d => `
    <div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:4px">${d.cantidad}x ${d.nombre}</span>
      <span style="color:#888;font-size:9px">${d.motivo}</span>
    </div>
  `).join('');

  const dif = cuadre.diferencia;
  const difColor = dif > 0 ? '#16a34a' : dif < 0 ? '#dc2626' : '#16a34a';
  const difLabel = dif > 0 ? 'Sobra' : dif < 0 ? 'Falta' : 'Cuadra';

  return `<div style="width:320px;padding:12px 16px;font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#222;line-height:1.4">
    <div style="text-align:center;padding-bottom:6px">
      <div style="font-size:12px;font-weight:700">${empresaNombre}</div>
      <div style="font-size:10px;font-weight:700;margin-top:4px;color:#333">LIQUIDACIÓN DE RUTA</div>
      <div style="font-size:9px;color:#888;margin-top:2px">${statusLabel[status] ?? status}</div>
    </div>

    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>

    <div style="font-size:10px;padding:4px 0">
      <div><b>Vendedor</b> <span style="color:#666">${vendedorNombre}</span></div>
      <div><b>Periodo</b> <span style="color:#666">${periodoLabel}</span></div>
    </div>

    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>

    <!-- CUADRE DE EFECTIVO -->
    <div style="padding:4px 0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:4px">Cuadre de efectivo</div>
      <div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">Ventas contado</span><span>${fmt(cuadre.totalContado)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">+ Cobros efectivo</span><span>${fmt(cuadre.cobrosEfectivo)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:10px"><span style="color:#666">− Gastos</span><span style="color:#dc2626">-${fmt(cuadre.totalGastos)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;border-top:1px dashed #aaa;padding-top:3px;margin-top:3px">
        <span>Efectivo esperado</span><span>${fmt(cuadre.efectivoEsperado)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin-top:2px">
        <span>Efectivo entregado</span><span>${fmt(efectivoEntregado)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;border-top:1px dashed #aaa;padding-top:3px;margin-top:3px">
        <span>Diferencia</span><span style="color:${difColor}">${dif > 0 ? '+' : ''}${fmt(dif)} (${difLabel})</span>
      </div>
    </div>

    ${ventas.length > 0 ? `
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="padding:4px 0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:4px">Ventas (${ventas.length})</div>
      ${ventasHtml}
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;border-top:1px dashed #aaa;padding-top:3px;margin-top:3px">
        <span>Total ventas</span><span>${fmt(totalVentas)}</span>
      </div>
      <div style="display:flex;gap:12px;font-size:9px;color:#888;margin-top:2px">
        <span>Contado: ${fmt(cuadre.totalContado)}</span>
        <span>Crédito: ${fmt(cuadre.totalCredito)}</span>
      </div>
    </div>` : ''}

    ${cobros.length > 0 ? `
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="padding:4px 0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:4px">Cobros (${cobros.length})</div>
      ${cobrosHtml}
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;border-top:1px dashed #aaa;padding-top:3px;margin-top:3px">
        <span>Total cobros</span><span>${fmt(totalCobros)}</span>
      </div>
    </div>` : ''}

    ${gastos.length > 0 ? `
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="padding:4px 0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:4px">Gastos (${gastos.length})</div>
      ${gastosHtml}
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;border-top:1px dashed #aaa;padding-top:3px;margin-top:3px">
        <span>Total gastos</span><span style="color:#dc2626">-${fmt(totalGastos)}</span>
      </div>
    </div>` : ''}

    ${devoluciones.length > 0 ? `
    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>
    <div style="padding:4px 0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:4px">Devoluciones (${devoluciones.length})</div>
      ${devHtml}
    </div>` : ''}

    ${buildStockSection(data.stockInicio, 'Stock a bordo — Inicio')}
    ${buildStockSection(data.stockFin, 'Stock a bordo — Fin')}

    <div style="border-top:1px dashed #aaa;margin:5px 0"></div>

    <!-- FIRMAS -->
    <div style="padding:20px 0 4px;display:flex;gap:16px">
      <div style="flex:1;text-align:center">
        <div style="border-top:1px solid #222;margin-top:30px;padding-top:3px">
          <div style="font-size:9px;color:#888">Vendedor</div>
          <div style="font-size:9px;font-weight:600">${vendedorNombre}</div>
        </div>
      </div>
      <div style="flex:1;text-align:center">
        <div style="border-top:1px solid #222;margin-top:30px;padding-top:3px">
          <div style="font-size:9px;color:#888">Supervisor</div>
        </div>
      </div>
    </div>

    <div style="border-top:1px dashed #ccc;margin-top:6px;padding-top:4px;text-align:center;font-size:7px;color:#999">Elaborado por Uniline — Innovación en la nube</div>
  </div>`;
}
