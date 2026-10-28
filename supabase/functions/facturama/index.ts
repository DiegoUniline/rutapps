import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppEmail } from "../_shared/app-email.ts";
import { validarCsd } from "../_shared/csd.ts";
import { itemFacturama, totalesCfdi, erroresLinea, type LineaCfdiInput } from "../_shared/cfdiImpuestos.ts";

const SUPER_ADMIN_EMAILS = ["diego.leon@uniline.mx", "ventas@uniline.mx"];
async function assertSuperAdmin(user: any) {
  const email = (user?.email || "").toLowerCase();
  if (!SUPER_ADMIN_EMAILS.includes(email)) throw new Error("Acceso restringido: solo super admin");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Ambiente Facturama POR EMPRESA (D-013): sandbox para pruebas sin gastar timbres
// reales; cada CFDI guarda el ambiente con que se timbró.
type Ambiente = "produccion" | "sandbox";
type Fac = { api: string; auth: string; ambiente: Ambiente };
function fac(ambiente?: string | null): Fac {
  const amb: Ambiente = ambiente === "sandbox" ? "sandbox" : "produccion";
  const user = Deno.env.get(amb === "sandbox" ? "FACTURAMA_SANDBOX_USERNAME" : "FACTURAMA_USERNAME");
  const pass = Deno.env.get(amb === "sandbox" ? "FACTURAMA_SANDBOX_PASSWORD" : "FACTURAMA_PASSWORD");
  if (!user || !pass) {
    throw new Error(amb === "sandbox"
      ? "Faltan las credenciales de Facturama sandbox (FACTURAMA_SANDBOX_USERNAME / FACTURAMA_SANDBOX_PASSWORD)"
      : "Credenciales de Facturama no configuradas");
  }
  return {
    api: amb === "sandbox" ? "https://apisandbox.facturama.mx" : "https://api.facturama.mx",
    auth: "Basic " + btoa(`${user}:${pass}`),
    ambiente: amb,
  };
}

type Emisor = { empresa_id: string; rfc: string; name: string; fiscal_regime: string; cp: string; fac: Fac };
/** Emisor SIEMPRE desde la BD (S-08): nunca se confía en el RFC/régimen que mande el navegador. */
async function getEmisor(admin: any, empresaId: string, ambiente?: string | null): Promise<Emisor> {
  const { data, error } = await admin.from("empresas")
    .select("id, rfc, razon_social, regimen_fiscal, cp, facturama_ambiente")
    .eq("id", empresaId).single();
  if (error || !data) throw new Error("Empresa no encontrada");
  const rfc = String(data.rfc || "").toUpperCase().trim();
  if (!rfc || !data.razon_social || !data.regimen_fiscal || !data.cp) {
    throw new Error("Completa los datos fiscales del emisor (RFC, razón social, régimen y CP) en Facturación › Configuración.");
  }
  return {
    empresa_id: data.id, rfc, name: data.razon_social, fiscal_regime: data.regimen_fiscal, cp: data.cp,
    fac: fac(ambiente ?? data.facturama_ambiente),
  };
}

/** Empresa sobre la que opera el usuario: la del body (validada) o la de su perfil. */
async function empresaDelUsuario(admin: any, userId: string, bodyEmpresaId?: string | null): Promise<string> {
  if (bodyEmpresaId) { await assertEmpresaAccess(admin, userId, bodyEmpresaId); return bodyEmpresaId; }
  const { data: prof } = await admin.from("profiles").select("empresa_id").eq("user_id", userId).single();
  if (!prof?.empresa_id) throw new Error("Usuario sin empresa");
  return prof.empresa_id;
}

async function assertPuedeConfigurar(admin: any, userId: string, empresaId: string) {
  const { data, error } = await admin.rpc("puede_configurar_facturacion", { p_user_id: userId, p_empresa_id: empresaId });
  if (error) throw new Error(`No se pudo validar el permiso: ${error.message}`);
  if (!data) throw new Error("No tienes permiso para configurar la facturación (Facturación CFDI · editar).");
}

// XML/PDF en bucket PRIVADO (S-12). En pdf_url/xml_url se guarda "storage:<bucket>/<ruta>";
// la app pide un enlace firmado temporal con la acción url_archivo.
const BUCKET_CFDI = "cfdi-archivos";
function archivoRef(path: string) { return `storage:${BUCKET_CFDI}/${path}`; }
async function urlFirmada(admin: any, ref: string | null, segundos: number): Promise<string | null> {
  if (!ref) return null;
  if (!ref.startsWith("storage:")) return ref; // archivos viejos (bucket público)
  const sinPrefijo = ref.slice("storage:".length);
  const bucket = sinPrefijo.split("/")[0];
  const path = sinPrefijo.slice(bucket.length + 1);
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, segundos);
  if (error) throw new Error(`No se pudo generar el enlace del archivo: ${error.message}`);
  return data?.signedUrl ?? null;
}

