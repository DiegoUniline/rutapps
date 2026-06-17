import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPER_ADMIN_EMAIL = "diego.leon@uniline.mx";
async function assertSuperAdmin(user: any) {
  const email = (user?.email || "").toLowerCase();
  if (email !== SUPER_ADMIN_EMAIL) throw new Error("Acceso restringido: solo super admin");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Use production API
const FACTURAMA_API = "https://api.facturama.mx";

function getAuth() {
  const user = Deno.env.get("FACTURAMA_USERNAME");
  const pass = Deno.env.get("FACTURAMA_PASSWORD");
  if (!user || !pass) throw new Error("Credenciales de Facturama no configuradas");
  return "Basic " + btoa(`${user}:${pass}`);
}

function getSupabase(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function getServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// Round to 2 decimals
function r2(n: number) { return Math.round(n * 100) / 100; }
function r6(n: number) { return Math.round(n * 1000000) / 1000000; }

// Verifica que el empresa_id solicitado coincida con el del usuario, salvo super admin.
async function assertEmpresaAccess(admin: any, userId: string, empresaId: string) {
  if (!empresaId) throw new Error("empresa_id requerido");
  const { data: isSA } = await admin.rpc("is_super_admin", { p_user_id: userId });
  if (isSA) return;
  const { data: prof } = await admin
    .from("profiles")
    .select("empresa_id")
    .eq("user_id", userId)
    .single();
  if (!prof || prof.empresa_id !== empresaId) {
    throw new Error("No autorizado para operar sobre esta empresa");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ALL actions require an authenticated user
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("No autenticado");
    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    if (action === "verificar_conexion") {
      return await verificarConexion();
    } else if (action === "list_csds") {
      return await listCsds();
    } else if (action === "upload_csd") {
      return await uploadCsd(body);
    } else if (action === "descargar") {
      // Verify the cfdi belongs to caller's empresa
      const admin = getServiceSupabase();
      const { data: prof } = await admin.from("profiles").select("empresa_id").eq("user_id", user.id).single();
      const { data: isSA } = await admin.rpc("is_super_admin", { p_user_id: user.id });
      if (!isSA) {
        const { data: cfdi } = await admin
          .from("cfdis").select("empresa_id").eq("facturama_id", body.facturama_id).maybeSingle();
        if (!cfdi || cfdi.empresa_id !== prof?.empresa_id) {
          throw new Error("No autorizado");
        }
      }
      return await descargar(body);
    } else if (action === "suscription_plan") {
      return await getSuscriptionPlan();
    }

    if (action === "timbrar") {
      await assertEmpresaAccess(getServiceSupabase(), user.id, body.empresa_id);
      return await timbrar(supabase, user.id, body);
    } else if (action === "cancelar") {
      return await cancelar(supabase, user.id, body);
    } else if (action === "timbrar_pago") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(getServiceSupabase(), user.id, body.empresa_id);
      return await timbrarPago(supabase, user.id, body);
    } else if (action === "timbrar_global") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(getServiceSupabase(), user.id, body.empresa_id);
      return await timbrarGlobal(supabase, user.id, body);
    } else if (action === "validar_rfc") {
      await assertSuperAdmin(user);
      return await validarRfc(body);
    } else if (action === "sustituir") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(getServiceSupabase(), user.id, body.empresa_id);
      return await sustituir(supabase, user.id, body);
    } else if (action === "enviar_correo") {
      await assertSuperAdmin(user);
      return await enviarCorreo(supabase, body);
    } else {
      throw new Error(`Acción no válida: ${action}`);
    }

  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});


