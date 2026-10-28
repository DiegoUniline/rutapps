import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppEmail } from "../_shared/app-email.ts";
import { validarCsd } from "../_shared/csd.ts";
import {
  itemFacturama, totalesCfdi, erroresLinea, agruparImpuestos, impuestosProporcionales, fechaLimiteRep, formaPagoSat,
  repartirAplicacion, type LineaCfdiInput, type FacturamaItem, type ImpuestoAgrupado,
} from "../_shared/cfdiImpuestos.ts";

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
    } else if (action === "rep_pendientes") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await repPendientes(admin, body.empresa_id);
    } else if (action === "rep_preparar") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return json(await prepararRep(admin, body.empresa_id, body.cobro_id, body.forma_pago));
    } else if (action === "timbrar_rep") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await timbrarRep(admin, user.id, body);
    } else if (action === "timbrar_global") {
      await assertSuperAdmin(user);
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await crearGlobal(admin, user.id, conEmisor(body, await getEmisor(admin, body.empresa_id)));
    } else if (action === "crear_borrador_venta") {
      await assertEmpresaAccess(admin, user.id, body.empresa_id);
      return await crearBorradorVenta(admin, user.id, conEmisor(body, await getEmisor(admin, body.empresa_id)));
    } else if (action === "crear_sustituto") {
      return await crearSustituto(admin, user.id, body);
    } else if (action === "validar_rfc") {
      await assertSuperAdmin(user);
      const empresaId = await empresaDelUsuario(admin, user.id, body.empresa_id);
      const { data: emp } = await admin.from("empresas").select("facturama_ambiente").eq("id", empresaId).single();
      return await validarRfc({ ...body, __fac: fac(emp?.facturama_ambiente) });
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
// TIMBRAR FACTURA (Fase 1 D-014, Fase 2 D-015)
// Validación previa → apartado atómico (CANTIDAD pendiente + serie/folio) → timbre → Facturama.
// Solo un rechazo explícito (4xx) libera; sin respuesta / 5xx / respuesta sin UUID queda
// "incierto" hasta Reconciliar, para no timbrar dos veces la misma venta.
// Una venta puede repartirse en varias facturas (por líneas o por cantidad).
// ========================================
const STALE_TIMBRANDO_MS = 5 * 60_000;
const MIN_ESPERA_LIBERAR_MS = 10 * 60_000;
const RFC_RE = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INCIERTO_MSG = 'No se pudo confirmar si Facturama timbró esta factura. Quedó como "Timbrado incierto": usa "Reconciliar" antes de volver a intentar.';
const INCIERTO_REP_MSG = 'No se pudo confirmar si Facturama timbró este complemento. Quedó como "Timbrado incierto": usa "Reconciliar" antes de volver a intentar.';
const OCUPA = ["timbrando", "incierto", "timbrado", "cancelacion_pendiente", "cancelacion_rechazada"];
const VIGENTE = ["timbrado", "cancelacion_pendiente", "cancelacion_rechazada"];
const PUBLICO = { rfc: "XAXX010101000", name: "PUBLICO EN GENERAL", cfdi_use: "S01", fiscal_regime: "616" };
const FORMAS_PAGO = ["01", "02", "03", "04", "05", "06", "08", "12", "13", "14", "15", "17", "23", "24", "25", "26", "27", "28", "29", "30", "31"];

const PRODUCTO_SEL = "nombre, tiene_iva, ieps_tipo, cfdi_iva_sin_iva, codigo_sat, unidades_sat(clave, nombre)";
const VL_SEL = `id, venta_id, empresa_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, descuento_pct, iva_pct, ieps_pct, facturado, facturado_global, factura_cfdi_id, productos(${PRODUCTO_SEL})`;

type LineaTimbrar = LineaCfdiInput & { venta_linea_id: string | null; producto_id: string | null; venta_id?: string | null };
type Receptor = { rfc: string; name: string; cfdi_use: string; fiscal_regime: string; tax_zip_code: string };
type Preparado = {
  cfdi_id: string | null;
  doc: {
    status: string; facturama_id: string | null; payment_form: string; payment_method: string; cfdi_type: string; currency: string;
    es_global: boolean; global_periodicidad: string | null; global_meses: string | null; global_anio: number | null;
    sustituye_cfdi_id: string | null;
  };
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

/** Línea de venta → línea CFDI por `cantidad` (parte de la línea). Precio del subtotal guardado
 *  (antes del descuento); descuento proporcional a la cantidad. */
function lineaDesdeVenta(vl: any, cantidad?: number): LineaTimbrar {
  const p = vl.productos ?? {};
  const vendida = Number(vl.cantidad) || 0;
  const qty = cantidad ?? vendida;
  const subtotal = Number(vl.subtotal) || 0;
  const precio = vendida > 0 && subtotal > 0 ? subtotal / vendida : Number(vl.precio_unitario) || 0;
  const descuentoTotal = subtotal * (Number(vl.descuento_pct) || 0) / 100;
  return {
    venta_linea_id: vl.id,
    venta_id: vl.venta_id,
    producto_id: vl.producto_id,
    descripcion: vl.descripcion || p.nombre || "Producto",
    product_code: String(p.codigo_sat || "").trim(),
    unit_code: String(p.unidades_sat?.clave || "").toUpperCase(),
    unit_name: p.unidades_sat?.nombre || "",
    cantidad: qty,
    precio_unitario: precio,
    descuento: vendida > 0 ? Math.round(descuentoTotal * (qty / vendida) * 100) / 100 : 0,
    ...impuestosProducto(p, vl.iva_pct, vl.ieps_pct),
  };
}

function lineaDesdeCfdi(cl: any): LineaTimbrar {
  return {
    venta_linea_id: cl.venta_linea_id ?? null,
    venta_id: cl.venta_lineas?.venta_id ?? null,
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

/** Cantidad ya ocupada por facturas (en proceso, inciertas o vigentes) de cada línea de venta,
 *  sin contar `excluir` (la propia factura y la que sustituye). Las marcas anteriores a la Fase 2
 *  sin factura vigente que las explique cuentan como línea completa. */
async function cantidadOcupada(admin: any, vls: any[], excluir: (string | null)[]): Promise<Map<string, number>> {
  const ids = vls.map((v) => v.id);
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data, error } = await admin.from("cfdi_lineas").select("venta_linea_id, cantidad, cfdi_id, cfdis!inner(status)")
    .in("venta_linea_id", ids);
  if (error) throw new Error(`No se pudo calcular lo ya facturado: ${error.message}`);
  const vigente = new Set<string>();
  for (const x of data ?? []) {
    const st = x.cfdis?.status;
    if (VIGENTE.includes(st)) vigente.add(x.venta_linea_id);
    if (!OCUPA.includes(st) || excluir.includes(x.cfdi_id)) continue;
    out.set(x.venta_linea_id, (out.get(x.venta_linea_id) ?? 0) + (Number(x.cantidad) || 0));
  }
  for (const v of vls) {
    if ((v.facturado || v.facturado_global) && !vigente.has(v.id)) out.set(v.id, Number(v.cantidad) || 0);
  }
  return out;
}

/** Datos para facturar lo pendiente de una venta (o cantidades elegidas), sin escribir nada. */
async function prepararDesdeVenta(admin: any, empresaId: string, body: any): Promise<Preparado> {
  const { data: venta } = await admin.from("ventas")
    .select("id, clientes(facturama_rfc, facturama_razon_social, facturama_regimen_fiscal, facturama_uso_cfdi, facturama_cp)")
    .eq("id", body.venta_id).eq("empresa_id", empresaId).maybeSingle();
  if (!venta) throw new Error("Venta no encontrada");
  const { data: vls, error } = await admin.from("venta_lineas").select(VL_SEL)
    .eq("venta_id", venta.id).not("producto_id", "is", null);
  if (error) throw new Error(`No se pudieron leer las líneas de la venta: ${error.message}`);
  const ocupada = await cantidadOcupada(admin, vls ?? [], []);
  const pedidas: Record<string, number> | null = body.cantidades && typeof body.cantidades === "object" ? body.cantidades : null;
  const lineas: LineaTimbrar[] = [];
  const excedidas: string[] = [];
  for (const vl of vls ?? []) {
    const disponible = Math.max(0, (Number(vl.cantidad) || 0) - (ocupada.get(vl.id) ?? 0));
    const qty = pedidas ? Number(pedidas[vl.id] ?? 0) : disponible;
    if (!(qty > 0)) continue;
    if (qty > disponible + 0.000001) excedidas.push(`"${vl.descripcion || vl.productos?.nombre}": solo quedan ${disponible} por facturar`);
    lineas.push(lineaDesdeVenta(vl, qty));
  }
  const c: any = venta.clientes ?? {};
  return {
    cfdi_id: null,
    doc: {
      status: "borrador", facturama_id: null,
      payment_form: body.payment_form || "01", payment_method: body.payment_method || "PUE",
      cfdi_type: "I", currency: "MXN",
      es_global: false, global_periodicidad: null, global_meses: null, global_anio: null, sustituye_cfdi_id: null,
    },
    receptor: {
      rfc: String(c.facturama_rfc || "").toUpperCase().trim(),
      name: String(c.facturama_razon_social || "").trim(),
      cfdi_use: body.receiver_cfdi_use || c.facturama_uso_cfdi || "",
      fiscal_regime: c.facturama_regimen_fiscal || "",
      tax_zip_code: String(c.facturama_cp || "").trim(),
    },
    lineas,
    ocupadas: excedidas,
  };
}

async function prepararDesdeCfdi(admin: any, empresaId: string, cfdiId: string): Promise<Preparado> {
  const { data: cfdi } = await admin.from("cfdis").select("*").eq("id", cfdiId).eq("empresa_id", empresaId).maybeSingle();
  if (!cfdi) throw new Error("CFDI no encontrado");
  const { data: cls, error } = await admin.from("cfdi_lineas")
    .select(`*, productos(${PRODUCTO_SEL}), venta_lineas(id, venta_id, cantidad, facturado, facturado_global)`)
    .eq("cfdi_id", cfdiId);
  if (error) throw new Error(`No se pudieron leer las líneas del CFDI: ${error.message}`);
  const vls = (cls ?? []).map((cl: any) => cl.venta_lineas).filter(Boolean);
  const ocupada = await cantidadOcupada(admin, vls, [cfdiId, cfdi.sustituye_cfdi_id]);
  const pedida = new Map<string, number>();
  for (const cl of cls ?? []) {
    if (cl.venta_linea_id) pedida.set(cl.venta_linea_id, (pedida.get(cl.venta_linea_id) ?? 0) + (Number(cl.cantidad) || 0));
  }
  const ocupadas: string[] = [];
  for (const vl of vls) {
    const disponible = Math.max(0, (Number(vl.cantidad) || 0) - (ocupada.get(vl.id) ?? 0));
    if ((pedida.get(vl.id) ?? 0) > disponible + 0.000001) {
      const cl = (cls ?? []).find((x: any) => x.venta_linea_id === vl.id);
      ocupadas.push(`"${cl?.descripcion || vl.id}": solo quedan ${disponible} por facturar`);
    }
  }
  const publico = cfdi.es_global;
  return {
    cfdi_id: cfdiId,
    doc: {
      status: cfdi.status, facturama_id: cfdi.facturama_id,
      payment_form: cfdi.payment_form || "", payment_method: cfdi.payment_method || "",
      cfdi_type: cfdi.cfdi_type || "I", currency: cfdi.currency || "MXN",
      es_global: !!cfdi.es_global, global_periodicidad: cfdi.global_periodicidad ?? null,
      global_meses: cfdi.global_meses ?? null, global_anio: cfdi.global_anio ?? null,
      sustituye_cfdi_id: cfdi.sustituye_cfdi_id ?? null,
    },
    receptor: {
      rfc: publico ? PUBLICO.rfc : String(cfdi.receiver_rfc || "").toUpperCase().trim(),
      name: publico ? PUBLICO.name : String(cfdi.receiver_name || "").trim(),
      cfdi_use: publico ? PUBLICO.cfdi_use : cfdi.receiver_cfdi_use || "",
      fiscal_regime: publico ? PUBLICO.fiscal_regime : cfdi.receiver_fiscal_regime || "",
      tax_zip_code: String(cfdi.receiver_tax_zip_code || "").trim(),
    },
    lineas: (cls ?? []).map(lineaDesdeCfdi),
    ocupadas,
  };
}

/** Conceptos que se mandan a Facturama. En la global: un concepto por venta y tratamiento de impuestos
 *  (01010101 / ACT, NoIdentificacion = folio de la venta). */
async function itemsParaTimbrar(admin: any, prep: Preparado): Promise<FacturamaItem[]> {
  if (!prep.doc.es_global) return prep.lineas.map(itemFacturama);
  const ventaIds = [...new Set(prep.lineas.map((l) => l.venta_id).filter(Boolean))] as string[];
  const { data: ventas } = ventaIds.length ? await admin.from("ventas").select("id, folio").in("id", ventaIds) : { data: [] };
  const folio = new Map((ventas ?? []).map((v: any) => [v.id, v.folio || String(v.id).slice(0, 8)]));
  const grupos = new Map<string, { venta_id: string; l: LineaCfdiInput }>();
  for (const l of prep.lineas) {
    const firma = `${l.venta_id}|${l.tiene_iva}|${l.iva_pct}|${l.ieps_pct}|${l.ieps_tipo}|${l.iva_sin_iva}`;
    const g = grupos.get(firma);
    const importe = l.precio_unitario * l.cantidad;
    const ieps = l.ieps_tipo === "cuota" ? l.ieps_pct * l.cantidad : l.ieps_pct;
    if (!g) {
      grupos.set(firma, { venta_id: String(l.venta_id), l: { ...l, descripcion: "Venta", product_code: "01010101", unit_code: "ACT", unit_name: "Actividad", cantidad: 1, precio_unitario: importe, ieps_pct: ieps } });
    } else {
      g.l.precio_unitario += importe;
      g.l.descuento += l.descuento;
      if (l.ieps_tipo === "cuota") g.l.ieps_pct += ieps;
    }
  }
  return [...grupos.values()].map(({ venta_id, l }) => ({ ...itemFacturama(l), IdentificationNumber: String(folio.get(venta_id) ?? "") }));
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
  const publico = rc.rfc === PUBLICO.rfc;
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
  if (d.es_global) {
    if (d.payment_method !== "PUE") s.documento.push("La factura global va en PUE.");
    if (!["01", "02", "03", "04", "05"].includes(String(d.global_periodicidad))) s.documento.push("Indica la periodicidad de la factura global.");
    const mes = Number(d.global_meses);
    const okMes = d.global_periodicidad === "05" ? mes >= 13 && mes <= 18 : mes >= 1 && mes <= 12;
    if (!okMes) s.documento.push(d.global_periodicidad === "05" ? "Para periodicidad bimestral el mes va de 13 a 18." : "Indica el mes de la factura global (01 a 12).");
    if (!(Number(d.global_anio) >= 2022)) s.documento.push("Indica el año de la factura global.");
  }
  if (d.sustituye_cfdi_id) {
    const { data: orig } = await admin.from("cfdis").select("status, folio_fiscal, empresa_id").eq("id", d.sustituye_cfdi_id).maybeSingle();
    if (!orig || orig.empresa_id !== empresaId || orig.status !== "timbrado" || !orig.folio_fiscal) {
      s.documento.push("La factura que se sustituye ya no está timbrada.");
    }
  }
  const { data: saldo } = await admin.from("timbres_saldo").select("saldo").eq("empresa_id", empresaId).maybeSingle();
  if (!(Number(saldo?.saldo) >= 1)) s.documento.push("No tienes timbres disponibles.");

  if (prep.lineas.length === 0) s.partidas.push("No hay conceptos pendientes de facturar.");
  for (const n of prep.ocupadas) s.partidas.push(`${n}.`);
  for (const l of prep.lineas) {
    for (const e of erroresLinea(l, { global: d.es_global })) s.partidas.push(`"${l.descripcion}": ${e}.`);
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
  const items = prep.lineas.map(itemFacturama);
  return json({
    ...val, receptor: prep.receptor,
    totales: items.length ? totalesCfdi(items) : null,
    conceptos: prep.lineas.map((l, i) => ({ descripcion: l.descripcion, cantidad: l.cantidad, total: items[i].Total })),
  });
}

/** Inserta un borrador con sus líneas (venta, global o sustituto). */
async function insertarBorrador(admin: any, cabecera: any, lineas: LineaTimbrar[]): Promise<string> {
  const items = lineas.map(itemFacturama);
  const t = totalesCfdi(items);
  const { data: cfdi, error } = await admin.from("cfdis").insert({
    ...cabecera, status: "borrador", cfdi_type: "I", currency: "MXN",
    subtotal: t.subtotal, descuento_total: t.descuento, iva_total: t.iva, ieps_total: t.ieps, total: t.total,
  }).select("id").single();
  if (error || !cfdi) throw new Error(`No se pudo crear la factura: ${error?.message}`);
  const { error: linErr } = await admin.from("cfdi_lineas").insert(lineas.map((l, i) => ({
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

/** Borrador de la venta (pendiente o cantidades elegidas) con los datos fiscales de la ficha del cliente. */
async function crearBorradorDeVenta(admin: any, userId: string, body: any, prep: Preparado): Promise<string> {
  return insertarBorrador(admin, {
    empresa_id: body.empresa_id, venta_id: body.venta_id, user_id: userId,
    receiver_rfc: prep.receptor.rfc, receiver_name: prep.receptor.name, receiver_cfdi_use: prep.receptor.cfdi_use,
    receiver_fiscal_regime: prep.receptor.fiscal_regime, receiver_tax_zip_code: prep.receptor.tax_zip_code,
    payment_form: prep.doc.payment_form, payment_method: prep.doc.payment_method, expedition_place: body.expedition_place,
  }, prep.lineas);
}

/** Borrador de la venta con las cantidades elegidas (Facturar desde la venta). Los datos que falten
 *  los marca la validación al timbrar. */
async function crearBorradorVenta(admin: any, userId: string, body: any) {
  const prep = await prepararDesdeVenta(admin, body.empresa_id, body);
  if (prep.ocupadas.length) throw new Error(prep.ocupadas.join("\n"));
  if (prep.lineas.length === 0) throw new Error("No hay cantidades pendientes de facturar en esta venta.");
  const cfdiId = await crearBorradorDeVenta(admin, userId, body, prep);
  return json({ success: true, cfdi_id: cfdiId });
}

async function borrarBorrador(admin: any, cfdiId: string) {
  await admin.from("cfdi_lineas").delete().eq("cfdi_id", cfdiId);
  await admin.from("cfdis").delete().eq("id", cfdiId).eq("status", "borrador").is("facturama_id", null);
}

/** Recalcula facturado / factura_cfdi_id / facturado_global de las líneas de venta del CFDI. */
async function recalcularVenta(admin: any, cfdiId: string) {
  const { error } = await admin.rpc("recalcular_facturacion_cfdi", { p_cfdi_id: cfdiId });
  if (error) console.error("recalcular_facturacion_cfdi:", error.message);
}

/** Rechazo seguro: regresa el CFDI a borrador con el error, devuelve el timbre y suelta la cantidad apartada. */
async function liberarIntento(admin: any, cfdiId: string, reservaId: string | null, detalle: string) {
  const { error } = await admin.from("cfdis").update({
    status: "borrador", error_detalle: detalle, timbre_reserva_id: null, stamping_started_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", cfdiId).is("facturama_id", null);
  if (error) console.error("liberarIntento cfdis:", error.message);
  await recalcularVenta(admin, cfdiId);
  if (reservaId) {
    const { error: rErr } = await admin.rpc("release_timbre", { p_reservation_id: reservaId, p_motivo: detalle.slice(0, 200) });
    if (rErr) console.error("release_timbre:", rErr.message);
  }
}

async function marcarIncierto(admin: any, tabla: "cfdis" | "cfdi_pagos", id: string, detalle: string) {
  const { error } = await admin.from(tabla).update({ status: "incierto", error_detalle: detalle, updated_at: new Date().toISOString() })
    .eq("id", id).is("facturama_id", null);
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

function sellos(result: any) {
  const ts = result?.Complement?.TaxStamp ?? {};
  return {
    facturama_id: result.Id, folio_fiscal: ts.Uuid, status: "timbrado",
    cadena_original: result.OriginalString || null, sello_cfdi: ts.CfdiSign || null, sello_sat: ts.SatSign || null,
    no_certificado_sat: ts.SatCertNumber || null, no_certificado_emisor: ts.NoCertificado || result.CertNumber || null,
    fecha_timbrado: ts.Date || null, error_detalle: null, timbre_reserva_id: null, updated_at: new Date().toISOString(),
  };
}

/** Guarda el CFDI timbrado, recalcula la venta y confirma el timbre. */
async function guardarTimbrado(admin: any, fx: Fac, cfdiId: string, empresaId: string, reservaId: string | null, result: any, items: FacturamaItem[]) {
  const archivos = await guardarArchivos(admin, fx, empresaId, result.Id);
  const { data, error } = await admin.from("cfdis").update({
    ...sellos(result), facturama_ambiente: fx.ambiente, ...archivos, impuestos_detalle: agruparImpuestos(items),
  }).eq("id", cfdiId).is("facturama_id", null).select().maybeSingle();
  if (error || !data) return { ok: false as const, error: error?.message ?? "no se actualizó el CFDI" };
  await recalcularVenta(admin, cfdiId);
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
  return await timbrarCfdi(admin, userId, body, cfdiId, creado);
}

async function timbrarCfdi(admin: any, userId: string, body: any, cfdiId: string, creado: boolean) {
  const fx = body.__fac as Fac;
  const empresaId: string = body.empresa_id;
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
    const items = await itemsParaTimbrar(admin, prep);
    const t = totalesCfdi(items);
    const expedicion = body.expedition_place;
    const { error: preErr } = await admin.from("cfdis").update({
      timbre_reserva_id: reservaId, facturama_ambiente: fx.ambiente, user_id: userId, expedition_place: expedicion,
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
      ExpeditionPlace: expedicion,
      Issuer: { Rfc: body.issuer.rfc, Name: body.issuer.name, FiscalRegime: body.issuer.fiscal_regime },
      Receiver: {
        Rfc: prep.receptor.rfc, Name: prep.receptor.name, CfdiUse: prep.receptor.cfdi_use,
        FiscalRegime: prep.receptor.fiscal_regime,
        TaxZipCode: prep.doc.es_global ? expedicion : prep.receptor.tax_zip_code,
      },
      Items: items,
    };
    if (prep.doc.es_global) {
      invoiceData.GlobalInformation = {
        Periodicity: prep.doc.global_periodicidad, Months: prep.doc.global_meses, Year: prep.doc.global_anio,
      };
    }
    let original: any = null;
    if (prep.doc.sustituye_cfdi_id) {
      const { data } = await admin.from("cfdis").select("id, folio_fiscal").eq("id", prep.doc.sustituye_cfdi_id).single();
      original = data;
      invoiceData.Relations = { Type: "04", Cfdis: [{ Uuid: original.folio_fiscal }] };
    }

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
      await marcarIncierto(admin, "cfdis", cfdiId, `Sin respuesta de Facturama: ${e?.message || e}`);
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
      await marcarIncierto(admin, "cfdis", cfdiId, `Respuesta de Facturama sin confirmar [HTTP ${response.status}]: ${content.slice(0, 500)}`);
      throw new Error(INCIERTO_MSG);
    }

    const g = await guardarTimbrado(admin, fx, cfdiId, empresaId, reservaId, result, items);
    if (!g.ok) {
      await marcarIncierto(admin, "cfdis", cfdiId, `Timbrado en Facturama (UUID ${uuid}, Id ${result.Id}) pero no se guardó: ${g.error}`);
      throw new Error(`El CFDI se timbró (UUID ${uuid}) pero no se pudo guardar. Usa "Reconciliar"; no vuelvas a timbrar.`);
    }

    // Sustitución: ya timbrada la nueva, se cancela la original con motivo 01.
    let cancelacionOriginal: any = undefined;
    if (original) {
      try {
        const st = await cancelarCfdi(admin, original.id, "01", uuid);
        cancelacionOriginal = { ok: true, status: st.status };
      } catch (e: any) {
        cancelacionOriginal = { ok: false, error: e?.message || String(e) };
      }
    }
    return json({ success: true, cfdi: g.cfdi, facturama_id: result.Id, folio_fiscal: uuid, total: t.total, cancelacion_original: cancelacionOriginal });
  } catch (err: any) {
    // Error de código antes de llamar a Facturama: se libera. Después, ya quedó marcado arriba.
    if (!enviado) await liberarIntento(admin, cfdiId, reservaId, `Error antes de timbrar: ${err?.message || err}`);
    throw err;
  }
}

/** Busca en Facturama un CFDI emitido por la empresa a `rfcReceptor` con esa serie/folio (y total, si se da),
 *  que no esté ligado a ningún registro. */
async function buscarEnFacturama(admin: any, emisor: Emisor, rfcReceptor: string, serie: string, folio: string, total: number | null) {
  const fx = emisor.fac;
  const params = new URLSearchParams({ type: "issuedLite", keyword: rfcReceptor || "", status: "all" });
  const res = await fetch(`${fx.api}/Cfdi?${params}`, { headers: { Authorization: fx.auth } });
  if (!res.ok) throw new Error(`No se pudo consultar Facturama (HTTP ${res.status}). Intenta más tarde.`);
  const lista = await res.json().catch(() => []);
  const candidatos = (Array.isArray(lista) ? lista : []).filter((c: any) =>
    c?.Id && String(c.Serie ?? "") === String(serie ?? "") && String(c.Folio ?? "") === String(folio ?? "") &&
    (total === null || typeof c.Total !== "number" || Math.abs(c.Total - total) <= 0.01)
  );
  const propios: any[] = [];
  for (const c of candidatos) {
    const { data: l1 } = await admin.from("cfdis").select("id").eq("facturama_id", c.Id).maybeSingle();
    const { data: l2 } = await admin.from("cfdi_pagos").select("id").eq("facturama_id", c.Id).maybeSingle();
    if (l1 || l2) continue;
    const r = await fetch(`${fx.api}/api-lite/cfdis/${c.Id}`, { headers: { Authorization: fx.auth } });
    if (!r.ok) continue;
    const full = await r.json().catch(() => null);
    if (String(full?.Issuer?.Rfc ?? "").toUpperCase() !== emisor.rfc) continue;
    propios.push({ ...full, Id: full?.Id ?? c.Id });
  }
  return propios;
}

/** Resuelve un timbrado incierto (factura o complemento de pago). */
async function reconciliar(admin: any, userId: string, body: any) {
  const esRep = body.tabla === "cfdi_pagos";
  const tabla = esRep ? "cfdi_pagos" : "cfdis";
  const { data: doc } = await admin.from(tabla)
    .select("id, empresa_id, status, facturama_id, stamping_started_at, receiver_rfc, serie, folio, timbre_reserva_id, facturama_ambiente" + (esRep ? "" : ", total"))
    .eq("id", body.id ?? body.cfdi_id).maybeSingle();
  if (!doc) throw new Error("Documento no encontrado");
  await assertEmpresaAccess(admin, userId, doc.empresa_id);
  if (doc.facturama_id) throw new Error("Este documento ya está timbrado.");
  const inicio = doc.stamping_started_at ? new Date(doc.stamping_started_at).getTime() : 0;
  const atorado = doc.status === "timbrando" && Date.now() - inicio > STALE_TIMBRANDO_MS;
  if (doc.status !== "incierto" && !atorado) throw new Error("Este documento no tiene un timbrado incierto que reconciliar.");

  const emisor = await getEmisor(admin, doc.empresa_id, doc.facturama_ambiente);
  const propios = await buscarEnFacturama(admin, emisor, doc.receiver_rfc, doc.serie, doc.folio, esRep ? null : Number(doc.total));
  if (propios.length > 1) {
    throw new Error(`Hay ${propios.length} CFDI en Facturama con la serie/folio ${doc.serie}-${doc.folio}. Revísalo con soporte antes de continuar.`);
  }
  if (propios.length === 0) {
    if (Date.now() - inicio < MIN_ESPERA_LIBERAR_MS) {
      throw new Error("Facturama todavía no muestra este documento. Espera unos minutos y vuelve a Reconciliar.");
    }
    const detalle = "Reconciliar: no se encontró en Facturama; se puede volver a timbrar.";
    if (esRep) await liberarRep(admin, doc.id, doc.timbre_reserva_id, detalle);
    else await liberarIntento(admin, doc.id, doc.timbre_reserva_id, detalle);
    return json({ success: true, resultado: "liberado" });
  }
  const full = propios[0];
  const uuid = full?.Complement?.TaxStamp?.Uuid;
  if (!uuid) throw new Error("Facturama devolvió el CFDI sin UUID; intenta más tarde.");
  if (esRep) {
    const g = await guardarRepTimbrado(admin, emisor.fac, doc.id, doc.empresa_id, doc.timbre_reserva_id, full);
    if (!g.ok) throw new Error(`No se pudo ligar el complemento: ${g.error}`);
  } else {
    const prep = await prepararDesdeCfdi(admin, doc.empresa_id, doc.id);
    const items = await itemsParaTimbrar(admin, prep);
    const g = await guardarTimbrado(admin, emisor.fac, doc.id, doc.empresa_id, doc.timbre_reserva_id, full, items);
    if (!g.ok) throw new Error(`No se pudo ligar el CFDI: ${g.error}`);
  }
  return json({ success: true, resultado: "ligado", folio_fiscal: uuid });
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

// ========================================
// FACTURA GLOBAL (público en general, D-015): ventas elegidas a mano, sin ninguna factura.
// ========================================
async function crearGlobal(admin: any, userId: string, body: any) {
  const ventaIds: string[] = Array.isArray(body.venta_ids) ? [...new Set(body.venta_ids as string[])] : [];
  if (ventaIds.length === 0) throw new Error("Elige al menos una venta");
  if (!body.payment_form || body.payment_form === "99") throw new Error("Indica la forma de pago (no puede ser 99)");
  const { data: ventas } = await admin.from("ventas").select("id").eq("empresa_id", body.empresa_id).in("id", ventaIds);
  if ((ventas ?? []).length !== ventaIds.length) throw new Error("Alguna venta no es de esta empresa");
  const { data: vls, error } = await admin.from("venta_lineas").select(VL_SEL).in("venta_id", ventaIds).not("producto_id", "is", null);
  if (error) throw new Error(`No se pudieron leer las ventas: ${error.message}`);
  const ocupada = await cantidadOcupada(admin, vls ?? [], []);
  const conFactura = new Set((vls ?? []).filter((v: any) => (ocupada.get(v.id) ?? 0) > 0).map((v: any) => v.venta_id));
  if (conFactura.size > 0) throw new Error(`${conFactura.size} venta(s) ya tienen factura; quítalas de la global.`);
  const cfdiId = await insertarBorrador(admin, {
    empresa_id: body.empresa_id, venta_id: null, user_id: userId, es_global: true,
    global_periodicidad: String(body.periodicidad || ""), global_meses: String(body.meses || "").padStart(2, "0"),
    global_anio: Number(body.anio) || null,
    receiver_rfc: PUBLICO.rfc, receiver_name: PUBLICO.name, receiver_cfdi_use: PUBLICO.cfdi_use,
    receiver_fiscal_regime: PUBLICO.fiscal_regime, receiver_tax_zip_code: body.expedition_place,
    payment_form: body.payment_form, payment_method: "PUE", expedition_place: body.expedition_place,
  }, (vls ?? []).map((vl: any) => lineaDesdeVenta(vl)));
  return await timbrarCfdi(admin, userId, body, cfdiId, true);
}

// ========================================
// SUSTITUCIÓN (D-015): borrador con las mismas cantidades; al timbrarse (relación 04) cancela la original (01).
// ========================================
async function crearSustituto(admin: any, userId: string, body: any) {
  const { data: orig } = await admin.from("cfdis").select("*").eq("id", body.cfdi_id).maybeSingle();
  if (!orig) throw new Error("CFDI no encontrado");
  await assertEmpresaAccess(admin, userId, orig.empresa_id);
  if (orig.status !== "timbrado" || !orig.folio_fiscal) throw new Error("Solo se sustituye una factura timbrada y vigente.");
  const { data: ya } = await admin.from("cfdis").select("id").eq("sustituye_cfdi_id", orig.id).in("status", ["borrador", ...OCUPA]).maybeSingle();
  if (ya) return json({ success: true, cfdi_id: ya.id, existente: true });
  const { data: cls, error } = await admin.from("cfdi_lineas").select("*").eq("cfdi_id", orig.id);
  if (error) throw new Error(`No se pudieron leer los conceptos: ${error.message}`);
  const { data: nuevo, error: insErr } = await admin.from("cfdis").insert({
    empresa_id: orig.empresa_id, venta_id: orig.venta_id, user_id: userId, status: "borrador", sustituye_cfdi_id: orig.id,
    receiver_rfc: orig.receiver_rfc, receiver_name: orig.receiver_name, receiver_cfdi_use: orig.receiver_cfdi_use,
    receiver_fiscal_regime: orig.receiver_fiscal_regime, receiver_tax_zip_code: orig.receiver_tax_zip_code,
    payment_form: orig.payment_form, payment_method: orig.payment_method, expedition_place: orig.expedition_place,
    cfdi_type: orig.cfdi_type, currency: orig.currency,
    es_global: orig.es_global, global_periodicidad: orig.global_periodicidad, global_meses: orig.global_meses, global_anio: orig.global_anio,
    subtotal: orig.subtotal, descuento_total: orig.descuento_total, iva_total: orig.iva_total, ieps_total: orig.ieps_total, total: orig.total,
  }).select("id").single();
  if (insErr || !nuevo) throw new Error(`No se pudo crear el sustituto: ${insErr?.message}`);
  const copia = (cls ?? []).map(({ id: _id, cfdi_id: _c, created_at: _ca, ...resto }: any) => ({ ...resto, cfdi_id: nuevo.id }));
  if (copia.length) {
    const { error: linErr } = await admin.from("cfdi_lineas").insert(copia);
    if (linErr) {
      await admin.from("cfdis").delete().eq("id", nuevo.id);
      throw new Error(`No se pudieron copiar los conceptos: ${linErr.message}`);
    }
  }
  return json({ success: true, cfdi_id: nuevo.id });
}

// ========================================
// COMPLEMENTO DE PAGO (REP, Pagos 2.0, D-015)
// Cada cobro aplicado a una venta se reparte entre sus facturas PPD timbradas en proporción a su
// importe en la venta. Parcialidad y saldos según los REP vigentes anteriores; impuestos del
// documento en proporción a lo pagado.
// ========================================
type DocRep = {
  cfdi_id: string; venta_id: string | null; uuid: string; serie: string | null; folio: string | null;
  num_parcialidad: number; imp_saldo_ant: number; imp_pagado: number; imp_saldo_insoluto: number;
  objeto_imp: string; iva: number; impuestos: any[];
};

/** Facturas PPD timbradas que tocan las ventas, con su importe por venta. */
async function facturasPpdDeVentas(admin: any, empresaId: string, ventaIds: string[]) {
  const porVenta = new Map<string, { cfdi_id: string; importe: number }[]>();
  const cfdis = new Map<string, any>();
  if (ventaIds.length === 0) return { porVenta, cfdis };
  const { data: vls } = await admin.from("venta_lineas").select("id, venta_id").in("venta_id", ventaIds);
  const ventaDeLinea = new Map((vls ?? []).map((v: any) => [v.id, v.venta_id]));
  const ids = [...ventaDeLinea.keys()];
  if (ids.length === 0) return { porVenta, cfdis };
  const { data: cls, error } = await admin.from("cfdi_lineas")
    .select("venta_linea_id, total, cfdi_id, cfdis!inner(id, empresa_id, status, payment_method, folio_fiscal, serie, folio, total, fecha_timbrado, receiver_rfc, receiver_name, receiver_fiscal_regime, receiver_tax_zip_code, facturama_ambiente, impuestos_detalle)")
    .in("venta_linea_id", ids).eq("cfdis.payment_method", "PPD").eq("cfdis.status", "timbrado").eq("cfdis.empresa_id", empresaId);
  if (error) throw new Error(`No se pudieron leer las facturas PPD: ${error.message}`);
  const acum = new Map<string, number>();
  for (const cl of cls ?? []) {
    const v = ventaDeLinea.get(cl.venta_linea_id) as string;
    cfdis.set(cl.cfdi_id, cl.cfdis);
    const k = `${v}|${cl.cfdi_id}`;
    acum.set(k, (acum.get(k) ?? 0) + (Number(cl.total) || 0));
  }
  for (const [k, importe] of acum) {
    const [v, c] = k.split("|");
    if (!porVenta.has(v)) porVenta.set(v, []);
    porVenta.get(v)!.push({ cfdi_id: c, importe });
  }
  return { porVenta, cfdis };
}

async function prepararRep(admin: any, empresaId: string, cobroId: string, formaPago?: string | null) {
  const errores: string[] = [];
  const { data: cobro } = await admin.from("cobros")
    .select("id, empresa_id, cliente_id, fecha, metodo_pago, monto, status, created_at, clientes(nombre)")
    .eq("id", cobroId).eq("empresa_id", empresaId).maybeSingle();
  if (!cobro) throw new Error("Cobro no encontrado");
  if (cobro.status === "cancelado") errores.push("El cobro está cancelado.");
  const { data: apps } = await admin.from("cobro_aplicaciones").select("venta_id, monto_aplicado").eq("cobro_id", cobroId);
  const ventaIds = [...new Set((apps ?? []).map((a: any) => a.venta_id).filter(Boolean))] as string[];
  const { data: ventas } = ventaIds.length ? await admin.from("ventas").select("id, total").in("id", ventaIds) : { data: [] };
  const totalVenta = new Map<string, number>((ventas ?? []).map((v: any) => [v.id, Number(v.total) || 0]));
  const { porVenta, cfdis } = await facturasPpdDeVentas(admin, empresaId, ventaIds);

  // Reparto del cobro entre facturas PPD
  const pagadoPorCfdi = new Map<string, number>();
  const ventaDeCfdi = new Map<string, string>();
  for (const a of apps ?? []) {
    const partes = porVenta.get(a.venta_id) ?? [];
    for (const p of repartirAplicacion(Number(a.monto_aplicado) || 0, totalVenta.get(a.venta_id) ?? 0, partes)) {
      if (p.pagado <= 0) continue;
      pagadoPorCfdi.set(p.cfdi_id, (pagadoPorCfdi.get(p.cfdi_id) ?? 0) + p.pagado);
      ventaDeCfdi.set(p.cfdi_id, a.venta_id);
    }
  }
  const cfdiIds = [...pagadoPorCfdi.keys()];
  if (cfdiIds.length === 0) errores.push("Este cobro no está aplicado a ventas con factura PPD timbrada.");

  // REP vigentes anteriores de esas facturas
  const { data: previos } = cfdiIds.length ? await admin.from("cfdi_pago_documentos")
    .select("cfdi_id, imp_pagado, cfdi_pagos!inner(id, status, cobro_id)")
    .in("cfdi_id", cfdiIds).in("cfdi_pagos.status", OCUPA) : { data: [] };
  const previosDe = (id: string) => (previos ?? []).filter((x: any) => x.cfdi_id === id && x.cfdi_pagos?.cobro_id !== cobroId);

  // Cadena: los cobros anteriores (posteriores a la factura) a las mismas ventas deben tener su REP antes.
  if (ventaIds.length) {
    const { data: otras } = await admin.from("cobro_aplicaciones")
      .select("cobro_id, venta_id, cobros!inner(id, fecha, created_at, status)").in("venta_id", ventaIds).neq("cobro_id", cobroId);
    const anteriores = (otras ?? []).filter((o: any) => o.cobros?.status !== "cancelado" && (
      o.cobros.fecha < cobro.fecha || (o.cobros.fecha === cobro.fecha && o.cobros.created_at < cobro.created_at)));
    const relevantes = anteriores.filter((o: any) => (porVenta.get(o.venta_id) ?? []).some((p) => {
      const f = cfdis.get(p.cfdi_id)?.fecha_timbrado;
      return !f || String(o.cobros.fecha) >= String(f).slice(0, 10);
    }));
    const ids = [...new Set(relevantes.map((o: any) => o.cobro_id))];
    if (ids.length) {
      const { data: conRep } = await admin.from("cfdi_pagos").select("cobro_id").in("cobro_id", ids).in("status", VIGENTE);
      const ok = new Set((conRep ?? []).map((x: any) => x.cobro_id));
      const faltan = ids.filter((id) => !ok.has(id));
      if (faltan.length) errores.push(`Primero timbra el complemento de ${faltan.length} cobro(s) anterior(es) a estas facturas.`);
    }
  }

  const documentos: DocRep[] = [];
  let receptor: any = null;
  let ambiente: string | null = null;
  for (const id of cfdiIds) {
    const c = cfdis.get(id);
    const total = Number(c.total) || 0;
    const prev = previosDe(id);
    const pagadoAntes = prev.reduce((s: number, x: any) => s + (Number(x.imp_pagado) || 0), 0);
    const saldoAnt = Math.round((total - pagadoAntes) * 100) / 100;
    const pagado = Math.min(Math.round((pagadoPorCfdi.get(id) ?? 0) * 100) / 100, saldoAnt);
    if (!(pagado > 0)) continue;
    let detalle: ImpuestoAgrupado[] = Array.isArray(c.impuestos_detalle) ? c.impuestos_detalle : [];
    if (!c.impuestos_detalle) {
      const prep = await prepararDesdeCfdi(admin, empresaId, id);
      detalle = agruparImpuestos(await itemsParaTimbrar(admin, prep));
    }
    const impuestos = impuestosProporcionales(detalle, pagado, total);
    documentos.push({
      cfdi_id: id, venta_id: ventaDeCfdi.get(id) ?? null, uuid: c.folio_fiscal, serie: c.serie, folio: c.folio,
      num_parcialidad: prev.length + 1, imp_saldo_ant: saldoAnt, imp_pagado: pagado,
      imp_saldo_insoluto: Math.round((saldoAnt - pagado) * 100) / 100,
      objeto_imp: impuestos.length ? "02" : "01",
      iva: impuestos.filter((x) => x.Name === "IVA").reduce((s, x) => s + x.Total, 0), impuestos,
    });
    const rc = { rfc: c.receiver_rfc, name: c.receiver_name, fiscal_regime: c.receiver_fiscal_regime, tax_zip_code: c.receiver_tax_zip_code };
    if (receptor && receptor.rfc !== rc.rfc) errores.push("Las facturas de este cobro son de receptores distintos.");
    receptor = receptor ?? rc;
    if (ambiente && ambiente !== c.facturama_ambiente) errores.push("Las facturas de este cobro son de ambientes distintos (prueba/producción).");
    ambiente = ambiente ?? c.facturama_ambiente;
  }
  if (cfdiIds.length && documentos.length === 0) errores.push("Las facturas PPD de este cobro ya no tienen saldo.");

  const forma = formaPago || formaPagoSat(cobro.metodo_pago);
  if (!forma) errores.push(`Elige la forma de pago (el método del cobro "${cobro.metodo_pago}" no tiene equivalente automático).`);
  else if (!FORMAS_PAGO.includes(forma)) errores.push("Forma de pago inválida para el complemento.");
  const monto = Math.round(documentos.reduce((s, d) => s + d.imp_pagado, 0) * 100) / 100;
  return {
    cobro: { id: cobro.id, fecha: cobro.fecha, monto: cobro.monto, metodo_pago: cobro.metodo_pago, cliente: cobro.clientes?.nombre ?? null },
    documentos, receptor, ambiente, forma_pago: forma, monto, fecha_limite: fechaLimiteRep(String(cobro.fecha)),
    errores: [...new Set(errores)],
  };
}

/** Cobros con facturas PPD que aún no tienen complemento vigente. */
async function repPendientes(admin: any, empresaId: string) {
  const { data: ppd } = await admin.from("cfdis").select("id").eq("empresa_id", empresaId)
    .eq("payment_method", "PPD").eq("status", "timbrado").limit(5000);
  const ppdIds = (ppd ?? []).map((c: any) => c.id);
  if (ppdIds.length === 0) return json({ pendientes: [] });
  const { data: cls } = await admin.from("cfdi_lineas").select("venta_lineas!inner(venta_id)").in("cfdi_id", ppdIds);
  const ventaIds = [...new Set((cls ?? []).map((x: any) => x.venta_lineas?.venta_id).filter(Boolean))] as string[];
  if (ventaIds.length === 0) return json({ pendientes: [] });
  const { data: apps } = await admin.from("cobro_aplicaciones")
    .select("cobro_id, cobros!inner(id, fecha, monto, metodo_pago, status, empresa_id, clientes(nombre))")
    .in("venta_id", ventaIds).eq("cobros.empresa_id", empresaId);
  const cobros = new Map<string, any>();
  for (const a of apps ?? []) if (a.cobros?.status !== "cancelado") cobros.set(a.cobro_id, a.cobros);
  const ids = [...cobros.keys()];
  if (ids.length === 0) return json({ pendientes: [] });
  const { data: reps } = await admin.from("cfdi_pagos").select("cobro_id, status").in("cobro_id", ids).in("status", OCUPA);
  const conRep = new Set((reps ?? []).map((r: any) => r.cobro_id));
  const pendientes = ids.filter((id) => !conRep.has(id)).map((id) => {
    const c = cobros.get(id);
    return { cobro_id: id, fecha: c.fecha, monto: c.monto, metodo_pago: c.metodo_pago, cliente: c.clientes?.nombre ?? null, fecha_limite: fechaLimiteRep(String(c.fecha)) };
  }).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return json({ pendientes });
}

async function liberarRep(admin: any, repId: string, reservaId: string | null, detalle: string) {
  const { error } = await admin.from("cfdi_pagos").update({
    status: "error", error_detalle: detalle, timbre_reserva_id: null, updated_at: new Date().toISOString(),
  }).eq("id", repId).is("facturama_id", null);
  if (error) console.error("liberarRep:", error.message);
  if (reservaId) {
    const { error: rErr } = await admin.rpc("release_timbre", { p_reservation_id: reservaId, p_motivo: detalle.slice(0, 200) });
    if (rErr) console.error("release_timbre:", rErr.message);
  }
}

async function guardarRepTimbrado(admin: any, fx: Fac, repId: string, empresaId: string, reservaId: string | null, result: any) {
  const archivos = await guardarArchivos(admin, fx, empresaId, result.Id);
  const { data, error } = await admin.from("cfdi_pagos").update({ ...sellos(result), facturama_ambiente: fx.ambiente, ...archivos })
    .eq("id", repId).is("facturama_id", null).select().maybeSingle();
  if (error || !data) return { ok: false as const, error: error?.message ?? "no se actualizó el complemento" };
  if (reservaId) {
    const { data: ok } = await admin.rpc("confirm_timbre_reserve", { p_reservation_id: reservaId, p_cfdi_id: repId });
    if (!ok) console.error("confirm_timbre_reserve no confirmó la reserva", reservaId);
  }
  return { ok: true as const, rep: data };
}

async function timbrarRep(admin: any, userId: string, body: any) {
  const empresaId: string = body.empresa_id;
  const prep = await prepararRep(admin, empresaId, body.cobro_id, body.forma_pago);
  if (prep.errores.length) throw new Error("No se puede timbrar el complemento:\n• " + prep.errores.join("\n• "));
  const emisor = await getEmisor(admin, empresaId, prep.ambiente);
  const fx = emisor.fac;
  const { data: saldo } = await admin.from("timbres_saldo").select("saldo").eq("empresa_id", empresaId).maybeSingle();
  if (!(Number(saldo?.saldo) >= 1)) throw new Error("No tienes timbres disponibles.");

  const fechaPago = `${String(prep.cobro.fecha).slice(0, 10)}T12:00:00`;
  const { data: ap, error: apErr } = await admin.rpc("apartar_rep", {
    p_empresa_id: empresaId, p_cobro_id: body.cobro_id, p_user_id: userId,
    p_cabecera: {
      fecha_pago: fechaPago, forma_pago: prep.forma_pago, monto: prep.monto, expedition_place: emisor.cp,
      facturama_ambiente: fx.ambiente, receiver_rfc: prep.receptor.rfc, receiver_name: prep.receptor.name,
      receiver_fiscal_regime: prep.receptor.fiscal_regime, receiver_tax_zip_code: prep.receptor.tax_zip_code,
    },
    p_documentos: prep.documentos,
  });
  if (apErr || !ap) throw new Error(apErr?.message || "No se pudo apartar el complemento");

  const { data: reservaId, error: rErr } = await admin.rpc("reserve_timbre", { p_empresa_id: empresaId, p_user_id: userId });
  if (rErr || !reservaId) {
    const msg = rErr ? "No se pudo reservar el timbre. Intenta de nuevo." : "No tienes timbres disponibles.";
    await liberarRep(admin, ap.id, null, msg);
    throw new Error(msg);
  }
  await admin.from("cfdi_pagos").update({ timbre_reserva_id: reservaId }).eq("id", ap.id);

  const payload = {
    NameId: "14",
    CfdiType: "P",
    Serie: ap.serie,
    Folio: ap.folio,
    ExpeditionPlace: emisor.cp,
    Issuer: { Rfc: emisor.rfc, Name: emisor.name, FiscalRegime: emisor.fiscal_regime },
    Receiver: {
      Rfc: prep.receptor.rfc, Name: prep.receptor.name, CfdiUse: "CP01",
      FiscalRegime: prep.receptor.fiscal_regime, TaxZipCode: prep.receptor.tax_zip_code,
    },
    Complemento: {
      Payments: [{
        Date: fechaPago,
        PaymentForm: prep.forma_pago,
        Currency: "MXN",
        Amount: prep.monto,
        RelatedDocuments: prep.documentos.map((d) => ({
          Uuid: d.uuid,
          ...(d.serie ? { Serie: d.serie } : {}),
          ...(d.folio ? { Folio: d.folio } : {}),
          Currency: "MXN",
          PaymentMethod: "PPD",
          PartialityNumber: d.num_parcialidad,
          PreviousBalanceAmount: d.imp_saldo_ant,
          AmountPaid: d.imp_pagado,
          ImpSaldoInsoluto: d.imp_saldo_insoluto,
          TaxObject: d.objeto_imp,
          ...(d.impuestos.length ? { Taxes: d.impuestos } : {}),
        })),
      }],
    },
  };

  let response: Response;
  try {
    response = await fetch(`${fx.api}/api-lite/3/cfdis`, {
      method: "POST",
      headers: { Authorization: fx.auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e: any) {
    await marcarIncierto(admin, "cfdi_pagos", ap.id, `Sin respuesta de Facturama: ${e?.message || e}`);
    throw new Error(INCIERTO_REP_MSG);
  }
  const content = await response.text();
  console.log(`📥 Facturama REP [${response.status}] ${ap.id}`);
  if (response.status >= 400 && response.status < 500) {
    const msg = mensajeFacturama(content);
    await liberarRep(admin, ap.id, reservaId, `Facturama rechazó: ${msg}`);
    throw new Error(`Facturama rechazó el complemento: ${msg}`);
  }
  let result: any = null;
  try { result = JSON.parse(content); } catch { /* incierto */ }
  const uuid = result?.Complement?.TaxStamp?.Uuid;
  if (!response.ok || !result?.Id || !uuid) {
    await marcarIncierto(admin, "cfdi_pagos", ap.id, `Respuesta de Facturama sin confirmar [HTTP ${response.status}]: ${content.slice(0, 500)}`);
    throw new Error(INCIERTO_REP_MSG);
  }
  const g = await guardarRepTimbrado(admin, fx, ap.id, empresaId, reservaId, result);
  if (!g.ok) {
    await marcarIncierto(admin, "cfdi_pagos", ap.id, `Timbrado en Facturama (UUID ${uuid}, Id ${result.Id}) pero no se guardó: ${g.error}`);
    throw new Error(`El complemento se timbró (UUID ${uuid}) pero no se pudo guardar. Usa "Reconciliar"; no vuelvas a timbrar.`);
  }
  return json({ success: true, cfdi_pago: g.rep, folio_fiscal: uuid });
}

// ========================================
// CANCELAR (factura o complemento de pago)
// ========================================
const STATUS_CANCELACION: Record<string, string> = {
  pending: "cancelacion_pendiente",
  rejected: "cancelacion_rechazada",
  canceled: "cancelado",
  accepted: "cancelado",
};

/** Cancela un CFDI de venta ante el SAT. Motivos 01–04; el 01 exige el UUID que lo sustituye. */
async function cancelarCfdi(admin: any, cfdiId: string, motivo: string, uuidSustitucionRaw?: string | null) {
  const { data: cfdi } = await admin.from("cfdis").select("*").eq("id", cfdiId).maybeSingle();
  if (!cfdi) throw new Error("CFDI no encontrado");
  if (cfdi.status === "cancelado") throw new Error("CFDI ya está cancelado");
  if (!cfdi.facturama_id) throw new Error("No hay ID de Facturama asociado");
  if (!["01", "02", "03", "04"].includes(motivo)) throw new Error("Motivo de cancelación inválido");
  const uuidSustitucion = String(uuidSustitucionRaw || "").trim().toLowerCase();
  if (motivo === "01") {
    if (!UUID_RE.test(uuidSustitucion)) throw new Error("Con el motivo 01 indica el UUID del CFDI que sustituye a este.");
    const { data: sust } = await admin.from("cfdis").select("id, status")
      .eq("empresa_id", cfdi.empresa_id).ilike("folio_fiscal", uuidSustitucion).maybeSingle();
    if (!sust || sust.status !== "timbrado" || sust.id === cfdi.id) {
      throw new Error("El UUID que sustituye debe ser de una factura timbrada de esta empresa.");
    }
  }
  // Una factura PPD con complementos de pago vigentes no se cancela (D-015).
  if (cfdi.payment_method === "PPD") {
    const { data: reps } = await admin.from("cfdi_pago_documentos").select("id, cfdi_pagos!inner(status)")
      .eq("cfdi_id", cfdi.id).in("cfdi_pagos.status", OCUPA).limit(1);
    if ((reps ?? []).length) throw new Error("Esta factura tiene complementos de pago vigentes; cancélalos primero.");
  }
  const emisor = await getEmisor(admin, cfdi.empresa_id, cfdi.facturama_ambiente);
  const qs = new URLSearchParams({ motive: motivo, rfc: emisor.rfc });
  if (motivo === "01") qs.set("uuidReplacement", uuidSustitucion);
  const response = await fetch(`${emisor.fac.api}/api-lite/cfdis/${cfdi.facturama_id}?${qs}`, {
    method: "DELETE", headers: { Authorization: emisor.fac.auth },
  });
  const content = await response.text();
  console.log(`📥 Cancel [${response.status}] cfdi ${cfdi.id}`);
  if (response.status !== 200) throw new Error(`Error al cancelar: ${mensajeFacturama(content)}`);
  const result = JSON.parse(content);
  const status = STATUS_CANCELACION[String(result.Status ?? "").toLowerCase()] || "cancelacion_pendiente";
  const { error } = await admin.from("cfdis").update({
    status, cancel_status: result.Status, cancel_motivo: motivo,
    cancel_uuid_sustitucion: motivo === "01" ? uuidSustitucion : null,
    cancel_date: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", cfdi.id);
  if (error) console.error("Guardar cancelación:", error.message);
  if (status === "cancelado") await recalcularVenta(admin, cfdi.id);
  return { status, facturama_status: result.Status, message: result.Message || "Cancelación procesada" };
}

/** Cancela un complemento de pago (motivos 02/03). Al cancelarse, el cobro se puede volver a editar. */
async function cancelarRep(admin: any, repId: string, motivo: string) {
  const { data: rep } = await admin.from("cfdi_pagos").select("*").eq("id", repId).maybeSingle();
  if (!rep) throw new Error("Complemento no encontrado");
  if (rep.status === "cancelado") throw new Error("El complemento ya está cancelado");
  if (!rep.facturama_id) throw new Error("No hay ID de Facturama asociado");
  if (!["02", "03"].includes(motivo)) throw new Error("Un complemento de pago se cancela con motivo 02 o 03.");
  const emisor = await getEmisor(admin, rep.empresa_id, rep.facturama_ambiente);
  const qs = new URLSearchParams({ motive: motivo, rfc: emisor.rfc });
  const response = await fetch(`${emisor.fac.api}/api-lite/cfdis/${rep.facturama_id}?${qs}`, {
    method: "DELETE", headers: { Authorization: emisor.fac.auth },
  });
  const content = await response.text();
  if (response.status !== 200) throw new Error(`Error al cancelar: ${mensajeFacturama(content)}`);
  const result = JSON.parse(content);
  const status = STATUS_CANCELACION[String(result.Status ?? "").toLowerCase()] || "cancelacion_pendiente";
  const { error } = await admin.from("cfdi_pagos").update({
    status, cancel_status: result.Status, cancel_motivo: motivo, cancel_date: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", rep.id);
  if (error) console.error("Guardar cancelación REP:", error.message);
  return { status, facturama_status: result.Status, message: result.Message || "Cancelación procesada" };
}

async function cancelar(admin: any, userId: string, body: any) {
  const esRep = body.tabla === "cfdi_pagos";
  const id = esRep ? body.id : body.cfdi_id;
  const { data: doc } = await admin.from(esRep ? "cfdi_pagos" : "cfdis").select("empresa_id").eq("id", id).maybeSingle();
  if (!doc) throw new Error("Documento no encontrado");
  await assertEmpresaAccess(admin, userId, doc.empresa_id);
  const r = esRep
    ? await cancelarRep(admin, id, body.motivo || "02")
    : await cancelarCfdi(admin, id, body.motivo || "02", body.uuid_sustitucion || body.folio_sustitucion);
  return json({ success: true, ...r });
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

