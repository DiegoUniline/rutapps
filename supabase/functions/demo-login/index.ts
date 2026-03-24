import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEMO_EMAIL = "demo@rutapp.mx";
const DEMO_PASSWORD = "demo1234";
const DEMO_EMPRESA_NOMBRE = "Distribuidora Demo";

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

    // ── 1) Find or create demo user ──
    const { data: listData } = await admin.auth.admin.listUsers();
    let demoUser = listData?.users?.find((u: any) => u.email === DEMO_EMAIL);

    if (!demoUser) {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: "Admin Demo", empresa_nombre: DEMO_EMPRESA_NOMBRE },
        });
      if (createErr) throw createErr;
      demoUser = created.user;
      await new Promise((r) => setTimeout(r, 2500));
    } else {
      await admin.auth.admin.updateUserById(demoUser.id, { password: DEMO_PASSWORD });
    }

    // ── 2) Get profile → empresa_id ──
    const { data: profile } = await admin
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", demoUser!.id)
      .single();

    if (!profile?.empresa_id) throw new Error("Demo empresa not found");
    const eid = profile.empresa_id;

    // ── 3) Update empresa details ──
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
      razon_social: "Distribuidora Demo S.A. de C.V.",
      regimen_fiscal: "601",
      moneda: "MXN",
    }).eq("id", eid);

    // ── 4) Clean existing demo data (FK order) ──
    const tablesToClean = [
      "conteo_entradas", "conteo_lineas", "conteos_fisicos",
      "carga_pedidos", "carga_lineas", "cargas",
      "cobro_aplicaciones", "cobros",
      "venta_pagos", "venta_lineas", "ventas",
      "entregas",
      "movimientos_inventario", "ajustes_inventario",
      "stock_almacen",
      "compra_lineas", "compras",
      "lista_precios_lineas",
      "tarifa_lineas",
      "cliente_pedido_sugerido",
    ];
    for (const table of tablesToClean) {
      await admin.from(table).delete().eq("empresa_id", eid);
    }
    await admin.from("clientes").delete().eq("empresa_id", eid);
    await admin.from("productos").delete().eq("empresa_id", eid);
    await admin.from("almacenes").delete().eq("empresa_id", eid);
    await admin.from("zonas").delete().eq("empresa_id", eid);
    await admin.from("clasificaciones").delete().eq("empresa_id", eid);
    await admin.from("marcas").delete().eq("empresa_id", eid);
    await admin.from("lista_precios").delete().eq("empresa_id", eid);
    await admin.from("proveedores").delete().eq("empresa_id", eid);

    // ── 5) Almacenes ──
    const { data: almGeneral } = await admin.from("almacenes").insert({
      empresa_id: eid, nombre: "Almacén General", activo: true,
    }).select("id").single();

    const { data: almRuta1 } = await admin.from("almacenes").insert({
      empresa_id: eid, nombre: "Ruta Norte", activo: true,
    }).select("id").single();

    const { data: almRuta2 } = await admin.from("almacenes").insert({
      empresa_id: eid, nombre: "Ruta Sur", activo: true,
    }).select("id").single();

    // ── 6) Zonas ──
    const { data: zonaNorte } = await admin.from("zonas").insert({ empresa_id: eid, nombre: "Zona Norte" }).select("id").single();
    const { data: zonaSur } = await admin.from("zonas").insert({ empresa_id: eid, nombre: "Zona Sur" }).select("id").single();
    const { data: zonaCentro } = await admin.from("zonas").insert({ empresa_id: eid, nombre: "Zona Centro" }).select("id").single();

    // ── 7) Clasificaciones ──
    const { data: catBebidas } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Bebidas" }).select("id").single();
    const { data: catBotanas } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Botanas" }).select("id").single();
    const { data: catLacteos } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Lácteos" }).select("id").single();
    const { data: catLimpieza } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Limpieza" }).select("id").single();
    const { data: catAbarrotes } = await admin.from("clasificaciones").insert({ empresa_id: eid, nombre: "Abarrotes" }).select("id").single();

    // ── 8) Marcas ──
    for (const m of ["Coca-Cola", "PepsiCo", "Bimbo", "Lala", "Gamesa", "Sabritas", "Del Valle", "Roma"]) {
      await admin.from("marcas").insert({ empresa_id: eid, nombre: m });
    }

    // ── 9) Proveedores ──
    const { data: provBebidas } = await admin.from("proveedores").insert({
      empresa_id: eid, nombre: "Distribuidora de Bebidas del Norte",
      contacto: "Luis Ramírez", telefono: "8191234567", email: "ventas@bebidasnorte.com",
    }).select("id").single();

    const { data: provAbarrotes } = await admin.from("proveedores").insert({
      empresa_id: eid, nombre: "Abarrotes Mayoreo Central",
      contacto: "Carmen Flores", telefono: "8197654321", email: "pedidos@mayoreocentral.com",
    }).select("id").single();

    // ── 10) Tarifa & lista existentes ──
    const { data: tarifa } = await admin.from("tarifas").select("id").eq("empresa_id", eid).limit(1).single();
    const { data: lista } = await admin.from("listas").select("id").eq("empresa_id", eid).limit(1).single();

    // ── 11) Vendedor ──
    const { data: vendedor } = await admin.from("vendedores").select("id").eq("empresa_id", eid).limit(1).single();

    // ── 12) Productos ──
    const productos = [
      { codigo: "BEB-001", nombre: "Coca-Cola 600ml", precio: 18, costo: 12, cant: 500, iva: 16, clasId: catBebidas?.id, prov: provBebidas?.id },
      { codigo: "BEB-002", nombre: "Pepsi 600ml", precio: 17, costo: 11, cant: 450, iva: 16, clasId: catBebidas?.id, prov: provBebidas?.id },
      { codigo: "BEB-003", nombre: "Agua Natural 1L", precio: 12, costo: 6, cant: 800, iva: 16, clasId: catBebidas?.id, prov: provBebidas?.id },
      { codigo: "BEB-004", nombre: "Jugo Del Valle 1L", precio: 28, costo: 18, cant: 200, iva: 0, clasId: catBebidas?.id, prov: provBebidas?.id },
      { codigo: "BEB-005", nombre: "Cerveza XX Lager 355ml", precio: 25, costo: 16, cant: 600, iva: 16, clasId: catBebidas?.id, prov: provBebidas?.id },
      { codigo: "BEB-006", nombre: "Sprite 600ml", precio: 17, costo: 11, cant: 300, iva: 16, clasId: catBebidas?.id, prov: provBebidas?.id },
      { codigo: "BEB-007", nombre: "Fanta Naranja 600ml", precio: 17, costo: 11, cant: 280, iva: 16, clasId: catBebidas?.id, prov: provBebidas?.id },
      { codigo: "BOT-001", nombre: "Sabritas Original 45g", precio: 20, costo: 13, cant: 250, iva: 16, clasId: catBotanas?.id, prov: provAbarrotes?.id },
      { codigo: "BOT-002", nombre: "Doritos Nacho 62g", precio: 22, costo: 14, cant: 200, iva: 16, clasId: catBotanas?.id, prov: provAbarrotes?.id },
      { codigo: "BOT-003", nombre: "Ruffles Queso 50g", precio: 20, costo: 13, cant: 180, iva: 16, clasId: catBotanas?.id, prov: provAbarrotes?.id },
      { codigo: "LAC-001", nombre: "Leche Lala Entera 1L", precio: 28, costo: 20, cant: 350, iva: 0, clasId: catLacteos?.id, prov: provAbarrotes?.id },
      { codigo: "LAC-002", nombre: "Yogurt Lala Fresa 1L", precio: 35, costo: 24, cant: 150, iva: 0, clasId: catLacteos?.id, prov: provAbarrotes?.id },
      { codigo: "LAC-003", nombre: "Queso Oaxaca 400g", precio: 85, costo: 60, cant: 80, iva: 0, clasId: catLacteos?.id, prov: provAbarrotes?.id },
      { codigo: "LIM-001", nombre: "Detergente Roma 1kg", precio: 32, costo: 22, cant: 150, iva: 16, clasId: catLimpieza?.id, prov: provAbarrotes?.id },
      { codigo: "LIM-002", nombre: "Jabón Zote 400g", precio: 18, costo: 11, cant: 200, iva: 16, clasId: catLimpieza?.id, prov: provAbarrotes?.id },
      { codigo: "LIM-003", nombre: "Cloro Cloralex 1L", precio: 22, costo: 14, cant: 120, iva: 16, clasId: catLimpieza?.id, prov: provAbarrotes?.id },
      { codigo: "ABR-001", nombre: "Galletas Marías 170g", precio: 15, costo: 9, cant: 300, iva: 0, clasId: catAbarrotes?.id, prov: provAbarrotes?.id },
      { codigo: "ABR-002", nombre: "Pan Bimbo Grande", precio: 55, costo: 38, cant: 100, iva: 0, clasId: catAbarrotes?.id, prov: provAbarrotes?.id },
      { codigo: "ABR-003", nombre: "Aceite 1-2-3 1L", precio: 42, costo: 30, cant: 90, iva: 0, clasId: catAbarrotes?.id, prov: provAbarrotes?.id },
      { codigo: "ABR-004", nombre: "Arroz Verde Valle 1kg", precio: 28, costo: 18, cant: 130, iva: 0, clasId: catAbarrotes?.id, prov: provAbarrotes?.id },
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
        proveedor_id: p.prov ?? null,
        status: "activo",
        se_puede_vender: true,
        se_puede_comprar: true,
        se_puede_inventariar: true,
      }).select("id").single();
      if (data) insertedProducts.push({ ...data, ...p });
    }

    // ── 13) Stock en almacén general + rutas ──
    for (const p of insertedProducts) {
      const stockGeneral = Math.round(p.cant * 0.7);
      const stockR1 = Math.round(p.cant * 0.15);
      const stockR2 = p.cant - stockGeneral - stockR1;

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
      if (almRuta2) {
        await admin.from("stock_almacen").insert({
          empresa_id: eid, almacen_id: almRuta2.id, producto_id: p.id, cantidad: stockR2,
        });
      }
    }

    // ── 14) Tarifa lineas: regla general + reglas por categoría ──
    if (tarifa) {
      await admin.from("tarifa_lineas").insert({
        tarifa_id: tarifa.id, aplica_a: "todos", tipo_calculo: "margen",
        base_precio: "costo", margen_pct: 30, clasificacion_ids: [], producto_ids: [],
      });
      if (catBebidas) {
        await admin.from("tarifa_lineas").insert({
          tarifa_id: tarifa.id, aplica_a: "clasificacion", tipo_calculo: "margen",
          base_precio: "costo", margen_pct: 40, clasificacion_ids: [catBebidas.id], producto_ids: [],
        });
      }
      if (catLacteos) {
        await admin.from("tarifa_lineas").insert({
          tarifa_id: tarifa.id, aplica_a: "clasificacion", tipo_calculo: "descuento",
          base_precio: "precio", descuento_pct: 5, clasificacion_ids: [catLacteos.id], producto_ids: [],
        });
      }
    }

    // ── 15) Lista de precios principal con líneas para TODOS los productos ──
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

    // ── 15b) Lista Mayoreo con 10% descuento ──
    if (tarifa) {
      const { data: listaMay } = await admin.from("lista_precios").insert({
        empresa_id: eid, nombre: "Lista Mayoreo", tarifa_id: tarifa.id, es_principal: false, activa: true,
      }).select("id").single();

      if (listaMay) {
        for (const p of insertedProducts) {
          await admin.from("lista_precios_lineas").insert({
            lista_precio_id: listaMay.id, producto_id: p.id, precio: Math.round(p.precio * 0.9 * 100) / 100,
          });
        }
      }
    }

    // ── 16) Clientes ──
    const zonas = [zonaNorte, zonaSur, zonaCentro];
    const dias: string[][] = [["lunes"], ["martes"], ["miercoles"], ["jueves"], ["viernes"], ["lunes", "jueves"], ["martes", "viernes"], ["miercoles"]];
    const clientesData = [
      { nombre: "Abarrotes Don José", dir: "Calle Morelos 45, Col. Centro", col: "Centro", tel: "8111111111", contacto: "José García", lat: 25.6714, lng: -100.3093 },
      { nombre: "Tienda La Esquina", dir: "Av. Juárez 120, Col. Obispado", col: "Obispado", tel: "8122222222", contacto: "María López", lat: 25.6745, lng: -100.3245 },
      { nombre: "Mini Super El Sol", dir: "Blvd. Roble 890, Col. Valle", col: "Valle", tel: "8133333333", contacto: "Carlos Ruiz", lat: 25.6520, lng: -100.3350 },
      { nombre: "Abarrotes Lupita", dir: "Calle 5 de Mayo 34, Col. Mitras", col: "Mitras", tel: "8144444444", contacto: "Guadalupe Hernández", lat: 25.6890, lng: -100.3410 },
      { nombre: "Tienda Don Pancho", dir: "Av. Universidad 567, Col. Anáhuac", col: "Anáhuac", tel: "8155555555", contacto: "Francisco Torres", lat: 25.7010, lng: -100.3150 },
      { nombre: "Miscelánea La Estrella", dir: "Calle Hidalgo 78, Col. Terminal", col: "Terminal", tel: "8166666666", contacto: "Rosa Martínez", lat: 25.6830, lng: -100.3050 },
      { nombre: "Super Ahorro", dir: "Av. Lincoln 234, Col. Lincoln", col: "Lincoln", tel: "8177777777", contacto: "Pedro Sánchez", lat: 25.7100, lng: -100.3300 },
      { nombre: "Cremería Los Reyes", dir: "Calle Zaragoza 90, Col. Independencia", col: "Independencia", tel: "8188888888", contacto: "Ana Reyes", lat: 25.6650, lng: -100.2950 },
      { nombre: "Abarrotes El Porvenir", dir: "Av. Madero 456, Col. Cumbres", col: "Cumbres", tel: "8199999999", contacto: "Roberto Garza", lat: 25.7200, lng: -100.3600 },
      { nombre: "Tiendita Doña Mary", dir: "Calle Matamoros 12, Col. San Nicolás", col: "San Nicolás", tel: "8110101010", contacto: "María Elena Díaz", lat: 25.7450, lng: -100.2900 },
      { nombre: "Depósito El Güero", dir: "Blvd. Díaz Ordaz 789, Col. Country", col: "Country", tel: "8120202020", contacto: "Fernando Guzmán", lat: 25.6580, lng: -100.3500 },
      { nombre: "Mini Mart Express", dir: "Av. Garza Sada 1200, Col. Tecnológico", col: "Tecnológico", tel: "8130303030", contacto: "Alejandra Villarreal", lat: 25.6380, lng: -100.2880 },
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
        frecuencia: i < 6 ? "semanal" : "quincenal",
        dia_visita: dias[i % dias.length],
        status: "activo",
        credito: i % 3 !== 0,
        dias_credito: i % 3 !== 0 ? (i % 2 === 0 ? 15 : 30) : 0,
        limite_credito: i % 3 !== 0 ? (i % 2 === 0 ? 5000 : 10000) : 0,
        orden: i + 1,
      });
    }

    // ── 17) Cargas de ruta (ya preparadas) ──
    if (almGeneral && almRuta1 && vendedor) {
      const { data: carga1 } = await admin.from("cargas").insert({
        empresa_id: eid,
        almacen_id: almGeneral.id,
        almacen_destino_id: almRuta1.id,
        vendedor_id: vendedor.id,
        fecha: new Date().toISOString().slice(0, 10),
        status: "confirmada",
        notas: "Carga de la mañana - Ruta Norte",
      }).select("id").single();

      if (carga1) {
        for (const p of insertedProducts.slice(0, 10)) {
          await admin.from("carga_lineas").insert({
            carga_id: carga1.id, producto_id: p.id,
            cantidad_cargada: Math.round(p.cant * 0.05),
            cantidad_vendida: 0, cantidad_devuelta: 0,
          });
        }
      }
    }

    if (almGeneral && almRuta2 && vendedor) {
      const { data: carga2 } = await admin.from("cargas").insert({
        empresa_id: eid,
        almacen_id: almGeneral.id,
        almacen_destino_id: almRuta2.id,
        vendedor_id: vendedor.id,
        fecha: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        status: "descargada",
        notas: "Carga anterior - Ruta Sur (completada)",
      }).select("id").single();

      if (carga2) {
        for (const p of insertedProducts.slice(5, 15)) {
          const cargada = Math.round(p.cant * 0.04);
          const vendida = Math.round(cargada * 0.7);
          await admin.from("carga_lineas").insert({
            carga_id: carga2.id, producto_id: p.id,
            cantidad_cargada: cargada, cantidad_vendida: vendida,
            cantidad_devuelta: cargada - vendida,
          });
        }
      }
    }

    // ── 18) Sign in as demo user and return session ──
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    if (signInErr) throw signInErr;

    return new Response(
      JSON.stringify({ session: signIn.session, message: "Demo lista con datos completos." }),
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