/** Pone en el body el emisor de la BD (pisa lo que haya mandado el navegador). */
function conEmisor(body: any, emisor: Emisor) {
  return {
    ...body,
    empresa_id: emisor.empresa_id,
    issuer: { rfc: emisor.rfc, name: emisor.name, fiscal_regime: emisor.fiscal_regime },
    expedition_place: emisor.cp,
    rfc_emisor: emisor.rfc,
    __fac: emisor.fac,
  };
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

    const admin = getServiceSupabase();

    if (action === "verificar_conexion") {
      const empresaId = await empresaDelUsuario(admin, user.id, body.empresa_id);
      const { data: emp } = await admin.from("empresas").select("facturama_ambiente").eq("id", empresaId).single();
      return await verificarConexion(fac(emp?.facturama_ambiente));
    } else if (action === "list_csds") {
      const empresaId = await empresaDelUsuario(admin, user.id, body.empresa_id);
      return await listCsds(admin, empresaId);
    } else if (action === "upload_csd") {
      const empresaId = await empresaDelUsuario(admin, user.id, body.empresa_id);
      await assertPuedeConfigurar(admin, user.id, empresaId);
      return await uploadCsd(admin, empresaId, body);
    } else if (action === "set_ambiente") {
      const empresaId = await empresaDelUsuario(admin, user.id, body.empresa_id);
      await assertPuedeConfigurar(admin, user.id, empresaId);
      return await setAmbiente(admin, empresaId, body.ambiente);
    } else if (action === "descargar") {
      // El documento (factura o complemento) debe ser de la empresa del usuario;
      // se descarga del mismo ambiente con que se timbró.
      const { data: prof } = await admin.from("profiles").select("empresa_id").eq("user_id", user.id).single();
      const { data: isSA } = await admin.rpc("is_super_admin", { p_user_id: user.id });
      const { data: cfdi } = await admin.from("cfdis").select("empresa_id, facturama_ambiente").eq("facturama_id", body.facturama_id).maybeSingle();
      const { data: pago } = cfdi ? { data: null } : await admin.from("cfdi_pagos").select("empresa_id, facturama_ambiente").eq("facturama_id", body.facturama_id).maybeSingle();
      const doc = cfdi ?? pago;
      if (!doc || (!isSA && doc.empresa_id !== prof?.empresa_id)) throw new Error("No autorizado");
      return await descargar({ ...body, __fac: fac(doc.facturama_ambiente) });
    } else if (action === "url_archivo") {
      const tabla = body.tabla === "cfdi_pagos" ? "cfdi_pagos" : "cfdis";
      const { data: doc } = await admin.from(tabla).select("empresa_id, pdf_url, xml_url").eq("id", body.id).maybeSingle();
      if (!doc) throw new Error("Documento no encontrado");
      await assertEmpresaAccess(admin, user.id, doc.empresa_id);
      const url = await urlFirmada(admin, body.tipo === "xml" ? doc.xml_url : doc.pdf_url, 300);
      if (!url) throw new Error("El documento no tiene archivo guardado");
      return new Response(JSON.stringify({ url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else if (action === "suscription_plan") {
      await assertSuperAdmin(user);
      return await getSuscriptionPlan(fac("produccion"));
    }

    if (action === "timbrar") {
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await timbrar(admin, user.id, conEmisor(body, await getEmisor(admin, body.empresa_id)));
    } else if (action === "preflight") {
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await preflight(admin, conEmisor(body, await getEmisor(admin, body.empresa_id)));
    } else if (action === "reconciliar") {
      return await reconciliar(admin, user.id, body);
    } else if (action === "set_serie") {
      const empresaId = await empresaDelUsuario(admin, user.id, body.empresa_id);
      await assertPuedeConfigurar(admin, user.id, empresaId);
      return await setSerie(admin, empresaId, body);
    } else if (action === "cancelar") {
      return await cancelar(admin, user.id, body);
    } else if (action === "timbrar_pago") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await timbrarPago(admin, user.id, conEmisor(body, await getEmisor(admin, body.empresa_id)));
    } else if (action === "timbrar_global") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await timbrarGlobal(admin, user.id, conEmisor(body, await getEmisor(admin, body.empresa_id)));
    } else if (action === "validar_rfc") {
      await assertSuperAdmin(user);
      const empresaId = await empresaDelUsuario(admin, user.id, body.empresa_id);
      const { data: emp } = await admin.from("empresas").select("facturama_ambiente").eq("id", empresaId).single();
      return await validarRfc({ ...body, __fac: fac(emp?.facturama_ambiente) });
    } else if (action === "sustituir") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      const emisor = await getEmisor(admin, body.empresa_id);
      return await sustituir(admin, user.id, { ...conEmisor(body, emisor), new_invoice: conEmisor(body.new_invoice ?? {}, emisor) });
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
async function verificarConexion(fx: Fac) {
  const res = await fetch(`${fx.api}/api-lite/cfdis?page=1&size=1`, {
    headers: { Authorization: fx.auth },
  });
  const ok = res.status === 200;
  return new Response(
    JSON.stringify({ ok, status: res.status, ambiente: fx.ambiente }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// UPLOAD CSD (Certificado de Sello Digital)
// ========================================
async function uploadCsd(admin: any, empresaId: string, body: any) {
  const { certificate_base64, private_key_base64, password } = body;
  if (!certificate_base64 || !private_key_base64 || !password) {
    throw new Error("Faltan campos: certificate_base64, private_key_base64, password");
  }
  // S-13: solo el CSD del RFC de la propia empresa.
  const emisor = await getEmisor(admin, empresaId);
  if (body.rfc && String(body.rfc).toUpperCase().trim() !== emisor.rfc) {
    throw new Error(`El RFC capturado no coincide con el RFC de la empresa (${emisor.rfc}).`);
  }
  const { noCertificado, vence } = validarCsd(emisor.rfc, certificate_base64, private_key_base64, password);
  const { api, auth } = emisor.fac;

  const payload = {
    Rfc: emisor.rfc,
    Certificate: certificate_base64,
    PrivateKey: private_key_base64,
    PrivateKeyPassword: password,
  };

  console.log(`📤 Subiendo CSD para RFC: ${payload.Rfc} (${emisor.fac.ambiente})`);

  // Try POST first (new), if 409/conflict try PUT (update)
  let response = await fetch(`${api}/api-lite/csds`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 409 || response.status === 400) {
    // CSD already exists, try update
    console.log("CSD ya existe, intentando actualizar...");
    response = await fetch(`${api}/api-lite/csds/${encodeURIComponent(payload.Rfc)}`, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  const content = await response.text();
  console.log(`📥 CSD response [${response.status}]`);

  if (response.status !== 200 && response.status !== 201 && response.status !== 204) {
    throw new Error(`Error al subir CSD: ${content}`);
  }

  const { error: updErr } = await admin.from("empresas")
    .update({ csd_no_certificado: noCertificado, csd_vence: vence.toISOString() }).eq("id", empresaId);
  if (updErr) console.error("No se guardó el número/vigencia del CSD:", updErr.message);

  return new Response(
    JSON.stringify({ success: true, message: "CSD subido correctamente a Facturama", no_certificado: noCertificado, vence: vence.toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// LIST CSDs — solo el de la propia empresa (S-13)
// ========================================
async function listCsds(admin: any, empresaId: string) {
  const emisor = await getEmisor(admin, empresaId);
  const res = await fetch(`${emisor.fac.api}/api-lite/csds`, {
    headers: { Authorization: emisor.fac.auth },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error al obtener CSDs: ${text}`);
  }

  const data = await res.json();
  const propios = (Array.isArray(data) ? data : []).filter((c: any) => String(c?.Rfc ?? "").toUpperCase().trim() === emisor.rfc);
  return new Response(
    JSON.stringify({ csds: propios, ambiente: emisor.fac.ambiente }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========================================
// AMBIENTE (producción / sandbox) de la empresa
// ========================================
async function setAmbiente(admin: any, empresaId: string, ambiente: string) {
  if (ambiente !== "produccion" && ambiente !== "sandbox") throw new Error("Ambiente inválido");
  fac(ambiente); // falla claro si faltan las credenciales de ese ambiente
  const { error } = await admin.from("empresas").update({ facturama_ambiente: ambiente }).eq("id", empresaId);
  if (error) throw new Error(`No se pudo cambiar el ambiente: ${error.message}`);
  return new Response(JSON.stringify({ success: true, ambiente }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ========================================
// TIMBRAR FACTURA DE VENTA (Fase 1, D-014)
// Validación previa → apartado atómico (líneas + serie/folio) → timbre → Facturama.
// Solo un rechazo explícito (4xx) libera; sin respuesta / 5xx / respuesta sin UUID queda
// "incierto" hasta Reconciliar, para no timbrar dos veces la misma venta.
// ========================================
const STALE_TIMBRANDO_MS = 5 * 60_000;
const MIN_ESPERA_LIBERAR_MS = 10 * 60_000;
const RFC_RE = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INCIERTO_MSG = 'No se pudo confirmar si Facturama timbró esta factura. Quedó como "Timbrado incierto": usa "Reconciliar" antes de volver a intentar.';

const PRODUCTO_SEL = "nombre, tiene_iva, ieps_tipo, cfdi_iva_sin_iva, codigo_sat, unidades_sat(clave, nombre)";
const VL_SEL = `id, venta_id, empresa_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, descuento_pct, iva_pct, ieps_pct, facturado, facturado_global, factura_cfdi_id, productos(${PRODUCTO_SEL})`;

type LineaTimbrar = LineaCfdiInput & { venta_linea_id: string | null; producto_id: string | null };
type Receptor = { rfc: string; name: string; cfdi_use: string; fiscal_regime: string; tax_zip_code: string };
type Preparado = {
  cfdi_id: string | null;
  doc: { status: string; facturama_id: string | null; payment_form: string; payment_method: string; cfdi_type: string; currency: string };
  receptor: Receptor;
  lineas: LineaTimbrar[];
  ocupadas: string[];
};
type Seccion = "emisor" | "receptor" | "documento" | "partidas";
type Preflight = { valido: boolean; secciones: Record<Seccion, string[]> };

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function impuestosProducto(p: any, ivaPct: any, iepsPct: any) {
  const iva = Number(ivaPct) || 0;
  return {
    tiene_iva: iva > 0 || p?.tiene_iva !== false,
    iva_pct: iva,
    ieps_pct: Number(iepsPct) || 0,
    ieps_tipo: (p?.ieps_tipo === "cuota" ? "cuota" : "porcentaje") as "cuota" | "porcentaje",
    iva_sin_iva: (p?.cfdi_iva_sin_iva ?? null) as LineaCfdiInput["iva_sin_iva"],
  };
}

/** Línea de venta → línea CFDI. El precio sale del subtotal guardado (antes del descuento). */
function lineaDesdeVenta(vl: any): LineaTimbrar {
  const p = vl.productos ?? {};
  const cantidad = Number(vl.cantidad) || 0;
  const subtotal = Number(vl.subtotal) || 0;
  const precio = cantidad > 0 && subtotal > 0 ? subtotal / cantidad : Number(vl.precio_unitario) || 0;
  return {
    venta_linea_id: vl.id,
    producto_id: vl.producto_id,
    descripcion: vl.descripcion || p.nombre || "Producto",
    product_code: String(p.codigo_sat || "").trim(),
    unit_code: String(p.unidades_sat?.clave || "").toUpperCase(),
    unit_name: p.unidades_sat?.nombre || "",
    cantidad,
    precio_unitario: precio,
    descuento: Math.round(subtotal * (Number(vl.descuento_pct) || 0)) / 100,
    ...impuestosProducto(p, vl.iva_pct, vl.ieps_pct),
  };
}

function lineaDesdeCfdi(cl: any): LineaTimbrar {
  return {
    venta_linea_id: cl.venta_linea_id ?? null,
    producto_id: cl.producto_id ?? null,
    descripcion: cl.descripcion || "Producto",
    product_code: String(cl.product_code || "").trim(),
    unit_code: String(cl.unit_code || "").toUpperCase(),
    unit_name: cl.unit_name || "",
    cantidad: Number(cl.cantidad) || 0,
    precio_unitario: Number(cl.precio_unitario) || 0,
    descuento: Number(cl.descuento) || 0,
    ...impuestosProducto(cl.productos, cl.iva_pct, cl.ieps_pct),
  };
}

function lineaLibre(vl: any) {
  return !vl.facturado && !vl.facturado_global && !vl.factura_cfdi_id;
}

/** Datos para facturar una venta completa (líneas aún sin facturar), sin escribir nada. */
async function prepararDesdeVenta(admin: any, empresaId: string, body: any): Promise<Preparado> {
  const { data: venta } = await admin.from("ventas")
    .select("id, clientes(facturama_rfc, facturama_razon_social, facturama_regimen_fiscal, facturama_uso_cfdi, facturama_cp)")
    .eq("id", body.venta_id).eq("empresa_id", empresaId).maybeSingle();
  if (!venta) throw new Error("Venta no encontrada");
  const { data: vls, error } = await admin.from("venta_lineas").select(VL_SEL)
    .eq("venta_id", venta.id).not("producto_id", "is", null);
  if (error) throw new Error(`No se pudieron leer las líneas de la venta: ${error.message}`);
  const c: any = venta.clientes ?? {};
  return {
    cfdi_id: null,
    doc: {
      status: "borrador", facturama_id: null,
      payment_form: body.payment_form || "01", payment_method: body.payment_method || "PUE",
      cfdi_type: "I", currency: "MXN",
    },
    receptor: {
      rfc: String(c.facturama_rfc || "").toUpperCase().trim(),
      name: String(c.facturama_razon_social || "").trim(),
      cfdi_use: body.receiver_cfdi_use || c.facturama_uso_cfdi || "",
      fiscal_regime: c.facturama_regimen_fiscal || "",
      tax_zip_code: String(c.facturama_cp || "").trim(),
    },
    lineas: (vls ?? []).filter(lineaLibre).map(lineaDesdeVenta),
    ocupadas: [],
  };
}

async function prepararDesdeCfdi(admin: any, empresaId: string, cfdiId: string): Promise<Preparado> {
  const { data: cfdi } = await admin.from("cfdis").select("*").eq("id", cfdiId).eq("empresa_id", empresaId).maybeSingle();
  if (!cfdi) throw new Error("CFDI no encontrado");
  const { data: cls, error } = await admin.from("cfdi_lineas")
    .select(`*, productos(${PRODUCTO_SEL}), venta_lineas(id, facturado, facturado_global, factura_cfdi_id)`)
    .eq("cfdi_id", cfdiId);
  if (error) throw new Error(`No se pudieron leer las líneas del CFDI: ${error.message}`);
  const ocupadas = (cls ?? []).filter((cl: any) => {
    const vl = cl.venta_lineas;
    return vl && (vl.facturado || vl.facturado_global || (vl.factura_cfdi_id && vl.factura_cfdi_id !== cfdiId));
  }).map((cl: any) => cl.descripcion || cl.id);
  return {
    cfdi_id: cfdiId,
    doc: {
      status: cfdi.status, facturama_id: cfdi.facturama_id,
      payment_form: cfdi.payment_form || "", payment_method: cfdi.payment_method || "",
      cfdi_type: cfdi.cfdi_type || "I", currency: cfdi.currency || "MXN",
    },
    receptor: {
      rfc: String(cfdi.receiver_rfc || "").toUpperCase().trim(),
      name: String(cfdi.receiver_name || "").trim(),
      cfdi_use: cfdi.receiver_cfdi_use || "",
      fiscal_regime: cfdi.receiver_fiscal_regime || "",
      tax_zip_code: String(cfdi.receiver_tax_zip_code || "").trim(),
    },
    lineas: (cls ?? []).map(lineaDesdeCfdi),
    ocupadas,
  };
}

/** Validación previa (nunca se llama a Facturama si falla). */
async function validarParaTimbrar(admin: any, fx: Fac, empresaId: string, prep: Preparado): Promise<Preflight> {
  const s: Record<Seccion, string[]> = { emisor: [], receptor: [], documento: [], partidas: [] };

  const { data: emp } = await admin.from("empresas")
    .select("rfc, razon_social, regimen_fiscal, cp, csd_no_certificado, csd_vence").eq("id", empresaId).single();
  const rfcEmisor = String(emp?.rfc || "").toUpperCase().trim();
  if (!RFC_RE.test(rfcEmisor)) s.emisor.push("El RFC del emisor no es válido.");
  if (!emp?.razon_social) s.emisor.push("Falta la razón social del emisor.");
  if (!emp?.regimen_fiscal) s.emisor.push("Falta el régimen fiscal del emisor.");
  if (!/^\d{5}$/.test(String(emp?.cp || ""))) s.emisor.push("Falta el código postal de expedición del emisor (5 dígitos).");
  if (emp?.csd_vence && new Date(emp.csd_vence).getTime() < Date.now()) {
    s.emisor.push("El certificado de sello digital (CSD) está vencido. Sube uno vigente.");
  } else if (!emp?.csd_no_certificado && RFC_RE.test(rfcEmisor)) {
    // CSD subido antes de la Fase 0: se confirma en Facturama.
    const r = await fetch(`${fx.api}/api-lite/csds/${rfcEmisor}`, { headers: { Authorization: fx.auth } }).catch(() => null);
    if (!r || !r.ok) s.emisor.push(`No hay CSD cargado en Facturama (${fx.ambiente}) para el RFC ${rfcEmisor}.`);
  }

  const rc = prep.receptor;
  const publico = rc.rfc === "XAXX010101000";
  if (!RFC_RE.test(rc.rfc)) s.receptor.push("El RFC del cliente no es válido (captúralo en la ficha del cliente › datos fiscales).");
  if (!rc.name) s.receptor.push("Falta la razón social fiscal del cliente.");
  if (!rc.fiscal_regime) s.receptor.push("Falta el régimen fiscal del cliente.");
  if (!/^\d{5}$/.test(rc.tax_zip_code)) s.receptor.push("Falta el código postal fiscal del cliente (5 dígitos).");
  if (!rc.cfdi_use) s.receptor.push("Falta el uso de CFDI.");
  if (publico && (rc.fiscal_regime !== "616" || rc.cfdi_use !== "S01")) {
    s.receptor.push('Para "Público en general" (XAXX010101000) el régimen debe ser 616 y el uso S01.');
  }

  const d = prep.doc;
  if (d.facturama_id) s.documento.push("Esta factura ya está timbrada.");
  else if (d.status === "incierto") s.documento.push('El último intento quedó incierto. Usa "Reconciliar" antes de volver a timbrar.');
  else if (d.status === "timbrando") s.documento.push("Hay un timbrado en curso para esta factura.");
  else if (!["borrador", "error"].includes(d.status)) s.documento.push(`La factura está en estado "${d.status}" y no se puede timbrar.`);
  if (!["PUE", "PPD"].includes(d.payment_method)) s.documento.push("Indica el método de pago (PUE o PPD).");
  if (!d.payment_form) s.documento.push("Indica la forma de pago.");
  if (d.payment_method === "PPD" && d.payment_form && d.payment_form !== "99") {
    s.documento.push('Una factura PPD solo puede llevar la forma de pago "99 - Por definir".');
  }
  if (d.payment_method === "PUE" && d.payment_form === "99") {
    s.documento.push('Una factura PUE no puede llevar la forma de pago "99 - Por definir".');
  }
  const { data: saldo } = await admin.from("timbres_saldo").select("saldo").eq("empresa_id", empresaId).maybeSingle();
  if (!(Number(saldo?.saldo) >= 1)) s.documento.push("No tienes timbres disponibles.");

  if (prep.lineas.length === 0) s.partidas.push("No hay conceptos pendientes de facturar.");
  for (const n of prep.ocupadas) s.partidas.push(`"${n}": la línea de venta ya está facturada o en otra factura en proceso.`);
  for (const l of prep.lineas) {
    for (const e of erroresLinea(l)) s.partidas.push(`"${l.descripcion}": ${e}.`);
  }
  if (prep.lineas.length > 0 && !(totalesCfdi(prep.lineas.map(itemFacturama)).total > 0)) {
    s.partidas.push("El total de la factura debe ser mayor que cero.");
  }

  return { valido: Object.values(s).every((x) => x.length === 0), secciones: s };
}

function resumenPreflight(p: Preflight) {
  return "No se puede timbrar:\n• " + Object.values(p.secciones).flat().join("\n• ");
}

async function preflight(admin: any, body: any) {
  const fx = body.__fac as Fac;
  const prep = body.cfdi_id
    ? await prepararDesdeCfdi(admin, body.empresa_id, body.cfdi_id)
    : await prepararDesdeVenta(admin, body.empresa_id, body);
  const val = await validarParaTimbrar(admin, fx, body.empresa_id, prep);
  const totales = prep.lineas.length ? totalesCfdi(prep.lineas.map(itemFacturama)) : null;
  return json({ ...val, receptor: prep.receptor, totales, lineas: prep.lineas.length });
}

/** Crea el borrador de la venta (líneas sin facturar) con los datos fiscales de la ficha del cliente. */
async function crearBorradorDeVenta(admin: any, userId: string, body: any, prep: Preparado): Promise<string> {
  const items = prep.lineas.map(itemFacturama);
  const t = totalesCfdi(items);
  const { data: cfdi, error } = await admin.from("cfdis").insert({
    empresa_id: body.empresa_id, venta_id: body.venta_id, status: "borrador", user_id: userId,
    receiver_rfc: prep.receptor.rfc, receiver_name: prep.receptor.name, receiver_cfdi_use: prep.receptor.cfdi_use,
    receiver_fiscal_regime: prep.receptor.fiscal_regime, receiver_tax_zip_code: prep.receptor.tax_zip_code,
    payment_form: prep.doc.payment_form, payment_method: prep.doc.payment_method, expedition_place: body.expedition_place,
    cfdi_type: "I", currency: "MXN",
    subtotal: t.subtotal, descuento_total: t.descuento, iva_total: t.iva, ieps_total: t.ieps, total: t.total,
  }).select("id").single();
  if (error || !cfdi) throw new Error(`No se pudo crear la factura: ${error?.message}`);
  const { error: linErr } = await admin.from("cfdi_lineas").insert(prep.lineas.map((l, i) => ({
    cfdi_id: cfdi.id, venta_linea_id: l.venta_linea_id, producto_id: l.producto_id, descripcion: l.descripcion,
    cantidad: l.cantidad, precio_unitario: items[i].UnitPrice, descuento: items[i].Discount ?? 0, subtotal: items[i].Subtotal,
    iva_pct: l.iva_pct, ieps_pct: l.ieps_pct,
    iva_monto: (items[i].Taxes ?? []).filter((x) => x.Name === "IVA").reduce((a, x) => a + x.Total, 0),
    ieps_monto: (items[i].Taxes ?? []).filter((x) => x.Name === "IEPS").reduce((a, x) => a + x.Total, 0),
    total: items[i].Total, product_code: l.product_code, unit_code: l.unit_code, unit_name: l.unit_name,
  })));
  if (linErr) {
    await admin.from("cfdis").delete().eq("id", cfdi.id);
    throw new Error(`No se pudieron guardar los conceptos: ${linErr.message}`);
  }
  return cfdi.id;
}

async function borrarBorrador(admin: any, cfdiId: string) {
  await admin.from("cfdi_lineas").delete().eq("cfdi_id", cfdiId);
  await admin.from("cfdis").delete().eq("id", cfdiId).eq("status", "borrador").is("facturama_id", null);
}

/** Rechazo seguro: suelta las líneas de venta, devuelve el timbre y regresa el CFDI a borrador con el error. */
async function liberarIntento(admin: any, cfdiId: string, reservaId: string | null, detalle: string) {
  const { error: vlErr } = await admin.from("venta_lineas").update({ factura_cfdi_id: null })
    .eq("factura_cfdi_id", cfdiId).or("facturado.is.null,facturado.eq.false");
  if (vlErr) console.error("liberarIntento venta_lineas:", vlErr.message);
  const { error } = await admin.from("cfdis").update({
    status: "borrador", error_detalle: detalle, timbre_reserva_id: null, stamping_started_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", cfdiId).is("facturama_id", null);
  if (error) console.error("liberarIntento cfdis:", error.message);
  if (reservaId) {
    const { error: rErr } = await admin.rpc("release_timbre", { p_reservation_id: reservaId, p_motivo: detalle.slice(0, 200) });
    if (rErr) console.error("release_timbre:", rErr.message);
  }
}

async function marcarIncierto(admin: any, cfdiId: string, detalle: string) {
  const { error } = await admin.from("cfdis").update({ status: "incierto", error_detalle: detalle, updated_at: new Date().toISOString() })
    .eq("id", cfdiId).is("facturama_id", null);
  if (error) console.error("marcarIncierto:", error.message);
}

function mensajeFacturama(content: string) {
  try {
    const j = JSON.parse(content);
    const extra = j?.ModelState ? Object.values(j.ModelState).flat().join(" · ") : "";
    return [j?.Message, extra].filter(Boolean).join(" — ") || content;
  } catch { return content; }
}

async function guardarArchivos(admin: any, fx: Fac, empresaId: string, facturamaId: string) {
  const out: { pdf_url: string | null; xml_url: string | null } = { pdf_url: null, xml_url: null };
  for (const tipo of ["pdf", "xml"] as const) {
    try {
      const r = await fetch(`${fx.api}/cfdi/${tipo}/issuedLite/${facturamaId}`, { headers: { Authorization: fx.auth } });
      if (!r.ok) continue;
      const data = await r.json();
      if (!data?.Content) continue;
      const bytes = tipo === "pdf"
        ? Uint8Array.from(atob(data.Content), (c) => c.charCodeAt(0))
        : new TextEncoder().encode(atob(data.Content));
      const path = `cfdis/${empresaId}/${facturamaId}_${Date.now()}.${tipo}`;
      const { error } = await admin.storage.from(BUCKET_CFDI)
        .upload(path, bytes, { contentType: tipo === "pdf" ? "application/pdf" : "application/xml", upsert: true });
      if (!error) out[`${tipo}_url`] = archivoRef(path);
      else console.error(`Subir ${tipo}:`, error.message);
    } catch (e: any) { console.error(`Descargar ${tipo}:`, e?.message); }
  }
  return out;
}

/** Guarda el CFDI timbrado (respuesta de Facturama), marca la venta facturada y confirma el timbre. */
async function guardarTimbrado(admin: any, fx: Fac, cfdiId: string, empresaId: string, reservaId: string | null, result: any) {
  const ts = result?.Complement?.TaxStamp ?? {};
  const archivos = await guardarArchivos(admin, fx, empresaId, result.Id);
  const { data, error } = await admin.from("cfdis").update({
    facturama_id: result.Id, folio_fiscal: ts.Uuid, status: "timbrado", facturama_ambiente: fx.ambiente,
    ...archivos,
    cadena_original: result.OriginalString || null, sello_cfdi: ts.CfdiSign || null, sello_sat: ts.SatSign || null,
    no_certificado_sat: ts.SatCertNumber || null, no_certificado_emisor: ts.NoCertificado || result.CertNumber || null,
    fecha_timbrado: ts.Date || null, error_detalle: null, timbre_reserva_id: null, updated_at: new Date().toISOString(),
  }).eq("id", cfdiId).is("facturama_id", null).select().maybeSingle();
  if (error || !data) return { ok: false as const, error: error?.message ?? "no se actualizó el CFDI" };
  // Solo las líneas apartadas por apartar_cfdi_timbrado (ya validó la empresa de la venta).
  const { error: vlErr } = await admin.from("venta_lineas").update({ facturado: true }).eq("factura_cfdi_id", cfdiId);
  if (vlErr) console.error("venta_lineas facturado:", vlErr.message);
  if (reservaId) {
    const { data: ok } = await admin.rpc("confirm_timbre_reserve", { p_reservation_id: reservaId, p_cfdi_id: cfdiId });
    if (!ok) console.error("confirm_timbre_reserve no confirmó la reserva", reservaId);
  }
  return { ok: true as const, cfdi: data };
}

async function timbrar(admin: any, userId: string, body: any) {
  const fx = body.__fac as Fac;
  const empresaId: string = body.empresa_id;

  let cfdiId: string | null = body.cfdi_id || null;
  let creado = false;
  if (!cfdiId) {
    if (!body.venta_id) throw new Error("Indica la venta o el borrador a timbrar");
    const prepVenta = await prepararDesdeVenta(admin, empresaId, body);
    const valVenta = await validarParaTimbrar(admin, fx, empresaId, prepVenta);
    if (!valVenta.valido) throw new Error(resumenPreflight(valVenta));
    cfdiId = await crearBorradorDeVenta(admin, userId, body, prepVenta);
    creado = true;
  }

  const prep = await prepararDesdeCfdi(admin, empresaId, cfdiId);
  const val = await validarParaTimbrar(admin, fx, empresaId, prep);
  if (!val.valido) {
    if (creado) await borrarBorrador(admin, cfdiId);
    throw new Error(resumenPreflight(val));
  }

  const { data: ap, error: apErr } = await admin.rpc("apartar_cfdi_timbrado", { p_cfdi_id: cfdiId });
  if (apErr || !ap) {
    if (creado) await borrarBorrador(admin, cfdiId);
    throw new Error(apErr?.message || "No se pudo apartar la factura");
  }

  const { data: reservaId, error: rErr } = await admin.rpc("reserve_timbre", { p_empresa_id: empresaId, p_user_id: userId });
  if (rErr || !reservaId) {
    const msg = rErr ? "No se pudo reservar el timbre. Intenta de nuevo." : "No tienes timbres disponibles.";
    await liberarIntento(admin, cfdiId, null, msg);
    throw new Error(msg);
  }

  let enviado = false;
  try {
    const items = prep.lineas.map(itemFacturama);
    const t = totalesCfdi(items);
    const { error: preErr } = await admin.from("cfdis").update({
      timbre_reserva_id: reservaId, facturama_ambiente: fx.ambiente, user_id: userId,
      expedition_place: body.expedition_place,
      subtotal: t.subtotal, descuento_total: t.descuento, iva_total: t.iva, ieps_total: t.ieps,
      retenciones_total: 0, total: t.total, updated_at: new Date().toISOString(),
    }).eq("id", cfdiId);
    if (preErr) throw new Error(`No se pudo preparar la factura: ${preErr.message}`);

    const invoiceData: any = {
      NameId: "1",
      Serie: ap.serie,
      Folio: ap.folio,
      CfdiType: prep.doc.cfdi_type,
      Currency: prep.doc.currency,
      PaymentForm: prep.doc.payment_form,
      PaymentMethod: prep.doc.payment_method,
      ExpeditionPlace: body.expedition_place,
      Issuer: { Rfc: body.issuer.rfc, Name: body.issuer.name, FiscalRegime: body.issuer.fiscal_regime },
      Receiver: {
        Rfc: prep.receptor.rfc, Name: prep.receptor.name, CfdiUse: prep.receptor.cfdi_use,
        FiscalRegime: prep.receptor.fiscal_regime, TaxZipCode: prep.receptor.tax_zip_code,
      },
      Items: items,
    };
    if (body.cfdi_relacionados) invoiceData.Relations = body.cfdi_relacionados;

    let response: Response;
    enviado = true;
    try {
      response = await fetch(`${fx.api}/api-lite/3/cfdis`, {
        method: "POST",
        headers: { Authorization: fx.auth, "Content-Type": "application/json" },
        body: JSON.stringify(invoiceData),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e: any) {
      await marcarIncierto(admin, cfdiId, `Sin respuesta de Facturama: ${e?.message || e}`);
      throw new Error(INCIERTO_MSG);
    }
    const content = await response.text();
    console.log(`📥 Facturama timbrar [${response.status}] cfdi ${cfdiId}`);

    if (response.status >= 400 && response.status < 500) {
      const msg = mensajeFacturama(content);
      await liberarIntento(admin, cfdiId, reservaId, `Facturama rechazó: ${msg}`);
      throw new Error(`Facturama rechazó la factura: ${msg}`);
    }
    let result: any = null;
    try { result = JSON.parse(content); } catch { /* respuesta no JSON: incierto */ }
    const uuid = result?.Complement?.TaxStamp?.Uuid;
    if (!response.ok || !result?.Id || !uuid) {
      await marcarIncierto(admin, cfdiId, `Respuesta de Facturama sin confirmar [HTTP ${response.status}]: ${content.slice(0, 500)}`);
      throw new Error(INCIERTO_MSG);
    }

    const g = await guardarTimbrado(admin, fx, cfdiId, empresaId, reservaId, result);
    if (!g.ok) {
      await marcarIncierto(admin, cfdiId, `Timbrado en Facturama (UUID ${uuid}, Id ${result.Id}) pero no se guardó: ${g.error}`);
      throw new Error(`El CFDI se timbró (UUID ${uuid}) pero no se pudo guardar. Usa "Reconciliar"; no vuelvas a timbrar.`);
    }
    return json({ success: true, cfdi: g.cfdi, facturama_id: result.Id, folio_fiscal: uuid, total: t.total });
  } catch (err: any) {
    // Error de código antes de llamar a Facturama: se libera. Después, ya quedó marcado arriba.
    if (!enviado) await liberarIntento(admin, cfdiId, reservaId, `Error antes de timbrar: ${err?.message || err}`);
    throw err;
  }
}

/** Resuelve un timbrado incierto buscando en Facturama por receptor + serie/folio + total + emisor. */
async function reconciliar(admin: any, userId: string, body: any) {
  const { data: cfdi } = await admin.from("cfdis")
    .select("id, empresa_id, status, facturama_id, stamping_started_at, receiver_rfc, serie, folio, total, timbre_reserva_id, facturama_ambiente")
    .eq("id", body.cfdi_id).maybeSingle();
  if (!cfdi) throw new Error("CFDI no encontrado");
  await assertEmpresaAccess(admin, userId, cfdi.empresa_id);
  if (cfdi.facturama_id) throw new Error("Esta factura ya está timbrada.");
  const inicio = cfdi.stamping_started_at ? new Date(cfdi.stamping_started_at).getTime() : 0;
  const atorado = cfdi.status === "timbrando" && Date.now() - inicio > STALE_TIMBRANDO_MS;
  if (cfdi.status !== "incierto" && !atorado) throw new Error("Esta factura no tiene un timbrado incierto que reconciliar.");

  const emisor = await getEmisor(admin, cfdi.empresa_id, cfdi.facturama_ambiente);
  const fx = emisor.fac;
  const params = new URLSearchParams({ type: "issuedLite", keyword: cfdi.receiver_rfc || "", status: "all" });
  const res = await fetch(`${fx.api}/Cfdi?${params}`, { headers: { Authorization: fx.auth } });
  if (!res.ok) throw new Error(`No se pudo consultar Facturama (HTTP ${res.status}). Intenta más tarde.`);
  const lista = await res.json().catch(() => []);
  const candidatos = (Array.isArray(lista) ? lista : []).filter((c: any) =>
    c?.Id &&
    String(c.Serie ?? "") === String(cfdi.serie ?? "") &&
    String(c.Folio ?? "") === String(cfdi.folio ?? "") &&
    (typeof c.Total !== "number" || Math.abs(c.Total - Number(cfdi.total)) <= 0.01)
  );

  const propios: any[] = [];
  for (const c of candidatos) {
    const { data: ligado } = await admin.from("cfdis").select("id").eq("facturama_id", c.Id).maybeSingle();
    if (ligado) continue;
    const r = await fetch(`${fx.api}/api-lite/cfdis/${c.Id}`, { headers: { Authorization: fx.auth } });
    if (!r.ok) continue;
    const full = await r.json().catch(() => null);
    if (String(full?.Issuer?.Rfc ?? "").toUpperCase() !== emisor.rfc) continue;
    propios.push({ ...full, Id: full?.Id ?? c.Id });
  }

  if (propios.length > 1) {
    throw new Error(`Hay ${propios.length} CFDI en Facturama con la serie/folio ${cfdi.serie}-${cfdi.folio}. Revísalo con soporte antes de continuar.`);
  }
  if (propios.length === 0) {
    if (Date.now() - inicio < MIN_ESPERA_LIBERAR_MS) {
      throw new Error("Facturama todavía no muestra esta factura. Espera unos minutos y vuelve a Reconciliar.");
    }
    await liberarIntento(admin, cfdi.id, cfdi.timbre_reserva_id, "Reconciliar: no se encontró en Facturama; se puede volver a timbrar.");
    return json({ success: true, resultado: "liberado" });
  }
  const full = propios[0];
  if (!full?.Complement?.TaxStamp?.Uuid) throw new Error("Facturama devolvió el CFDI sin UUID; intenta más tarde.");
  const g = await guardarTimbrado(admin, fx, cfdi.id, cfdi.empresa_id, cfdi.timbre_reserva_id, full);
  if (!g.ok) throw new Error(`No se pudo ligar el CFDI: ${g.error}`);
  return json({ success: true, resultado: "ligado", folio_fiscal: full.Complement.TaxStamp.Uuid });
}

/** Serie y siguiente folio de la empresa. No se permite bajar el folio debajo de uno ya timbrado. */
async function setSerie(admin: any, empresaId: string, body: any) {
  const serie = String(body.serie || "").trim().toUpperCase();
  const siguiente = Number(body.siguiente_folio);
  if (!/^[A-Z0-9]{1,25}$/.test(serie)) throw new Error("La serie solo puede tener letras y números (máx. 25).");
  if (!Number.isInteger(siguiente) || siguiente < 1) throw new Error("El siguiente folio debe ser un número entero mayor que cero.");
  const { data: usados } = await admin.from("cfdis").select("folio")
    .eq("empresa_id", empresaId).eq("serie", serie).not("facturama_id", "is", null);
  const max = Math.max(0, ...(usados ?? []).map((u: any) => Number(u.folio)).filter((n: number) => Number.isFinite(n)));
  if (siguiente <= max) throw new Error(`Ya se timbró el folio ${serie}-${max}; el siguiente debe ser mayor.`);
  const { error } = await admin.from("cfdi_series")
    .upsert({ empresa_id: empresaId, serie, siguiente_folio: siguiente, updated_at: new Date().toISOString() });
  if (error) throw new Error(`No se pudo guardar la serie: ${error.message}`);
  return json({ success: true, serie, siguiente_folio: siguiente });
}

/** Al quedar cancelado el CFDI, la venta vuelve a quedar libre para facturarse. */
async function liberarVentaDeCfdi(admin: any, cfdiId: string) {
  const { error } = await admin.from("venta_lineas").update({ facturado: false, factura_cfdi_id: null }).eq("factura_cfdi_id", cfdiId);
  if (error) console.error("liberarVentaDeCfdi:", error.message);
}


// ========================================
// CANCELAR CFDI
// ========================================
async function cancelar(supabase: any, userId: string, body: any) {
  const { cfdi_id, motivo } = body;

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
  // Emisor de la BD y el ambiente con que se timbró este CFDI.
  const emisor = await getEmisor(supabase, cfdi.empresa_id, cfdi.facturama_ambiente);
  const { auth, api: FACTURAMA_API } = emisor.fac;
  const rfc_emisor = emisor.rfc;


  const facturamaId = cfdi.facturama_id;
  if (!facturamaId) throw new Error("No hay ID de Facturama asociado");

  // Motivos SAT 01–04; el 01 exige el UUID del CFDI que lo sustituye (timbrado, de la misma empresa).
  const cancelMotivo = motivo || "02";
  if (!["01", "02", "03", "04"].includes(cancelMotivo)) throw new Error("Motivo de cancelación inválido");
  const uuidSustitucion = String(body.uuid_sustitucion || body.folio_sustitucion || "").trim().toLowerCase();
  if (cancelMotivo === "01") {
    if (!UUID_RE.test(uuidSustitucion)) throw new Error("Con el motivo 01 indica el UUID del CFDI que sustituye a este.");
    const { data: sust } = await supabase.from("cfdis").select("id, status")
      .eq("empresa_id", cfdi.empresa_id).ilike("folio_fiscal", uuidSustitucion).maybeSingle();
    if (!sust || sust.status !== "timbrado" || sust.id === cfdi.id) {
      throw new Error("El UUID que sustituye debe ser de una factura timbrada de esta empresa.");
    }
  }
  const qs = new URLSearchParams({ motive: cancelMotivo, rfc: rfc_emisor });
  if (cancelMotivo === "01") qs.set("uuidReplacement", uuidSustitucion);
  const cancelUrl = `${FACTURAMA_API}/api-lite/cfdis/${facturamaId}?${qs}`;

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
      cancel_motivo: cancelMotivo,
      cancel_uuid_sustitucion: cancelMotivo === "01" ? uuidSustitucion : null,
      cancel_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", cfdi_id);
  if (newStatus === "cancelado") await liberarVentaDeCfdi(supabase, cfdi_id);

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
  const { auth, api: FACTURAMA_API } = body.__fac as Fac;
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

async function getSuscriptionPlan(fx: Fac) {
  const res = await fetch(`${fx.api}/SuscriptionPlan`, {
    headers: { Authorization: fx.auth },
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
  const { auth, api: FACTURAMA_API, ambiente } = body.__fac as Fac;
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
        facturama_ambiente: ambiente,
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
          await supabase.storage.from(BUCKET_CFDI).upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
          pdfUrl = archivoRef(pdfPath);
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
          await supabase.storage.from(BUCKET_CFDI).upload(xmlPath, xmlBytes, { contentType: "application/xml", upsert: true });
          xmlUrl = archivoRef(xmlPath);
        }
      }
    } catch (e) { console.error("XML REP:", e); }

    const { data: pagoRecord, error: insertErr } = await supabase.from("cfdi_pagos").insert({
        facturama_ambiente: ambiente,
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
  const { auth, api: FACTURAMA_API, ambiente } = body.__fac as Fac;
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
          await supabase.storage.from(BUCKET_CFDI).upload(path, bytes, { contentType: "application/pdf", upsert: true });
          pdfUrl = archivoRef(path);
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
          await supabase.storage.from(BUCKET_CFDI).upload(path, bytes, { contentType: "application/xml", upsert: true });
          xmlUrl = archivoRef(path);
        }
      }
    } catch (e) { console.error(e); }

    const { data: cfdiRecord } = await supabase.from("cfdis").insert({
      facturama_ambiente: ambiente,
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
  const { auth, api: FACTURAMA_API } = body.__fac as Fac;
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
  const { auth, api: FACTURAMA_API } = body.__fac as Fac;
  if (!original_uuid) throw new Error("UUID original requerido");
  if (!new_invoice?.cfdi_id) throw new Error("Indica el borrador (cfdi_id) del CFDI sustituto");

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
    const cancelUrl = `${FACTURAMA_API}/api-lite/cfdis/${(await supabase.from("cfdis").select("facturama_id").eq("id", original_cfdi_id).eq("empresa_id", body.empresa_id).single()).data?.facturama_id}?motive=01&uuidReplacement=${newUuid}&rfc=${rfc_emisor}`;
    const r = await fetch(cancelUrl, { method: "DELETE", headers: { Authorization: auth } });
    const txt = await r.text();
    let cancelResult: any = {};
    try { cancelResult = JSON.parse(txt); } catch {}
    const statusMap: Record<string, string> = { pending: "cancelacion_pendiente", rejected: "cancelacion_rechazada", canceled: "cancelado", accepted: "cancelado" };
    const newStatus = statusMap[cancelResult.Status] || "cancelacion_pendiente";
    await supabase.from("cfdis").update({
      status: newStatus,
      cancel_status: cancelResult.Status,
      cancel_motivo: "01",
      cancel_uuid_sustitucion: newUuid,
      cancel_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", original_cfdi_id).eq("empresa_id", body.empresa_id);
    if (newStatus === "cancelado") await liberarVentaDeCfdi(supabase, original_cfdi_id);
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

  // Enviar el correo por la entrega de correo administrada
  const emailResult = await sendAppEmail("cfdi-envio", email_to, {
    idempotencyKey: `cfdi-${cfdi_id}-${Date.now()}`,
    templateData: {
      empresaNombre: emp?.nombre || "",
      folio: cfdi.folio || "",
      serie: cfdi.serie || "",
      uuid: cfdi.folio_fiscal || "",
      total: cfdi.total,
      pdfUrl: (await urlFirmada(getServiceSupabase(), cfdi.pdf_url, 7 * 24 * 3600)) || "",
      xmlUrl: (await urlFirmada(getServiceSupabase(), cfdi.xml_url, 7 * 24 * 3600)) || "",
      mensaje: mensaje || "",
      emailCc: email_cc || "",
    },
  });
  if (!emailResult.sent && emailResult.reason === "failed") {
    throw new Error(`No se pudo enviar el correo: ${emailResult.error}`);
  }

  await supabase.from("cfdis").update({
    enviado_at: new Date().toISOString(),
    enviado_a: email_to,
  }).eq("id", cfdi_id);

  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

