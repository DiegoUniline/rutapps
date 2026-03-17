import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Actions that don't require user auth
    if (action === "verificar_conexion") {
      return await verificarConexion();
    } else if (action === "list_csds") {
      return await listCsds();
    } else if (action === "upload_csd") {
      return await uploadCsd(body);
    } else if (action === "descargar") {
      return await descargar(body);
    }

    // Actions that require user auth
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    if (action === "timbrar") {
      return await timbrar(supabase, user.id, body);
    } else if (action === "cancelar") {
      return await cancelar(supabase, user.id, body);
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

  // Check timbre balance before proceeding
  const { data: saldoRow } = await serviceDb.from("timbres_saldo").select("saldo").eq("empresa_id", empresa_id).single();
  const saldoActual = saldoRow?.saldo ?? 0;
  if (saldoActual < 1) {
    throw new Error("No tienes timbres disponibles. Contacta al administrador para adquirir más timbres.");
  }

  // Auto-generate folio if not provided
  let folio = body.folio;
  if (!folio || folio.trim() === '') {
    folio = String(Date.now()).slice(-8);
  }

  // Build Facturama items with exact tax calculations
  const facItems: any[] = [];
  let totalFactura = 0;

  for (const item of items) {
    const unitPrice = r2(item.unit_price);
    const quantity = r6(item.quantity);
    const subtotal = r2(unitPrice * quantity);

    const facItem: any = {
      ProductCode: item.product_code || "01010101",
      Description: item.description,
      Unit: item.unit || "Pieza",
      UnitCode: item.unit_code || "H87",
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

    facItem.TaxObject = facItem.Taxes.length > 0 ? "02" : "01";
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
    for (const tax of fi.Taxes) {
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
