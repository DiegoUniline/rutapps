import type { MouseEvent } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

/**
 * Abre el PDF/XML de un CFDI o REP. Los archivos nuevos viven en un bucket privado
 * ("storage:..."): se pide un enlace firmado temporal a la función facturama.
 * Los archivos viejos (URL http pública) se abren tal cual.
 */
export async function abrirArchivoCfdi(
  e: MouseEvent | null,
  tabla: 'cfdis' | 'cfdi_pagos',
  id: string,
  tipo: 'pdf' | 'xml',
  ref: string | null | undefined,
) {
  e?.preventDefault();
  e?.stopPropagation();
  if (!ref) return;
  if (/^https?:\/\//.test(ref)) { window.open(ref, '_blank', 'noopener'); return; }
  // La ventana se abre en el clic (síncrono) para que el navegador no la bloquee.
  const win = window.open('', '_blank');
  try {
    const { data, error } = await supabase.functions.invoke('facturama', {
      body: { action: 'url_archivo', tabla, id, tipo },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (!data?.url) throw new Error('No se recibió el enlace del archivo');
    if (win) win.location.href = data.url; else window.location.href = data.url;
  } catch (err: any) {
    win?.close();
    toast.error(`No se pudo abrir el archivo: ${err?.message ?? err}`);
  }
}
