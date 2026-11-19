create or replace function public.fn_notify_empresa_alta()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_url text := 'https://hadesai.com.mx/api/public/webhooks/inbound/702bc3ba6ff0f2b4c7a5c9bd4623ac3e3809';
  v_owner_email text;
  v_payload jsonb;
begin
  begin
    select u.email into v_owner_email from auth.users u where u.id = new.owner_user_id;
  exception when others then
    v_owner_email := null;
  end;

  v_payload := jsonb_build_object(
    'event', 'empresa.created',
    'ocurrio_en', now(),
    'empresa', to_jsonb(new) || jsonb_build_object('owner_email', v_owner_email)
  );

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := v_payload,
      timeout_milliseconds := 5000
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;