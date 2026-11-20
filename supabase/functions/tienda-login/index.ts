import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BLOCKED_HASH, corsHeaders, correoCoincide, correoValido, escapeLike, hashPassword, json,
  normalizarCorreo, signToken, verificarPasswordTolerante,
} from "../_shared/tiendaAuth.ts";

const DEFAULT_PASSWORD = "123456";
const TC_COLS = "id, cliente_id, password_hash, verificado";

const bloqueado = (tc: { verificado: boolean | null; password_hash: string }) =>
  tc.verificado === false || tc.password_hash === BLOCKED_HASH;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { slug, email, password } = await req.json();
    if (!slug || !email || !password) return json({ error: "Escribe tu correo y tu contraseña" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg, error: cfgErr } = await supabase
      .from("tienda_config")
      .select("empresa_id")
      .eq("slug", slug)
      .eq("activa", true)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg) return json({ error: "Tienda no disponible" }, 404);
    const empresaId = cfg.empresa_id;

    const normalEmail = normalizarCorreo(email);
    if (!correoValido(normalEmail)) {
      return json({ error: "El correo no tiene un formato válido. Revisa que esté escrito como nombre@dominio.com" }, 400);
    }

    // 1) Acceso a la tienda con ese correo.
    const { data: porCorreo, error: tcErr } = await supabase
      .from("tienda_clientes").select(TC_COLS)
      .eq("empresa_id", empresaId).eq("email", normalEmail)
      .limit(1);
    if (tcErr) throw tcErr;
    let tc = porCorreo?.[0] ?? null;
    let passwordYaValidada = false;

    if (!tc) {
      // 2) No hay acceso con ese correo: se busca al cliente por el correo de su ficha
      //    (tolera mayúsculas, espacios y varios correos en el mismo campo).
      const { data: candidatos, error: cliErr } = await supabase
        .from("clientes").select("id, email, telefono")
        .eq("empresa_id", empresaId)
        .ilike("email", `%${escapeLike(normalEmail)}%`)
        .order("created_at")
        .limit(25);
      if (cliErr) throw cliErr;
      const cli = (candidatos ?? []).find((c: any) => correoCoincide(c.email, normalEmail)) ?? null;

      if (!cli) {
        const { data: sol, error: solErr } = await supabase
          .from("tienda_solicitudes_cliente").select("id")
          .eq("empresa_id", empresaId).eq("status", "pendiente")
          .ilike("email", escapeLike(normalEmail)).limit(1);
        if (solErr) throw solErr;
        if (sol?.length) {
          return json({
            error: "Tu solicitud de cuenta está en revisión. Podrás entrar cuando la empresa la apruebe.",
            code: "solicitud_pendiente",
          }, 403);
        }
        return json({
          error: "Este correo no está registrado en esta tienda. Pide a tu proveedor que registre tu correo o crea una cuenta nueva.",
          code: "email_no_existe",
        }, 404);
      }

      // ¿El cliente ya tenía acceso con otro correo? (p. ej. le cambiaron el correo
      // en su ficha). Entra con su contraseña de siempre y su acceso toma el correo nuevo.
      const { data: accesos, error: accErr } = await supabase
        .from("tienda_clientes").select(TC_COLS)
        .eq("empresa_id", empresaId).eq("cliente_id", cli.id)
        .order("created_at").limit(1);
      if (accErr) throw accErr;
      const previo = accesos?.[0] ?? null;

      if (previo) {
        if (bloqueado(previo)) {
          return json({ error: "Tu acceso a esta tienda fue bloqueado. Contacta al proveedor.", code: "bloqueado" }, 403);
        }
        if (!(await verificarPasswordTolerante(password, previo.password_hash))) {
          return json({
            error: "Contraseña incorrecta. El correo sí existe en esta tienda; verifica tu contraseña o pide a tu proveedor que la restablezca.",
            code: "password_incorrecta",
          }, 401);
        }
        const { error: upErr } = await supabase.from("tienda_clientes").update({ email: normalEmail }).eq("id", previo.id);
        if (upErr) console.warn("[tienda-login] no se pudo actualizar el correo del acceso:", upErr.message);
        tc = previo;
        passwordYaValidada = true;
      } else {
        // Auto-alta: todo cliente de la empresa entra la primera vez con la contraseña inicial.
        if (String(password).trim() !== DEFAULT_PASSWORD) {
          return json({
            // D-005: no revelar la contraseña inicial en la respuesta pública.
            error: "Contraseña incorrecta. Si es tu primer ingreso, usa la contraseña inicial que te dio tu proveedor y luego cámbiala.",
            code: "password_inicial",
          }, 401);
        }
        const { data: inserted, error: insErr } = await supabase
          .from("tienda_clientes")
          .insert({
            empresa_id: empresaId,
            cliente_id: cli.id,
            email: normalEmail,
            password_hash: await hashPassword(DEFAULT_PASSWORD),
            telefono: cli.telefono ?? null,
            verificado: true,
          })
          .select(TC_COLS)
          .single();
        if (insErr) {
          console.error("[tienda-login] alta de acceso:", insErr.message);
          return json({ error: "No pudimos activar tu acceso. Intenta de nuevo en un momento." }, 500);
        }
        tc = inserted;
        passwordYaValidada = true;
      }
    }

    if (bloqueado(tc)) {
      return json({ error: "Tu acceso a esta tienda fue bloqueado. Contacta al proveedor.", code: "bloqueado" }, 403);
    }

    if (!passwordYaValidada && !(await verificarPasswordTolerante(password, tc.password_hash))) {
      return json({
        error: "Contraseña incorrecta. El correo sí existe en esta tienda; verifica tu contraseña o pide a tu proveedor que la restablezca.",
        code: "password_incorrecta",
      }, 401);
    }

    const { error: ulErr } = await supabase.from("tienda_clientes").update({ ultimo_login: new Date().toISOString() }).eq("id", tc.id);
    if (ulErr) console.warn("[tienda-login] ultimo_login:", ulErr.message);

    const token = await signToken({
      empresa_id: empresaId,
      cliente_id: tc.cliente_id,
      tienda_cliente_id: tc.id,
      email: normalEmail,
    }, Deno.env.get("TIENDA_JWT_SECRET")!);

    return json({ token, email: normalEmail });
  } catch (err) {
    console.error("[tienda-login]", (err as Error).message);
    return json({ error: "No pudimos iniciar sesión por un problema del servidor. Intenta de nuevo." }, 500);
  }
});