// ========================================
// VERIFICAR CONEXIÓN
// ========================================
async function verificarConexion() {
  const auth = getAuth();
  const res = await fetch(`${FACTURAMA_API}/api-lite/cfdis?page=1&size=1`, {
    headers: { Authorization: auth },
  });
  const ok = res.status === 200;
  return new Response(
    JSON.stringify({ ok, status: res.status }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// UPLOAD CSD (Certificado de Sello Digital)
// ========================================
async function uploadCsd(body: any) {
  const auth = getAuth();
  const { rfc, certificate_base64, private_key_base64, password } = body;

  if (!rfc || !certificate_base64 || !private_key_base64 || !password) {
    throw new Error("Faltan campos: rfc, certificate_base64, private_key_base64, password");
  }

  const payload = {
    Rfc: rfc.toUpperCase().trim(),
    Certificate: certificate_base64,
    PrivateKey: private_key_base64,
    PrivateKeyPassword: password,
  };

  console.log(`📤 Subiendo CSD para RFC: ${payload.Rfc}`);

  // Try POST first (new), if 409/conflict try PUT (update)
  let response = await fetch(`${FACTURAMA_API}/api-lite/csds`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 409 || response.status === 400) {
    // CSD already exists, try update
    console.log("CSD ya existe, intentando actualizar...");
    response = await fetch(`${FACTURAMA_API}/api-lite/csds/${encodeURIComponent(payload.Rfc)}`, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  const content = await response.text();
  console.log(`📥 CSD response [${response.status}]:`, content);

  if (response.status !== 200 && response.status !== 201 && response.status !== 204) {
    throw new Error(`Error al subir CSD: ${content}`);
  }

  return new Response(
    JSON.stringify({ success: true, message: "CSD subido correctamente a Facturama" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// LIST CSDs
// ========================================
async function listCsds() {
  const auth = getAuth();
  const res = await fetch(`${FACTURAMA_API}/api-lite/csds`, {
    headers: { Authorization: auth },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error al obtener CSDs: ${text}`);
  }

  const data = await res.json();
  return new Response(
    JSON.stringify({ csds: data }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// TIMBRAR CFDI
// ========================================
async function timbrar(supabase: any, userId: string, body: any) {
  const auth = getAuth();
  const serviceDb = getServiceSupabase();
  const { cfdi_id, venta_id, empresa_id, issuer, receiver, items, cfdi_type, currency, payment_form, payment_method, expedition_place, serie, name_id } = body;

  // Atomic reservation of 1 timbre (prevents race conditions with concurrent timbrados).
  // If the Facturama call fails further down, the reservation is released.
  const { data: reservationId, error: reserveErr } = await serviceDb.rpc("reserve_timbre", {
    p_empresa_id: empresa_id,
    p_user_id: userId,
  });
  if (reserveErr) {
    console.error("Error reserving timbre:", reserveErr);
    throw new Error("No se pudo reservar el timbre. Intenta de nuevo.");
  }
  if (!reservationId) {
    throw new Error("No tienes timbres disponibles. Contacta al administrador para adquirir más timbres.");
  }

  // Auto-generate folio if not provided
  let folio = body.folio;
  if (!folio || folio.trim() === '') {
    folio = String(Date.now()).slice(-8);
  }

  try {


  // Validate SAT data per item BEFORE building Facturama payload
  const satErrors: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const code = (it.product_code || '').toString().trim();
    if (!/^\d{8}$/.test(code)) {
      satErrors.push(`Línea ${i + 1}: Clave SAT inválida ("${code}"), debe ser 8 dígitos`);
    } else if (code === '01010101') {
      satErrors.push(`Línea ${i + 1}: Clave SAT genérica (01010101) no permitida; usa la clave real del producto`);
    }
    if (!it.unit_code || !it.unit) {
      satErrors.push(`Línea ${i + 1}: falta Unidad SAT (unit_code/unit)`);
    }
  }
  if (satErrors.length > 0) {
    // No timbre fue cobrado todavía (reservation ocurrió arriba), liberamos
    try { await serviceDb.rpc("release_timbre", { p_reservation_id: reservationId, p_motivo: "Validación SAT" }); } catch {}
    throw new Error("Datos SAT inválidos:\n• " + satErrors.join("\n• "));
  }

  // Build Facturama items with exact tax calculations
  const facItems: any[] = [];
  let totalFactura = 0;

  for (const item of items) {
    const unitPrice = r2(item.unit_price);
    const quantity = r6(item.quantity);
    const subtotal = r2(unitPrice * quantity);

    const facItem: any = {
      ProductCode: item.product_code,
      Description: item.description,
      Unit: item.unit,
      UnitCode: item.unit_code,
      UnitPrice: unitPrice,
      Quantity: quantity,
      Subtotal: subtotal,
      Taxes: [],
      Total: subtotal,
    };

    // IVA Trasladado
    if (item.iva_rate && item.iva_rate > 0) {
      const rate = r6(item.iva_rate);
      const amount = r2(subtotal * rate);
      facItem.Taxes.push({ Total: amount, Name: "IVA", Base: subtotal, Rate: rate, IsRetention: false });
      facItem.Total += amount;
    }

    // IVA Retenido
    if (item.iva_ret_rate && item.iva_ret_rate > 0) {
      const rate = r6(item.iva_ret_rate);
      const amount = r2(subtotal * rate);
      facItem.Taxes.push({ Total: amount, Name: "IVA", Base: subtotal, Rate: rate, IsRetention: true });
      facItem.Total -= amount;
    }

    // ISR Retenido
    if (item.isr_ret_rate && item.isr_ret_rate > 0) {
      const rate = r6(item.isr_ret_rate);
      const amount = r2(subtotal * rate);
      facItem.Taxes.push({ Total: amount, Name: "ISR", Base: subtotal, Rate: rate, IsRetention: true });
      facItem.Total -= amount;
    }

    // IEPS
    if (item.ieps_rate && item.ieps_rate > 0) {
      const rate = r6(item.ieps_rate);
      const amount = r2(subtotal * rate);
      facItem.Taxes.push({ Total: amount, Name: "IEPS", Base: subtotal, Rate: rate, IsRetention: false });
      facItem.Total += amount;
    }

    if (facItem.Taxes.length > 0) {
      facItem.TaxObject = "02";
    } else {
      facItem.TaxObject = "01";
      delete facItem.Taxes;
    }
    facItem.Total = r2(facItem.Total);
    totalFactura += facItem.Total;
    facItems.push(facItem);
  }

  const invoiceData: any = {
    NameId: name_id || "1",
    Folio: folio || "",
    Serie: serie || "",
    CfdiType: cfdi_type || "I",
    Currency: currency || "MXN",
    PaymentForm: payment_form,
    PaymentMethod: payment_method,
    ExpeditionPlace: expedition_place,
    Issuer: {
      FiscalRegime: issuer.fiscal_regime,
      Rfc: issuer.rfc,
      Name: issuer.name,
    },
    Receiver: {
      Rfc: receiver.rfc,
      Name: receiver.name,
      CfdiUse: receiver.cfdi_use,
      FiscalRegime: receiver.fiscal_regime,
      TaxZipCode: receiver.tax_zip_code,
    },
    Items: facItems,
  };

  console.log("📤 Enviando a Facturama:", JSON.stringify(invoiceData));

  const response = await fetch(`${FACTURAMA_API}/api-lite/3/cfdis`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(invoiceData),
  });

  const content = await response.text();
  console.log(`📥 Facturama response [${response.status}]:`, content);

  if (response.status !== 200 && response.status !== 201) {
    // Release reservation: Facturama no aceptó la factura
    try {
      await serviceDb.rpc("release_timbre", {
        p_reservation_id: reservationId,
        p_motivo: `Facturama rechazó timbrado: HTTP ${response.status}`,
      });
    } catch (e: any) { console.error("release_timbre fallo:", e); }

    // Save error to DB
    await supabase.from("cfdis").insert({
      empresa_id,
      venta_id: venta_id || null,
      status: "error",
      error_detalle: content,
      total: r2(totalFactura),
      user_id: userId,
      receiver_rfc: receiver.rfc,
      receiver_name: receiver.name,
      payment_form,
      payment_method,
      expedition_place,
      cfdi_type: cfdi_type || "I",
      currency: currency || "MXN",
    });

    throw new Error(`Facturama rechazó: ${content}`);
  }


  const result = JSON.parse(content);
  const facturamaId = result.Id;
  const folioFiscal = result.Complement?.TaxStamp?.Uuid;
  const selloCfdi = result.Complement?.TaxStamp?.CfdiSign || null;
  const selloSat = result.Complement?.TaxStamp?.SatSign || null;
  const noCertSat = result.Complement?.TaxStamp?.SatCertNumber || null;
  const noCertEmisor = result.Complement?.TaxStamp?.NoCertificado || null;
  const fechaTimbrado = result.Complement?.TaxStamp?.Date || null;
  const cadenaOriginal = result.OriginalString || null;

  // Download PDF and XML as base64
  let pdfBase64 = null;
  let xmlBase64 = null;
  try {
    const pdfRes = await fetch(`${FACTURAMA_API}/cfdi/pdf/issuedLite/${facturamaId}`, {
      headers: { Authorization: auth },
    });
    if (pdfRes.ok) {
      const pdfData = await pdfRes.json();
      if (pdfData.Content) pdfBase64 = pdfData.Content;
    }
  } catch (e) { console.error("Error PDF:", e); }

  try {
    const xmlRes = await fetch(`${FACTURAMA_API}/cfdi/xml/issuedLite/${facturamaId}`, {
      headers: { Authorization: auth },
    });
    if (xmlRes.ok) {
      const xmlData = await xmlRes.json();
      if (xmlData.Content) xmlBase64 = xmlData.Content;
    }
  } catch (e) { console.error("Error XML:", e); }

  // Upload files to storage
  let pdfUrl = null;
  let xmlUrl = null;
  const timestamp = Date.now();

  if (pdfBase64) {
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    const pdfPath = `cfdis/${empresa_id}/${facturamaId}_${timestamp}.pdf`;
    const { error: pdfErr } = await supabase.storage
      .from("empresa-assets")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (!pdfErr) {
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(pdfPath);
      pdfUrl = urlData?.publicUrl;
    }
  }

  if (xmlBase64) {
    const xmlBytes = new TextEncoder().encode(atob(xmlBase64));
    const xmlPath = `cfdis/${empresa_id}/${facturamaId}_${timestamp}.xml`;
    const { error: xmlErr } = await supabase.storage
      .from("empresa-assets")
      .upload(xmlPath, xmlBytes, { contentType: "application/xml", upsert: true });
    if (!xmlErr) {
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(xmlPath);
      xmlUrl = urlData?.publicUrl;
    }
  }

  // Calculate tax totals
  let ivaTotal = 0, iepsTotal = 0, retencionesTotal = 0, subtotalTotal = 0;
  for (const fi of facItems) {
    subtotalTotal += fi.Subtotal;
    for (const tax of (fi.Taxes || [])) {
      if (tax.IsRetention) retencionesTotal += tax.Total;
      else if (tax.Name === "IVA") ivaTotal += tax.Total;
      else if (tax.Name === "IEPS") iepsTotal += tax.Total;
    }
  }

  // Save CFDI record — update existing borrador if cfdi_id provided, else insert new
  let cfdiRecord = null;
  const cfdiPayload = {
    empresa_id,
    venta_id: venta_id || null,
    facturama_id: facturamaId,
    folio_fiscal: folioFiscal,
    serie: serie || "",
    folio: folio || "",
    cfdi_type: cfdi_type || "I",
    currency: currency || "MXN",
    payment_form,
    payment_method,
    expedition_place,
    receiver_rfc: receiver.rfc,
    receiver_name: receiver.name,
    receiver_cfdi_use: receiver.cfdi_use,
    receiver_fiscal_regime: receiver.fiscal_regime,
    receiver_tax_zip_code: receiver.tax_zip_code,
    subtotal: r2(subtotalTotal),
    iva_total: r2(ivaTotal),
    ieps_total: r2(iepsTotal),
    retenciones_total: r2(retencionesTotal),
    total: r2(totalFactura),
    pdf_url: pdfUrl,
    xml_url: xmlUrl,
    status: "timbrado",
    user_id: userId,
    updated_at: new Date().toISOString(),
    cadena_original: cadenaOriginal,
    sello_cfdi: selloCfdi,
    sello_sat: selloSat,
    no_certificado_sat: noCertSat,
    no_certificado_emisor: noCertEmisor,
    fecha_timbrado: fechaTimbrado,
  };

  if (cfdi_id) {
    const { data, error: updateErr } = await supabase.from("cfdis")
      .update(cfdiPayload)
      .eq("id", cfdi_id)
      .select().single();
    if (updateErr) console.error("Error updating CFDI:", updateErr);
    cfdiRecord = data;
  } else {
    const { data, error: insertErr } = await supabase.from("cfdis")
      .insert(cfdiPayload)
      .select().single();
    if (insertErr) console.error("Error inserting CFDI:", insertErr);
    cfdiRecord = data;
  }

  // Confirm the previously-reserved timbre and link it to the new CFDI record
  const cfdiIdForDeduct = cfdiRecord?.id || cfdi_id;
  if (cfdiIdForDeduct) {
    const { data: confirmed } = await serviceDb.rpc("confirm_timbre_reserve", {
      p_reservation_id: reservationId,
      p_cfdi_id: cfdiIdForDeduct,
    });
    if (!confirmed) {
      console.error("Warning: Could not confirm reserved timbre after successful timbrado");
    }
  } else {
    // No pudimos guardar el CFDI: liberar el timbre, ya que la factura no quedó registrada localmente
    try {
      await serviceDb.rpc("release_timbre", {
        p_reservation_id: reservationId,
        p_motivo: "CFDI timbrado en Facturama pero no persistido localmente",
      });
    } catch (e: any) { console.error("release_timbre fallback fallo:", e); }
  }

  return new Response(
    JSON.stringify({
      success: true,
      cfdi: cfdiRecord,
      facturama_id: facturamaId,
      folio_fiscal: folioFiscal,
      pdf_url: pdfUrl,
      xml_url: xmlUrl,
      total: r2(totalFactura),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
  } catch (err) {
    // Cualquier error inesperado (red, parseo, storage, etc.) libera la reserva si aún existe.
    try {
      await serviceDb.rpc("release_timbre", {
        p_reservation_id: reservationId,
        p_motivo: `Error inesperado en timbrar: ${(err as any)?.message || String(err)}`,
      });
    } catch (e: any) { console.error("release_timbre en catch fallo:", e); }
    throw err;
  }
}


// ========================================
// CANCELAR CFDI
// ========================================
async function cancelar(supabase: any, userId: string, body: any) {
  const auth = getAuth();
  const { cfdi_id, rfc_emisor, motivo } = body;

  // Get CFDI record
  const { data: cfdi, error } = await supabase
    .from("cfdis")
    .select("*")
    .eq("id", cfdi_id)
    .single();

  if (error || !cfdi) throw new Error("CFDI no encontrado");

  // Verify the user has access to this CFDI's empresa
  await assertEmpresaAccess(getServiceSupabase(), userId, cfdi.empresa_id);

  if (cfdi.status === "cancelado") throw new Error("CFDI ya está cancelado");


  const facturamaId = cfdi.facturama_id;
  if (!facturamaId) throw new Error("No hay ID de Facturama asociado");

  const cancelMotivo = motivo || "02";
  const cancelUrl = `${FACTURAMA_API}/api-lite/cfdis/${facturamaId}?motive=${cancelMotivo}&rfc=${rfc_emisor}`;

  console.log(`📤 Cancelando: ${cancelUrl}`);

  const response = await fetch(cancelUrl, {
    method: "DELETE",
    headers: { Authorization: auth },
  });

  const content = await response.text();
  console.log(`📥 Cancel response [${response.status}]:`, content);

  if (response.status !== 200) {
    throw new Error(`Error al cancelar: ${content}`);
  }

  const result = JSON.parse(content);
  const statusMap: Record<string, string> = {
    pending: "cancelacion_pendiente",
    rejected: "cancelacion_rechazada",
    canceled: "cancelado",
    accepted: "cancelado",
  };
  const newStatus = statusMap[result.Status] || "cancelacion_pendiente";

  await supabase
    .from("cfdis")
    .update({
      status: newStatus,
      cancel_status: result.Status,
      cancel_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", cfdi_id);

  return new Response(
    JSON.stringify({
      success: true,
      status: newStatus,
      facturama_status: result.Status,
      message: result.Message || "Cancelación procesada",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// DESCARGAR PDF/XML
// ========================================
async function descargar(body: any) {
  const auth = getAuth();
  const { facturama_id, type } = body;

  const endpoint = type === "xml"
    ? `${FACTURAMA_API}/cfdi/xml/issuedLite/${facturama_id}`
    : `${FACTURAMA_API}/cfdi/pdf/issuedLite/${facturama_id}`;

  const res = await fetch(endpoint, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`Error al descargar ${type}`);

  const data = await res.json();

  return new Response(
    JSON.stringify({ content: data.Content, encoding: data.ContentEncoding }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getSuscriptionPlan() {
  const res = await fetch(`${FACTURAMA_API}/SuscriptionPlan`, {
    headers: { Authorization: getAuth() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error al consultar plan Facturama: ${res.status} - ${text}`);
  }
  const data = await res.json();
  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// TIMBRAR COMPLEMENTO DE PAGOS (REP / Pago 2.0)
// ========================================
async function timbrarPago(supabase: any, userId: string, body: any) {
  const auth = getAuth();
  const serviceDb = getServiceSupabase();
  const {
    empresa_id, cobro_id, issuer, expedition_place,
    fecha_pago, forma_pago, moneda, tipo_cambio, monto, num_operacion,
    rfc_emisor_cta_ord, nom_banco_ord_ext, cta_ordenante,
    rfc_emisor_cta_ben, cta_beneficiario,
    receiver, related_docs, serie, folio,
  } = body;

  if (!related_docs || !related_docs.length) {
    throw new Error("Debe haber al menos un documento relacionado (CFDI PPD)");
  }

  // Reservar timbre
  const { data: reservationId, error: reserveErr } = await serviceDb.rpc("reserve_timbre", {
    p_empresa_id: empresa_id, p_user_id: userId,
  });
  if (reserveErr || !reservationId) throw new Error("No tienes timbres disponibles");

  try {
    const folioFinal = folio || String(Date.now()).slice(-8);

    const complementoPago: any = {
      Date: fecha_pago,
      PaymentForm: forma_pago,
      Currency: moneda || "MXN",
      ExchangeRate: tipo_cambio || 1,
      Amount: r2(monto),
      RelatedDocuments: related_docs.map((d: any) => ({
        Uuid: d.cfdi_relacionado_uuid,
        Serie: d.serie_dr || "",
        Folio: d.folio_dr || "",
        Currency: d.moneda_dr || "MXN",
        ExchangeRate: d.tipo_cambio_dr || 1,
        PaymentMethod: d.metodo_pago_dr || "PPD",
        PartialityNumber: d.num_parcialidad || 1,
        PreviousBalanceAmount: r2(d.imp_saldo_ant),
        AmountPaid: r2(d.imp_pagado),
        ImpSaldoInsoluto: r2(d.imp_saldo_insoluto),
        TaxObject: d.objeto_imp_dr || "02",
      })),
    };
    if (num_operacion) complementoPago.OperationNumber = num_operacion;
    if (rfc_emisor_cta_ord) complementoPago.RfcIssuerPayerAccount = rfc_emisor_cta_ord;
    if (nom_banco_ord_ext) complementoPago.ForeignAccountNamePayer = nom_banco_ord_ext;
    if (cta_ordenante) complementoPago.PayerAccount = cta_ordenante;
    if (rfc_emisor_cta_ben) complementoPago.RfcIssuerBeneficiaryAccount = rfc_emisor_cta_ben;
    if (cta_beneficiario) complementoPago.BeneficiaryAccount = cta_beneficiario;

    const invoiceData: any = {
      NameId: "14", // Pago
      Folio: folioFinal,
      Serie: serie || "P",
      CfdiType: "P",
      ExpeditionPlace: expedition_place,
      Issuer: {
        FiscalRegime: issuer.fiscal_regime,
        Rfc: issuer.rfc,
        Name: issuer.name,
      },
      Receiver: {
        Rfc: receiver.rfc,
        Name: receiver.name,
        CfdiUse: "CP01",
        FiscalRegime: receiver.fiscal_regime,
        TaxZipCode: receiver.tax_zip_code,
      },
      Items: [{
        Quantity: 1,
        ProductCode: "84111506",
        UnitCode: "ACT",
        Description: "Pago",
        UnitPrice: 0,
        Subtotal: 0,
        Total: 0,
        TaxObject: "01",
      }],
      Complemento: { Payments: [complementoPago] },
    };

    console.log("📤 REP a Facturama:", JSON.stringify(invoiceData));
    const response = await fetch(`${FACTURAMA_API}/api-lite/3/cfdis`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(invoiceData),
    });
    const content = await response.text();
    console.log(`📥 REP response [${response.status}]:`, content);

    if (response.status !== 200 && response.status !== 201) {
      try { await serviceDb.rpc("release_timbre", { p_reservation_id: reservationId, p_motivo: `Facturama rechazó REP: HTTP ${response.status}` }); } catch {}
      await supabase.from("cfdi_pagos").insert({
        empresa_id, cobro_id: cobro_id || null,
        fecha_pago, forma_pago, moneda: moneda || "MXN", tipo_cambio: tipo_cambio || 1,
        monto: r2(monto), num_operacion, expedition_place,
        status: "error", error_detalle: content, user_id: userId,
      });
      throw new Error(`Facturama rechazó REP: ${content}`);
    }

    const result = JSON.parse(content);
    const facturamaId = result.Id;
    const folioFiscal = result.Complement?.TaxStamp?.Uuid;

    // Download PDF + XML
    let pdfUrl = null, xmlUrl = null;
    const timestamp = Date.now();
    try {
      const pdfRes = await fetch(`${FACTURAMA_API}/cfdi/pdf/issuedLite/${facturamaId}`, { headers: { Authorization: auth } });
      if (pdfRes.ok) {
        const pdfData = await pdfRes.json();
        if (pdfData.Content) {
          const pdfBytes = Uint8Array.from(atob(pdfData.Content), c => c.charCodeAt(0));
          const pdfPath = `cfdis/${empresa_id}/REP_${facturamaId}_${timestamp}.pdf`;
          await supabase.storage.from("empresa-assets").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
          pdfUrl = supabase.storage.from("empresa-assets").getPublicUrl(pdfPath).data?.publicUrl;
        }
      }
    } catch (e) { console.error("PDF REP:", e); }
    try {
      const xmlRes = await fetch(`${FACTURAMA_API}/cfdi/xml/issuedLite/${facturamaId}`, { headers: { Authorization: auth } });
      if (xmlRes.ok) {
        const xmlData = await xmlRes.json();
        if (xmlData.Content) {
          const xmlBytes = new TextEncoder().encode(atob(xmlData.Content));
          const xmlPath = `cfdis/${empresa_id}/REP_${facturamaId}_${timestamp}.xml`;
          await supabase.storage.from("empresa-assets").upload(xmlPath, xmlBytes, { contentType: "application/xml", upsert: true });
          xmlUrl = supabase.storage.from("empresa-assets").getPublicUrl(xmlPath).data?.publicUrl;
        }
      }
    } catch (e) { console.error("XML REP:", e); }

    const { data: pagoRecord, error: insertErr } = await supabase.from("cfdi_pagos").insert({
      empresa_id, cobro_id: cobro_id || null,
      facturama_id: facturamaId, folio_fiscal: folioFiscal,
      serie: serie || "P", folio: folioFinal,
      fecha_pago, forma_pago, moneda: moneda || "MXN", tipo_cambio: tipo_cambio || 1,
      monto: r2(monto), num_operacion,
      rfc_emisor_cta_ord, nom_banco_ord_ext, cta_ordenante,
      rfc_emisor_cta_ben, cta_beneficiario,
      expedition_place, pdf_url: pdfUrl, xml_url: xmlUrl,
      status: "timbrado", user_id: userId,
      fecha_timbrado: result.Complement?.TaxStamp?.Date || null,
      sello_cfdi: result.Complement?.TaxStamp?.CfdiSign || null,
      sello_sat: result.Complement?.TaxStamp?.SatSign || null,
      no_certificado_sat: result.Complement?.TaxStamp?.SatCertNumber || null,
      no_certificado_emisor: result.Complement?.TaxStamp?.NoCertificado || null,
      cadena_original: result.OriginalString || null,
    }).select().single();

    if (insertErr) console.error("Error guardando cfdi_pagos:", insertErr);

    if (pagoRecord) {
      const docs = related_docs.map((d: any) => ({
        cfdi_pago_id: pagoRecord.id,
        empresa_id,
        cfdi_id: d.cfdi_id || null,
        venta_id: d.venta_id || null,
        cfdi_relacionado_uuid: d.cfdi_relacionado_uuid,
        serie_dr: d.serie_dr || null,
        folio_dr: d.folio_dr || null,
        moneda_dr: d.moneda_dr || "MXN",
        tipo_cambio_dr: d.tipo_cambio_dr || 1,
        num_parcialidad: d.num_parcialidad || 1,
        imp_saldo_ant: r2(d.imp_saldo_ant),
        imp_pagado: r2(d.imp_pagado),
        imp_saldo_insoluto: r2(d.imp_saldo_insoluto),
        objeto_imp_dr: d.objeto_imp_dr || "02",
        metodo_pago_dr: d.metodo_pago_dr || "PPD",
        iva_trasladado_dr: r2(d.iva_trasladado_dr || 0),
      }));
      await supabase.from("cfdi_pago_documentos").insert(docs);

      try { await serviceDb.rpc("confirm_timbre_reserve", { p_reservation_id: reservationId, p_cfdi_id: pagoRecord.id }); } catch (e) { console.error(e); }
    }

    return new Response(JSON.stringify({
      success: true, cfdi_pago: pagoRecord, facturama_id: facturamaId, folio_fiscal: folioFiscal, pdf_url: pdfUrl, xml_url: xmlUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    try { await serviceDb.rpc("release_timbre", { p_reservation_id: reservationId, p_motivo: `Error inesperado en timbrar_pago: ${(err as any)?.message || String(err)}` }); } catch {}
    throw err;
  }
}

// ========================================
// TIMBRAR FACTURA GLOBAL DE PÚBLICO EN GENERAL
// ========================================
async function timbrarGlobal(supabase: any, userId: string, body: any) {
  const auth = getAuth();
  const serviceDb = getServiceSupabase();
  const {
    empresa_id, issuer, expedition_place,
    periodicidad, meses, year,
    fecha_inicio, fecha_fin,
    venta_lines, // [{ venta_id, folio, subtotal, iva, ieps, total, descripcion, product_code, unit_code, unit, iva_rate, ieps_rate }]
    serie, folio, payment_form,
  } = body;

  if (!venta_lines || !venta_lines.length) throw new Error("No hay ventas para facturar");

  const { data: reservationId, error: reserveErr } = await serviceDb.rpc("reserve_timbre", { p_empresa_id: empresa_id, p_user_id: userId });
  if (reserveErr || !reservationId) throw new Error("No tienes timbres disponibles");

  try {
    const folioFinal = folio || String(Date.now()).slice(-8);

    const facItems: any[] = [];
    let totalFactura = 0, subtotalTotal = 0, ivaTotal = 0, iepsTotal = 0;
    for (const v of venta_lines) {
      const subtotal = r2(v.subtotal);
      const item: any = {
        ProductCode: v.product_code || "01010101",
        IdentificationNumber: String(v.folio || ""),
        Description: v.descripcion || `Venta folio ${v.folio}`,
        Unit: v.unit || "Actividad",
        UnitCode: v.unit_code || "ACT",
        UnitPrice: subtotal,
        Quantity: 1,
        Subtotal: subtotal,
        Total: subtotal,
        Taxes: [],
      };
      if (v.iva_rate && v.iva_rate > 0) {
        const rate = r6(v.iva_rate);
        const amount = r2(subtotal * rate);
        item.Taxes.push({ Total: amount, Name: "IVA", Base: subtotal, Rate: rate, IsRetention: false });
        item.Total += amount; ivaTotal += amount;
      }
      if (v.ieps_rate && v.ieps_rate > 0) {
        const rate = r6(v.ieps_rate);
        const amount = r2(subtotal * rate);
        item.Taxes.push({ Total: amount, Name: "IEPS", Base: subtotal, Rate: rate, IsRetention: false });
        item.Total += amount; iepsTotal += amount;
      }
      if (item.Taxes.length > 0) item.TaxObject = "02"; else { item.TaxObject = "01"; delete item.Taxes; }
      item.Total = r2(item.Total);
      subtotalTotal += subtotal;
      totalFactura += item.Total;
      facItems.push(item);
    }

    const invoiceData: any = {
      NameId: "1",
      Folio: folioFinal,
      Serie: serie || "G",
      CfdiType: "I",
      Currency: "MXN",
      PaymentForm: payment_form || "01",
      PaymentMethod: "PUE",
      ExpeditionPlace: expedition_place,
      GlobalInformation: {
        Periodicity: periodicidad, // 01 diario, 02 semanal, 03 quincenal, 04 mensual, 05 bimestral
        Months: meses, // "01".."13" o bimestral "13".."18"
        Year: year,
      },
      Issuer: {
        FiscalRegime: issuer.fiscal_regime,
        Rfc: issuer.rfc,
        Name: issuer.name,
      },
      Receiver: {
        Rfc: "XAXX010101000",
        Name: "PUBLICO EN GENERAL",
        CfdiUse: "S01",
        FiscalRegime: "616",
        TaxZipCode: expedition_place,
      },
      Items: facItems,
    };

    const response = await fetch(`${FACTURAMA_API}/api-lite/3/cfdis`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(invoiceData),
    });
    const content = await response.text();
    console.log(`📥 Global response [${response.status}]:`, content);

    if (response.status !== 200 && response.status !== 201) {
      try { await serviceDb.rpc("release_timbre", { p_reservation_id: reservationId, p_motivo: `Facturama rechazó global: HTTP ${response.status}` }); } catch {}
      throw new Error(`Facturama rechazó: ${content}`);
    }

    const result = JSON.parse(content);
    const facturamaId = result.Id;
    const folioFiscal = result.Complement?.TaxStamp?.Uuid;

    let pdfUrl = null, xmlUrl = null;
    const timestamp = Date.now();
    try {
      const pdfRes = await fetch(`${FACTURAMA_API}/cfdi/pdf/issuedLite/${facturamaId}`, { headers: { Authorization: auth } });
      if (pdfRes.ok) {
        const pdfData = await pdfRes.json();
        if (pdfData.Content) {
          const bytes = Uint8Array.from(atob(pdfData.Content), c => c.charCodeAt(0));
          const path = `cfdis/${empresa_id}/GLOBAL_${facturamaId}_${timestamp}.pdf`;
          await supabase.storage.from("empresa-assets").upload(path, bytes, { contentType: "application/pdf", upsert: true });
          pdfUrl = supabase.storage.from("empresa-assets").getPublicUrl(path).data?.publicUrl;
        }
      }
    } catch (e) { console.error(e); }
    try {
      const xmlRes = await fetch(`${FACTURAMA_API}/cfdi/xml/issuedLite/${facturamaId}`, { headers: { Authorization: auth } });
      if (xmlRes.ok) {
        const xmlData = await xmlRes.json();
        if (xmlData.Content) {
          const bytes = new TextEncoder().encode(atob(xmlData.Content));
          const path = `cfdis/${empresa_id}/GLOBAL_${facturamaId}_${timestamp}.xml`;
          await supabase.storage.from("empresa-assets").upload(path, bytes, { contentType: "application/xml", upsert: true });
          xmlUrl = supabase.storage.from("empresa-assets").getPublicUrl(path).data?.publicUrl;
        }
      }
    } catch (e) { console.error(e); }

    const { data: cfdiRecord } = await supabase.from("cfdis").insert({
      empresa_id, venta_id: null,
      facturama_id: facturamaId, folio_fiscal: folioFiscal,
      serie: serie || "G", folio: folioFinal,
      cfdi_type: "I", currency: "MXN",
      payment_form: payment_form || "01", payment_method: "PUE",
      expedition_place,
      receiver_rfc: "XAXX010101000", receiver_name: "PUBLICO EN GENERAL",
      receiver_cfdi_use: "S01", receiver_fiscal_regime: "616", receiver_tax_zip_code: expedition_place,
      subtotal: r2(subtotalTotal), iva_total: r2(ivaTotal), ieps_total: r2(iepsTotal), retenciones_total: 0, total: r2(totalFactura),
      pdf_url: pdfUrl, xml_url: xmlUrl, status: "timbrado", user_id: userId,
      cadena_original: result.OriginalString || null,
      sello_cfdi: result.Complement?.TaxStamp?.CfdiSign || null,
      sello_sat: result.Complement?.TaxStamp?.SatSign || null,
      no_certificado_sat: result.Complement?.TaxStamp?.SatCertNumber || null,
      no_certificado_emisor: result.Complement?.TaxStamp?.NoCertificado || null,
      fecha_timbrado: result.Complement?.TaxStamp?.Date || null,
    }).select().single();

    // Marcar líneas como facturadas_global
    const ventaIds = venta_lines.map((v: any) => v.venta_id).filter(Boolean);
    if (ventaIds.length) {
      await supabase.from("venta_lineas").update({ facturado_global: true }).in("venta_id", ventaIds);
    }

    if (cfdiRecord) {
      try { await serviceDb.rpc("confirm_timbre_reserve", { p_reservation_id: reservationId, p_cfdi_id: cfdiRecord.id }); } catch (e) { console.error(e); }
    }

    return new Response(JSON.stringify({
      success: true, cfdi: cfdiRecord, facturama_id: facturamaId, folio_fiscal: folioFiscal, pdf_url: pdfUrl, xml_url: xmlUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    try { await serviceDb.rpc("release_timbre", { p_reservation_id: reservationId, p_motivo: `Error en timbrar_global: ${(err as any)?.message || String(err)}` }); } catch {}
    throw err;
  }
}

// ========================================
// VALIDAR RFC con SAT (Facturama LCO)
// ========================================
async function validarRfc(body: any) {
  const auth = getAuth();
  const { rfc, name, zip_code, cliente_id } = body;
  if (!rfc) throw new Error("RFC requerido");

  // Endpoint Facturama: POST /api/Catalogs/ValidateRfc { Rfc, Name, ZipCode }
  // Si tu plan tiene otro path (Lco), ajusta. Probamos genérico primero.
  const payload: any = { Rfc: rfc.toUpperCase().trim() };
  if (name) payload.Name = name;
  if (zip_code) payload.ZipCode = zip_code;

  const res = await fetch(`${FACTURAMA_API}/api/Catalogs/ValidateRfc`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  let status = "no_encontrado";
  if (res.ok) {
    // Facturama típicamente devuelve { IsValid, RfcValid, NameValid, ZipCodeValid }
    if (data.IsValid || data.isValid) status = "valido";
    else if (data.RfcValid === false || data.rfcValid === false) status = "no_encontrado";
    else status = "inconsistencia";
  }

  // Cachear en clientes
  if (cliente_id) {
    const serviceDb = getServiceSupabase();
    await serviceDb.from("clientes").update({
      rfc_validado_at: new Date().toISOString(),
      rfc_validado_status: status,
      rfc_validado_detalle: data,
    }).eq("id", cliente_id);
  }

  return new Response(JSON.stringify({ success: true, status, detalle: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ========================================
// SUSTITUIR CFDI (timbra nuevo con relación 04, cancela el viejo)
// ========================================
async function sustituir(supabase: any, userId: string, body: any) {
  const { original_cfdi_id, original_uuid, rfc_emisor, new_invoice } = body;
  if (!original_uuid) throw new Error("UUID original requerido");

  // 1) Timbrar el nuevo CFDI con CfdiRelacionados tipo 04
  const newBody = {
    ...new_invoice,
    cfdi_relacionados: { Type: "04", Cfdis: [{ Uuid: original_uuid }] },
  };
  const timbrarRes = await timbrar(supabase, userId, newBody);
  const timbrarData = await timbrarRes.json();
  if (!timbrarData.success) throw new Error("Falló timbrado del CFDI sustituto");

  // 2) Cancelar el original con motivo 01 y folio sustituto
  const newUuid = timbrarData.folio_fiscal;
  try {
    const cancelUrl = `${FACTURAMA_API}/api-lite/cfdis/${(await supabase.from("cfdis").select("facturama_id").eq("id", original_cfdi_id).single()).data?.facturama_id}?motive=01&uuidReplacement=${newUuid}&rfc=${rfc_emisor}`;
    const r = await fetch(cancelUrl, { method: "DELETE", headers: { Authorization: getAuth() } });
    const txt = await r.text();
    let cancelResult: any = {};
    try { cancelResult = JSON.parse(txt); } catch {}
    const statusMap: Record<string, string> = { pending: "cancelacion_pendiente", rejected: "cancelacion_rechazada", canceled: "cancelado", accepted: "cancelado" };
    const newStatus = statusMap[cancelResult.Status] || "cancelacion_pendiente";
    await supabase.from("cfdis").update({
      status: newStatus,
      cancel_status: cancelResult.Status,
      cancel_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", original_cfdi_id);
  } catch (e: any) {
    console.error("Cancelación de CFDI original falló (sustitución parcial):", e?.message);
    return new Response(JSON.stringify({
      success: true, partial: true, cfdi_nuevo: timbrarData,
      warning: "CFDI nuevo timbrado, pero falló cancelar el original. Reintenta cancelación manual.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true, cfdi_nuevo: timbrarData }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ========================================
// ENVIAR CFDI POR CORREO
// ========================================
async function enviarCorreo(supabase: any, body: any) {
  const { cfdi_id, email_to, email_cc, mensaje } = body;
  if (!cfdi_id || !email_to) throw new Error("cfdi_id y email_to requeridos");

  const { data: cfdi, error } = await supabase.from("cfdis").select("*").eq("id", cfdi_id).single();
  if (error || !cfdi) throw new Error("CFDI no encontrado");

  const { data: emp } = await supabase.from("empresas").select("nombre").eq("id", cfdi.empresa_id).single();

  // Invocar send-transactional-email
  const invokeRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      templateName: "cfdi-envio",
      recipientEmail: email_to,
      idempotencyKey: `cfdi-${cfdi_id}-${Date.now()}`,
      templateData: {
        empresaNombre: emp?.nombre || "",
        folio: cfdi.folio || "",
        serie: cfdi.serie || "",
        uuid: cfdi.folio_fiscal || "",
        total: cfdi.total,
        pdfUrl: cfdi.pdf_url || "",
        xmlUrl: cfdi.xml_url || "",
        mensaje: mensaje || "",
        emailCc: email_cc || "",
      },
    }),
  });
  const invokeText = await invokeRes.text();
  if (!invokeRes.ok) throw new Error(`No se pudo encolar el correo: ${invokeText}`);

  await supabase.from("cfdis").update({
    enviado_at: new Date().toISOString(),
    enviado_a: email_to,
  }).eq("id", cfdi_id);

  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

