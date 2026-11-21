/**
 * Acciones comunes con un PDF ya generado por código (D-051): compartir el
 * archivo (Web Share), abrirlo para imprimir o descargarlo. Ningún documento se
 * comparte como captura de pantalla.
 */
import { downloadBlob } from '@/lib/mergePdfs';

export type ResultadoCompartir = 'compartido' | 'cancelado' | 'descargado';

/**
 * Comparte el PDF como archivo (WhatsApp, correo… vía Web Share). Si el
 * navegador no puede compartir archivos, lo descarga.
 */
export async function compartirPdf(blob: Blob, fileName: string, titulo: string): Promise<ResultadoCompartir> {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: titulo });
      return 'compartido';
    } catch (err) {
      // Cerrar el diálogo de compartir no es un error.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelado';
      // Otro fallo del sistema al compartir: se descarga para no dejar al usuario sin el archivo.
    }
  }
  downloadBlob(blob, fileName);
  return 'descargado';
}

/**
 * Abre el PDF en otra pestaña (visor del navegador, con su botón de imprimir).
 * Si el navegador bloquea la ventana, lo descarga.
 */
export function abrirPdf(blob: Blob, fileName: string): 'abierto' | 'descargado' {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    downloadBlob(blob, fileName);
    return 'descargado';
  }
  // El visor ya cargó el archivo; se libera la memoria después.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'abierto';
}
