import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Ticket desde Ventas (web) en celular: el «Saldo» final debe ser el de toda la cuenta del cliente,
// no solo el de este pedido. Antes la consulta del saldo anterior estaba dentro de `if (!isMobile)`.
describe('VentaForm: ticket con saldo de la cuenta también en celular', () => {
  const src = readFileSync('src/pages/VentaForm/index.tsx', 'utf8');
  const inicio = src.indexOf('const handlePrintTicket = async () => {');
  const cuerpo = src.slice(inicio, src.indexOf('printTicket(td', inicio));

  it('consulta el saldo de las otras ventas del cliente', () => {
    expect(inicio).toBeGreaterThan(0);
    expect(cuerpo).toContain('fetchVentaDesktopTicketSaldo(');
  });

  it('no depende de si es celular o computadora', () => {
    expect(cuerpo).not.toMatch(/isMobile/);
  });
});
