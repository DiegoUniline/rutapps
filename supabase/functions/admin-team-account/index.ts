import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const generateTemporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const symbols = '!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let password = 'Rt!9';
  for (let index = 0; index < 12; index += 1) password += alphabet[bytes[index] % alphabet.length];
  password += symbols[bytes[12] % symbols.length];
  return password;
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: claims, error: claimsError } = await callerClient.auth.getClaims(token);
    const callerId = claims?.claims?.sub as string | undefined;
    if (claimsError || !callerId) return json({ error: 'Sesión inválida' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isSuperAdmin } = await admin.rpc('is_super_admin', { p_user_id: callerId });
    if (!isSuperAdmin) return json({ error: 'Solo un super administrador puede dar acceso al equipo' }, 403);

    const body = await request.json();
    const personId = body?.person_id as string | undefined;
    const accessMode = (body?.access_mode || 'invite') as 'invite' | 'direct';
    const requestedPassword = typeof body?.temporary_password === 'string' ? body.temporary_password.trim() : '';
    if (!personId) return json({ error: 'Falta el integrante' }, 400);
    if (!['invite', 'direct'].includes(accessMode)) return json({ error: 'Modalidad de acceso inválida' }, 400);
    if (accessMode === 'direct' && requestedPassword && requestedPassword.length < 8) {
      return json({ error: 'La contraseña temporal debe tener al menos 8 caracteres' }, 400);
    }

    const { data: person, error: personError } = await admin
      .from('commission_people')
      .select('id, person_type, name, email, is_active')
      .eq('id', personId)
      .maybeSingle();
    if (personError || !person || person.person_type !== 'internal') {
      return json({ error: 'El integrante interno no existe' }, 404);
    }
    if (!person.is_active) return json({ error: 'Reactiva al integrante antes de darle acceso' }, 409);
    if (!person.email) return json({ error: 'El integrante necesita un correo' }, 409);

    const email = person.email.trim().toLowerCase();
    let userId: string | null = null;
    for (let page = 1; page <= 10 && !userId; page += 1) {
      const { data: pageData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (usersError) throw usersError;
      const match = pageData.users.find(user => user.email?.toLowerCase() === email);
      userId = match?.id ?? null;
      if (pageData.users.length < 1000) break;
    }

    const existingAccount = Boolean(userId);
    let invited = false;
    let temporaryPassword: string | null = null;

    if (!userId && accessMode === 'invite') {
      const siteUrl = (Deno.env.get('SITE_URL') || request.headers.get('origin') || 'https://rutapp.mx').replace(/\/$/, '');
      const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/equipo`,
        data: { full_name: person.name, account_type: 'rutapp_team' },
      });
      if (inviteError || !invite.user) return json({ error: inviteError?.message || 'No se pudo enviar la invitación' }, 400);
      userId = invite.user.id;
      invited = true;
    }

    if (!userId && accessMode === 'direct') {
      temporaryPassword = requestedPassword || generateTemporaryPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: person.name, account_type: 'rutapp_team' },
      });
      if (createError || !created.user) return json({ error: createError?.message || 'No se pudo crear la cuenta directa' }, 400);
      userId = created.user.id;
    }

    const { error: linkError } = await admin.rpc('admin_link_team_account', {
      p_person_id: person.id,
      p_user_id: userId,
    });
    if (linkError) throw linkError;

    return json({
      ok: true,
      user_id: userId,
      invited,
      existing_account: existingAccount,
      access_mode: accessMode,
      email,
      temporary_password: temporaryPassword,
    });
  } catch (error) {
    console.error('admin-team-account', error);
    return json({ error: error instanceof Error ? error.message : 'No se pudo preparar la cuenta' }, 500);
  }
});
