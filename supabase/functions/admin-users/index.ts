import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify calling user with anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = { id: claimsData.claims.sub as string };

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { action, ...params } = await req.json();

    // Get caller's empresa_id
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", caller.id)
      .single();

    if (!callerProfile?.empresa_id) {
      return new Response(JSON.stringify({ error: "Sin empresa" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empresaId = callerProfile.empresa_id;

    if (action === "list-users" || action === "list-empresa-users") {
      // Super admin can query any empresa
      let targetEmpresaId = empresaId;
      if (action === "list-empresa-users" && params.empresa_id) {
        // Verify caller is super admin
        const { data: isSA } = await adminClient.rpc('is_super_admin', { p_user_id: caller.id });
        if (!isSA) {
          return new Response(JSON.stringify({ error: "No autorizado" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        targetEmpresaId = params.empresa_id;
      }

      // Get all profiles for this empresa
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("user_id, nombre, telefono")
        .eq("empresa_id", targetEmpresaId);

      const userIds = (profiles ?? []).map((p: any) => p.user_id);

      if (userIds.length === 0) {
        return new Response(JSON.stringify({ users: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get auth users
      const { data: { users } } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });

      // Get roles
      const { data: userRoles } = await adminClient
        .from("user_roles")
        .select("user_id, role_id, roles(nombre)")
        .in("user_id", userIds);

      const rolesMap: Record<string, string> = {};
      (userRoles || []).forEach((ur: any) => {
        rolesMap[ur.user_id] = ur.roles?.nombre || 'Sin rol';
      });

      const profilesMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profilesMap[p.user_id] = p; });

      const filtered = users
        .filter((u: any) => userIds.includes(u.id))
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          nombre: profilesMap[u.id]?.nombre || null,
          telefono: profilesMap[u.id]?.telefono || null,
          rol: rolesMap[u.id] || null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        }));

      return new Response(JSON.stringify({ users: filtered }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set-password") {
      const { user_id, password } = params;

      // Verify user belongs to same empresa
      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("empresa_id")
        .eq("user_id", user_id)
        .single();

      if (targetProfile?.empresa_id !== empresaId) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        password,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-user") {
      const { email, password, nombre, role_id, almacen_id } = params;

      // Check if email already exists in auth system BEFORE attempting to create
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const emailLower = email.trim().toLowerCase();
      const duplicate = existingUsers?.find((u: any) => u.email?.toLowerCase() === emailLower);
      if (duplicate) {
        return new Response(JSON.stringify({ error: "Este correo electrónico ya está registrado en el sistema. Por favor usa otro correo." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user with empresa metadata so handle_new_user trigger won't create a random empresa
      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

      if (createError) {
        const msg = createError.message?.includes("already been registered")
          ? "Este correo electrónico ya está registrado en el sistema. Por favor usa otro correo."
          : createError.message;
        return new Response(JSON.stringify({ error: msg }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (newUser.user) {
        // Wait a moment for the trigger to fire
        await new Promise((r) => setTimeout(r, 500));

        // Ensure profile points to caller's empresa (trigger may have created it under wrong empresa)
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id")
          .eq("user_id", newUser.user.id)
          .maybeSingle();

        if (existingProfile) {
          await adminClient
            .from("profiles")
            .update({ empresa_id: empresaId, nombre: nombre || null, almacen_id: almacen_id || null })
            .eq("user_id", newUser.user.id);
        } else {
          await adminClient
            .from("profiles")
            .insert({ user_id: newUser.user.id, empresa_id: empresaId, nombre: nombre || null, almacen_id: almacen_id || null });
        }

        // Assign role if provided
        if (role_id) {
          await adminClient
            .from("user_roles")
            .insert({ user_id: newUser.user.id, role_id });
        }
      }

      return new Response(
        JSON.stringify({ ok: true, user_id: newUser.user.id }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
