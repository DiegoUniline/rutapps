// pdf-lib (≈la mayor parte del peso de VentasListPage) se carga DIFERIDO: solo
// se descarga cuando el usuario realmente combina/imprime PDFs en lote.

/**
 * Merge multiple PDF Blobs into a single PDF Blob.
 */
export async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const b of blobs) {
    if (!b) continue;
    const bytes = await b.arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  const out = await merged.save();
  // Copy into a fresh ArrayBuffer so it satisfies BlobPart (Uint8Array<ArrayBufferLike> -> ArrayBuffer)
  const buf = new ArrayBuffer(out.byteLength);
  new Uint8Array(buf).set(out);
  return new Blob([buf], { type: 'application/pdf' });
}

/**
 * Download a blob with a given file name.
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
