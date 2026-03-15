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

    if (action === "list-users") {
      // Get all profiles for this empresa
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("user_id")
        .eq("empresa_id", empresaId);

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

      const filtered = users
        .filter((u: any) => userIds.includes(u.id))
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
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
      const { email, password, nombre } = params;

      // Create auth user
      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // The trigger handle_new_user should auto-create profile,
      // but let's update nombre if provided
      if (newUser.user && nombre) {
        await adminClient
          .from("profiles")
          .update({ nombre })
          .eq("user_id", newUser.user.id);
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
