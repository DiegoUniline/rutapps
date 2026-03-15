import { supabase } from '@/lib/supabase';

/**
 * Send a PDF document via WhatsApp.
 */
export async function sendDocumentWhatsApp(params: {
  blob: Blob;
  fileName: string;
  empresaId: string;
  phone: string;
  caption?: string;
  tipo?: string;
  referencia_id?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { blob, fileName, empresaId, phone, caption, tipo, referencia_id } = params;

  let storagePath = '';

  try {
    // 1. Check WhatsApp is active
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('activo')
      .eq('empresa_id', empresaId)
      .single();

    if (!config?.activo) {
      return { success: false, error: 'WhatsApp no está activo' };
    }

    // 2. Upload to Storage
    const path = `whatsapp/${Date.now()}-${fileName}`;
    storagePath = path;
    const { error: upErr } = await supabase.storage
      .from('empresa-assets')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true });

    if (upErr) throw new Error(`Error subiendo PDF: ${upErr.message}`);

    // 3. Get public URL
    const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    // 4. Send caption text first if provided
    if (caption) {
      await supabase.functions.invoke('whatsapp-sender', {
        body: {
          action: 'send-text',
          empresa_id: empresaId,
          phone,
          message: caption,
          tipo: tipo || 'documento',
          referencia_id,
        },
      });
    }

    // 5. Send file
    const { data: resp, error: fnErr } = await supabase.functions.invoke('whatsapp-sender', {
      body: {
        action: 'send-file',
        empresa_id: empresaId,
        phone,
        url: publicUrl,
        fileName,
        tipo: tipo || 'documento',
        referencia_id,
      },
    });

    if (fnErr) throw new Error(fnErr.message);
    if (resp && !resp.success) throw new Error(resp.error || 'Error enviando documento');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    // Cleanup storage after 30s
    if (storagePath) {
      setTimeout(async () => {
        await supabase.storage.from('empresa-assets').remove([storagePath]);
      }, 30000);
    }
  }
}
