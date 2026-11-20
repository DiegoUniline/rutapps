/**
 * Decodifica los bytes ESC/POS del ticket a texto plano (una entrada por
 * renglón impreso), quitando los comandos de control. Solo para pruebas.
 */
export function escposATexto(bytes: Uint8Array): string[] {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x1b) {
      const cmd = bytes[i + 1];
      if (cmd === 0x40) { i += 2; continue; } // ESC @
      i += 3; continue; // ESC a n · ESC E n
    }
    if (b === 0x1d) {
      const cmd = bytes[i + 1];
      if (cmd === 0x56) { i += 4; continue; } // GS V B 0 (corte)
      if (cmd === 0x4c || cmd === 0x57) { i += 4; continue; } // GS L / GS W
      if (cmd === 0x76) { // GS v 0 m xL xH yL yH datos
        const xL = bytes[i + 4], xH = bytes[i + 5], yL = bytes[i + 6], yH = bytes[i + 7];
        i += 8 + (xL + (xH << 8)) * (yL + (yH << 8));
        continue;
      }
      i += 2; continue;
    }
    out.push(b);
    i++;
  }
  return new TextDecoder().decode(new Uint8Array(out)).split('\n');
}
