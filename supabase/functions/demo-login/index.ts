import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEMO_EMAIL = "demo@rutapp.mx";
const DEMO_PASSWORD = "demo1234";
const DEMO_EMPRESA_NOMBRE = "Empresa Demo";

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

    // 1) Find or create demo user
    const { data: listData } = await admin.auth.admin.listUsers();
    let demoUser = listData?.users?.find((u: any) => u.email === DEMO_EMAIL);

    if (!demoUser) {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: "Usuario Demo", empresa_nombre: DEMO_EMPRESA_NOMBRE },
        });
      if (createErr) throw createErr;
      demoUser = created.user;

      // Wait briefly for trigger to create profile + empresa
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      // Reset password in case it was changed
      await admin.auth.admin.updateUserById(demoUser.id, { password: DEMO_PASSWORD });
    }

    // 2) Get profile → empresa_id
    const { data: profile } = await admin
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", demoUser!.id)
      .single();

    if (!profile?.empresa_id) {
      throw new Error("Demo empresa not found");
    }

    const eid = profile.empresa_id;

    // 3) Update empresa details
    await admin.from("empresas").update({
      nombre: DEMO_EMPRESA_NOMBRE,
      rfc: "XAXX010101000",
      direccion: "Av. Reforma 123, Col. Centro",
      colonia: "Centro",
      ciudad: "Monterrey",
      estado: "Nuevo León",
      cp: "64000",
      telefono: "8112345678",
      email: "demo@rutapp.mx",
      razon_social: "Empresa Demo S.A. de C.V.",
      regimen_fiscal: "601",
      moneda: "MXN",
    }).eq("id", eid);

    // 4) Clean existing demo data (order matters for FK constraints)
    await admin.from("venta_lineas").delete().eq("venta_id",
      admin.from("ventas").select("id").eq("empresa_id", eid) as any
    );
    // Simplified: delete tables in correct order
    const tablesToClean = [
      "cobro_aplicaciones", "cobros",
      "venta_pagos", "venta_lineas", "ventas",
      "movimientos_inventario", "ajustes_inventario",
      "stock_almacen", "compra_lineas", "compras",
      "cliente_pedido_sugerido",
    ];

    for (const table of tablesToClean) {
      await admin.from(table).delete().eq("empresa_id", eid);
    }
    // Delete clientes and productos (these have empresa_id directly)
    await admin.from("clientes").delete().eq("empresa_id", eid);
    await admin.from("productos").delete().eq("empresa_id", eid);

    // 5) Get almacen & tarifa
    const { data: almacen } = await admin
      .from("almacenes")
      .select("id")
      .eq("empresa_id", eid)
      .limit(1)
      .single();

    const { data: tarifa } = await admin
      .from("tarifas")
      .select("id")
      .eq("empresa_id", eid)
      .limit(1)
      .single();

    const { data: zona } = await admin
      .from("zonas")
      .select("id")
      .eq("empresa_id", eid)
      .limit(1)
      .single();

    const { data: lista } = await admin
      .from("listas")
      .select("id")
      .eq("empresa_id", eid)
      .limit(1)
      .single();

    const { data: vendedor } = await admin
      .from("vendedores")
      .select("id")
      .eq("empresa_id", eid)
      .limit(1)
      .single();

    // 6) Insert sample products
    const productos = [
      { codigo: "PROD-0001", nombre: "Coca-Cola 600ml", precio: 18, costo: 12, cantidad: 500, unidad_venta: "pza", iva_pct: 16 },
      { codigo: "PROD-0002", nombre: "Pepsi 600ml", precio: 17, costo: 11, cantidad: 450, unidad_venta: "pza", iva_pct: 16 },
      { codigo: "PROD-0003", nombre: "Agua Natural 1L", precio: 12, costo: 6, cantidad: 800, unidad_venta: "pza", iva_pct: 16 },
      { codigo: "PROD-0004", nombre: "Galletas Marías 170g", precio: 15, costo: 9, cantidad: 300, unidad_venta: "pza", iva_pct: 0 },
      { codigo: "PROD-0005", nombre: "Sabritas Original 45g", precio: 20, costo: 13, cantidad: 250, unidad_venta: "pza", iva_pct: 8 },
      { codigo: "PROD-0006", nombre: "Jugo Del Valle 1L", precio: 28, costo: 18, cantidad: 200, unidad_venta: "pza", iva_pct: 0 },
      { codigo: "PROD-0007", nombre: "Pan Bimbo Grande", precio: 55, costo: 38, cantidad: 100, unidad_venta: "pza", iva_pct: 0 },
      { codigo: "PROD-0008", nombre: "Leche Lala 1L", precio: 28, costo: 20, cantidad: 350, unidad_venta: "pza", iva_pct: 0 },
      { codigo: "PROD-0009", nombre: "Cerveza XX Lager 355ml", precio: 25, costo: 16, cantidad: 600, unidad_venta: "pza", iva_pct: 16 },
      { codigo: "PROD-0010", nombre: "Detergente Roma 1kg", precio: 32, costo: 22, cantidad: 150, unidad_venta: "pza", iva_pct: 16 },
    ];

    const insertedProducts: any[] = [];
    for (const p of productos) {
      const { data } = await admin.from("productos").insert({
        empresa_id: eid,
        codigo: p.codigo,
        nombre: p.nombre,
        precio: p.precio,
        costo: p.costo,
        cantidad: p.cantidad,
        unidad_venta: p.unidad_venta,
        iva_pct: p.iva_pct,
        activo: true,
      }).select("id").single();
      if (data) insertedProducts.push({ ...data, ...p });
    }

    // 7) Insert stock_almacen for each product
    if (almacen) {
      for (const p of insertedProducts) {
        await admin.from("stock_almacen").insert({
          empresa_id: eid,
          almacen_id: almacen.id,
          producto_id: p.id,
          cantidad: p.cantidad,
        });
      }
    }

    // 8) Insert sample clients
    const clientes = [
      { nombre: "Abarrotes Don José", direccion: "Calle Morelos 45", telefono: "8111111111", contacto: "José García" },
      { nombre: "Tienda La Esquina", direccion: "Av. Juárez 120", telefono: "8122222222", contacto: "María López" },
      { nombre: "Mini Super El Sol", direccion: "Blvd. Roble 890", telefono: "8133333333", contacto: "Carlos Ruiz" },
      { nombre: "Abarrotes Lupita", direccion: "Calle 5 de Mayo 34", telefono: "8144444444", contacto: "Guadalupe Hdez" },
      { nombre: "Tienda Don Pancho", direccion: "Av. Universidad 567", telefono: "8155555555", contacto: "Francisco Torres" },
      { nombre: "Miscelánea La Estrella", direccion: "Calle Hidalgo 78", telefono: "8166666666", contacto: "Rosa Martínez" },
      { nombre: "Super Ahorro", direccion: "Av. Lincoln 234", telefono: "8177777777", contacto: "Pedro Sánchez" },
      { nombre: "Cremería Los Reyes", direccion: "Calle Zaragoza 90", telefono: "8188888888", contacto: "Ana Reyes" },
    ];

    for (const c of clientes) {
      await admin.from("clientes").insert({
        empresa_id: eid,
        nombre: c.nombre,
        direccion: c.direccion,
        telefono: c.telefono,
        contacto: c.contacto,
        zona_id: zona?.id ?? null,
        vendedor_id: vendedor?.id ?? null,
        tarifa_id: tarifa?.id ?? null,
        lista_id: lista?.id ?? null,
        frecuencia: "semanal",
        dia_visita: ["lunes"],
        status: "activo",
        credito: true,
        dias_credito: 15,
        limite_credito: 5000,
      });
    }

    // 9) Sign in as demo user and return session
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    if (signInErr) throw signInErr;

    return new Response(
      JSON.stringify({
        session: signIn.session,
        message: "Demo lista. Datos reseteados.",
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
