// Abono de timbres pagados (S-07). La referencia (sesión o factura de Stripe) es única
// en timbres_movimientos: el mismo pago nunca se abona dos veces aunque lleguen
// varios avisos (página de éxito, webhook, marcado manual) al mismo tiempo.

/** Devuelve el saldo nuevo, o null si ese pago ya se había abonado. */
export async function acreditarTimbresPago(
  supabase: any,
  p: { empresaId: string; cantidad: number; userId: string; notas: string; referencia: string },
): Promise<number | null> {
  const { data, error } = await supabase.rpc("acreditar_timbres_pago", {
    p_empresa_id: p.empresaId,
    p_cantidad: p.cantidad,
    p_user_id: p.userId,
    p_notas: p.notas,
    p_referencia: p.referencia,
  });
  if (error) throw new Error(`No se pudieron abonar los timbres: ${error.message}`);
  return data ?? null;
}

/** Factura de Stripe pagada con metadata.timbres > 0 (admin-billing create_pro_invoice). */
export async function acreditarTimbresFacturaPagada(supabase: any, invoice: any): Promise<number | null> {
  const meta = invoice?.metadata || {};
  const cantidad = parseInt(meta.timbres || "0", 10);
  if (invoice?.status !== "paid" || !cantidad || cantidad <= 0) return null;
  if (!meta.empresa_id || !meta.timbres_user_id) {
    throw new Error(`Factura ${invoice.id} con timbres sin empresa_id/timbres_user_id en metadata`);
  }
  return acreditarTimbresPago(supabase, {
    empresaId: meta.empresa_id,
    cantidad,
    userId: meta.timbres_user_id,
    notas: `Factura ${invoice.number || String(invoice.id).slice(-8)} pagada — ${cantidad} timbres`,
    referencia: `stripe_invoice:${invoice.id}`,
  });
}

/** Checkout de compra de timbres (purchase-timbres create_checkout). */
export async function acreditarTimbresCheckout(supabase: any, session: any): Promise<number | null> {
  const meta = session?.metadata || {};
  if (meta.type !== "timbres_purchase") throw new Error("Sesión inválida");
  if (session.payment_status !== "paid") return null;
  const cantidad = parseInt(meta.timbres || "0", 10);
  if (!cantidad || !meta.empresa_id || !meta.user_id) throw new Error("Metadata incompleta");
  return acreditarTimbresPago(supabase, {
    empresaId: meta.empresa_id,
    cantidad,
    userId: meta.user_id,
    notas: `Compra self-service: ${cantidad} timbres (Stripe session ${session.id})`,
    referencia: `stripe_checkout:${session.id}`,
  });
}
