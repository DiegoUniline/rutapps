import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEMO_TTL_HOURS = 2;
const DEMO_EMAIL_DOMAIN = "demo.rutapp.mx";
const DEMO_EMPRESA_NOMBRE = "Distribuidora Demo";

function randomToken(len = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 0) Garbage-collect expired demo empresas (and their auth users) ──
    try {
      const { data: expired } = await admin
        .from("empresas")
        .select("id, owner_user_id")
        .lt("demo_expires_at", new Date().toISOString())
        .limit(20);

      if (expired?.length) {
        for (const e of expired) {
          // Delete empresa: FK cascades wipe all related data
          await admin.from("empresas").delete().eq("id", e.id);
          // Delete the auth user too
          if (e.owner_user_id) {
            try { await admin.auth.admin.deleteUser(e.owner_user_id); } catch (_) {}
          }
        }
      }
    } catch (gcErr) {
      console.warn("demo GC warning:", gcErr);
    }

    // ── 1) Create a fresh ephemeral demo user ──
    const token = randomToken(10);
    const demoEmail = `demo-${token}@${DEMO_EMAIL_DOMAIN}`;
    const demoPassword = `Demo!${randomToken(12)}`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Usuario Demo",
        empresa_nombre: DEMO_EMPRESA_NOMBRE,
        is_demo: true,
      },
    });
    if (createErr) throw createErr;
    const demoUser = created.user!;

    // Wait for handle_new_user trigger to create empresa + profile + role
    let eid: string | null = null;
    for (let i = 0; i < 20; i++) {
      const { data: profile } = await admin
        .from("profiles")
        .select("empresa_id")
        .eq("user_id", demoUser.id)
        .maybeSingle();
      if (profile?.empresa_id) { eid = profile.empresa_id; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!eid) throw new Error("No se pudo provisionar la empresa demo");

    // ── 2) Mark empresa as ephemeral demo + fill details ──
    const expiresAt = new Date(Date.now() + DEMO_TTL_HOURS * 3600 * 1000).toISOString();
    await admin.from("empresas").update({
      nombre: DEMO_EMPRESA_NOMBRE,
      rfc: "XAXX010101000",
      direccion: "Av. Reforma 123, Col. Centro",
      colonia: "Centro",
      ciudad: "Monterrey",
      estado: "Nuevo León",
      cp: "64000",
      telefono: "8112345678",
      email: demoEmail,
      razon_social: "Distribuidora Demo S.A. de C.V.",
      regimen_fiscal: "601",
      moneda: "MXN",
      demo_expires_at: expiresAt,
    }).eq("id", eid);

    // ── 3) Subscription: manual + active so no billing blocks ──
    await admin.from("subscriptions").update({
      es_manual: true,
      acceso_bloqueado: false,
      status: "active",
      updated_at: new Date().toISOString(),
    }).eq("empresa_id", eid);

    await admin.from("facturas")
      .delete()
      .eq("empresa_id", eid)
      .in("estado", ["pendiente", "procesando", "past_due"]);

    // ── 4) Seed sample data ──
    // Almacenes
    const { data: almGeneral } = await admin.from("almacenes").insert({
      empresa_id: eid, nombre: "Almacén Principal", activo: true,
    }).select("id").single();

    const { data: almRuta1 } = await admin.from("almacenes").insert({
      empresa_id: eid, nombre: "Ruta Norte", activo: true,
    }).select("id").single();

    // Zonas
    const { data: zonaNorte } = await admin.from("zonas").insert({ empresa_id: eid, nombre: "Zona Norte" }).select("id").single();
    const { data: zonaSur } = await admin.from("zonas").insert({ empresa_id: eid, nombre: "Zona Sur" }).select("id").single();

    // Clasificaciones
    const { data: catBebidas } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Bebidas" }).select("id").single();
    const { data: catBotanas } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Botanas" }).select("id").single();
    const { data: catLacteos } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Lácteos" }).select("id").single();
    const { data: catAbarrotes } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Abarrotes" }).select("id").single();

    // Marcas
    for (const m of ["Coca-Cola", "PepsiCo", "Bimbo", "Lala", "Sabritas"]) {
      await admin.from("marcas").insert({ empresa_id: eid, nombre: m });
    }

    // Proveedor
    const { data: provDefault } = await admin.from("proveedores").insert({
      empresa_id: eid, nombre: "Proveedor Demo",
      contacto: "Luis Ramírez", telefono: "8191234567", email: "ventas@demo.com",
    }).select("id").single();

    // Tarifa & lista preexistentes (creadas por trigger auto_create_empresa_basics)
    const { data: tarifa } = await admin.from("tarifas").select("id").eq("empresa_id", eid).limit(1).maybeSingle();
    const { data: lista } = await admin.from("listas").select("id").eq("empresa_id", eid).limit(1).maybeSingle();
    const { data: vendedor } = await admin.from("vendedores").select("id").eq("empresa_id", eid).limit(1).maybeSingle();

    // Productos
    const productos = [
      { codigo: "BEB-001", nombre: "Coca-Cola 600ml", precio: 18, costo: 12, cant: 500, iva: 16, clasId: catBebidas?.id },
      { codigo: "BEB-002", nombre: "Pepsi 600ml", precio: 17, costo: 11, cant: 450, iva: 16, clasId: catBebidas?.id },
      { codigo: "BEB-003", nombre: "Agua Natural 1L", precio: 12, costo: 6, cant: 800, iva: 16, clasId: catBebidas?.id },
      { codigo: "BEB-004", nombre: "Jugo Del Valle 1L", precio: 28, costo: 18, cant: 200, iva: 0, clasId: catBebidas?.id },
      { codigo: "BOT-001", nombre: "Sabritas Original 45g", precio: 20, costo: 13, cant: 250, iva: 16, clasId: catBotanas?.id },
      { codigo: "BOT-002", nombre: "Doritos Nacho 62g", precio: 22, costo: 14, cant: 200, iva: 16, clasId: catBotanas?.id },
      { codigo: "LAC-001", nombre: "Leche Lala Entera 1L", precio: 28, costo: 20, cant: 350, iva: 0, clasId: catLacteos?.id },
      { codigo: "LAC-002", nombre: "Yogurt Lala Fresa 1L", precio: 35, costo: 24, cant: 150, iva: 0, clasId: catLacteos?.id },
      { codigo: "ABR-001", nombre: "Galletas Marías 170g", precio: 15, costo: 9, cant: 300, iva: 0, clasId: catAbarrotes?.id },
      { codigo: "ABR-002", nombre: "Pan Bimbo Grande", precio: 55, costo: 38, cant: 100, iva: 0, clasId: catAbarrotes?.id },
      { codigo: "ABR-003", nombre: "Aceite 1-2-3 1L", precio: 42, costo: 30, cant: 90, iva: 0, clasId: catAbarrotes?.id },
      { codigo: "ABR-004", nombre: "Arroz 1kg", precio: 28, costo: 18, cant: 130, iva: 0, clasId: catAbarrotes?.id },
    ];

    const insertedProducts: any[] = [];
    for (const p of productos) {
      const { data } = await admin.from("productos").insert({
        empresa_id: eid,
        codigo: p.codigo,
        nombre: p.nombre,
        precio_principal: p.precio,
        costo: p.costo,
        cantidad: p.cant,
        iva_pct: p.iva,
        tiene_iva: p.iva > 0,
        clasificacion_id: p.clasId ?? null,
        proveedor_id: provDefault?.id ?? null,
        status: "activo",
        se_puede_vender: true,
        se_puede_comprar: true,
        se_puede_inventariar: true,
      }).select("id").single();
      if (data) insertedProducts.push({ ...data, ...p });
    }

    // Stock
    for (const p of insertedProducts) {
      const stockGeneral = Math.round(p.cant * 0.8);
      const stockR1 = p.cant - stockGeneral;
      if (almGeneral) {
        await admin.from("stock_almacen").insert({
          empresa_id: eid, almacen_id: almGeneral.id, producto_id: p.id, cantidad: stockGeneral,
        });
      }
      if (almRuta1) {
        await admin.from("stock_almacen").insert({
          empresa_id: eid, almacen_id: almRuta1.id, producto_id: p.id, cantidad: stockR1,
        });
      }
    }

    // Lista de precios principal con todos los productos
    let listaP: any = null;
    if (tarifa) {
      const { data: lp } = await admin.from("lista_precios").insert({
        empresa_id: eid, nombre: "Lista Principal", tarifa_id: tarifa.id, es_principal: true, activa: true,
      }).select("id").single();
      listaP = lp;

      if (listaP) {
        for (const p of insertedProducts) {
          await admin.from("lista_precios_lineas").insert({
            lista_precio_id: listaP.id, producto_id: p.id, precio: p.precio,
          });
        }
      }
    }

    // Clientes
    const zonas = [zonaNorte, zonaSur];
    const clientesData = [
      { nombre: "Abarrotes Don José", dir: "Calle Morelos 45", col: "Centro", tel: "8111111111", contacto: "José García", lat: 25.6714, lng: -100.3093 },
      { nombre: "Tienda La Esquina", dir: "Av. Juárez 120", col: "Obispado", tel: "8122222222", contacto: "María López", lat: 25.6745, lng: -100.3245 },
      { nombre: "Mini Super El Sol", dir: "Blvd. Roble 890", col: "Valle", tel: "8133333333", contacto: "Carlos Ruiz", lat: 25.6520, lng: -100.3350 },
      { nombre: "Abarrotes Lupita", dir: "Calle 5 de Mayo 34", col: "Mitras", tel: "8144444444", contacto: "Guadalupe Hernández", lat: 25.6890, lng: -100.3410 },
      { nombre: "Tienda Don Pancho", dir: "Av. Universidad 567", col: "Anáhuac", tel: "8155555555", contacto: "Francisco Torres", lat: 25.7010, lng: -100.3150 },
      { nombre: "Miscelánea La Estrella", dir: "Calle Hidalgo 78", col: "Terminal", tel: "8166666666", contacto: "Rosa Martínez", lat: 25.6830, lng: -100.3050 },
      { nombre: "Super Ahorro", dir: "Av. Lincoln 234", col: "Lincoln", tel: "8177777777", contacto: "Pedro Sánchez", lat: 25.7100, lng: -100.3300 },
      { nombre: "Cremería Los Reyes", dir: "Calle Zaragoza 90", col: "Independencia", tel: "8188888888", contacto: "Ana Reyes", lat: 25.6650, lng: -100.2950 },
    ];

    for (let i = 0; i < clientesData.length; i++) {
      const c = clientesData[i];
      const zona = zonas[i % zonas.length];
      await admin.from("clientes").insert({
        empresa_id: eid,
        nombre: c.nombre, direccion: c.dir, colonia: c.col,
        telefono: c.tel, contacto: c.contacto,
        gps_lat: c.lat, gps_lng: c.lng,
        zona_id: zona?.id ?? null,
        vendedor_id: vendedor?.id ?? null,
        tarifa_id: tarifa?.id ?? null,
        lista_id: lista?.id ?? null,
        lista_precio_id: listaP?.id ?? null,
        frecuencia: "semanal",
        status: "activo",
        credito: i % 2 === 0,
        dias_credito: i % 2 === 0 ? 15 : 0,
        limite_credito: i % 2 === 0 ? 5000 : 0,
        orden: i + 1,
      });
    }

    // ── 5) Sign in and return session ──
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });
    if (signInErr) throw signInErr;

    return new Response(
      JSON.stringify({
        session: signIn.session,
        message: "Demo lista. Esta sesión expira en 2 horas y se borrarán los datos.",
        expires_at: expiresAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("demo-login error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
