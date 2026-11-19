-- Línea base (D-018): buckets, políticas de storage.objects y triggers en auth.users.
-- Generado de la BD real 2026-11-19 (pg_policies / pg_get_triggerdef). Requiere 20261119000001_base_public.
set search_path = public, extensions;

insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('empresa-assets', 'empresa-assets', true),
  ('notification-images', 'notification-images', true),
  ('public-assets', 'public-assets', true),
  ('ruta-fotos', 'ruta-fotos', true),
  ('csf', 'csf', false),
  ('recibos-cobros', 'recibos-cobros', false),
  ('email-assets', 'email-assets', false),
  ('wa-bot-reports', 'wa-bot-reports', false),
  ('publicidad', 'publicidad', false),
  ('tienda-assets', 'tienda-assets', false),
  ('cfdi-archivos', 'cfdi-archivos', false)
on conflict (id) do nothing;

-- avatars
create policy "Avatars are publicly accessible" on storage.objects for select to public
  using (bucket_id = 'avatars');
create policy "Users can upload their own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "Users can update their own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "Users can delete their own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "Admins can upload teammate avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and exists (select 1 from profiles me join profiles other on other.empresa_id = me.empresa_id
    where me.user_id = auth.uid() and (other.user_id)::text = (storage.foldername(objects.name))[1]));
create policy "Admins can update teammate avatars" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and exists (select 1 from profiles me join profiles other on other.empresa_id = me.empresa_id
    where me.user_id = auth.uid() and (other.user_id)::text = (storage.foldername(objects.name))[1]));
create policy "Admins can delete teammate avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and exists (select 1 from profiles me join profiles other on other.empresa_id = me.empresa_id
    where me.user_id = auth.uid() and (other.user_id)::text = (storage.foldername(objects.name))[1]));

-- empresa-assets
create policy "Public can view empresa assets" on storage.objects for select to public
  using (bucket_id = 'empresa-assets');
create policy "Authenticated can upload empresa-assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'empresa-assets');
create policy "Authenticated can update empresa-assets" on storage.objects for update to authenticated
  using (bucket_id = 'empresa-assets') with check (bucket_id = 'empresa-assets');
create policy "Authenticated can delete empresa-assets" on storage.objects for delete to authenticated
  using (bucket_id = 'empresa-assets');
create policy "Tenant can upload empresa assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'empresa-assets' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()));
create policy "Tenant can update empresa assets" on storage.objects for update to authenticated
  using (bucket_id = 'empresa-assets' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()))
  with check (bucket_id = 'empresa-assets' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()));
create policy "Tenant can delete empresa assets" on storage.objects for delete to authenticated
  using (bucket_id = 'empresa-assets' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()));

-- public-assets
create policy "Public read access for public-assets" on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-assets');
create policy "Super admins can upload campaign images" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-assets' and (storage.foldername(name))[1] = 'wa-campaigns');

-- notification-images
create policy "Public read notification images" on storage.objects for select to public
  using (bucket_id = 'notification-images');
create policy "Super admins upload notification images" on storage.objects for insert to authenticated
  with check (bucket_id = 'notification-images' and is_super_admin(auth.uid()));
create policy "Super admins update notification images" on storage.objects for update to authenticated
  using (bucket_id = 'notification-images' and is_super_admin(auth.uid()));
create policy "Super admins delete notification images" on storage.objects for delete to authenticated
  using (bucket_id = 'notification-images' and is_super_admin(auth.uid()));

-- publicidad
create policy "Public read publicidad" on storage.objects for select to public
  using (bucket_id = 'publicidad');
create policy "Super admins upload publicidad" on storage.objects for insert to authenticated
  with check (bucket_id = 'publicidad' and exists (select 1 from super_admins where super_admins.user_id = auth.uid()));
create policy "Super admins update publicidad" on storage.objects for update to authenticated
  using (bucket_id = 'publicidad' and exists (select 1 from super_admins where super_admins.user_id = auth.uid()));
create policy "Super admins delete publicidad" on storage.objects for delete to authenticated
  using (bucket_id = 'publicidad' and exists (select 1 from super_admins where super_admins.user_id = auth.uid()));

-- csf
create policy csf_select_own_empresa on storage.objects for select to authenticated
  using (bucket_id = 'csf' and (storage.foldername(name))[1] in (select p.empresa_id::text from profiles p where p.id = auth.uid()));
create policy csf_insert_own_empresa on storage.objects for insert to authenticated
  with check (bucket_id = 'csf' and (storage.foldername(name))[1] in (select p.empresa_id::text from profiles p where p.id = auth.uid()));
create policy csf_update_own_empresa on storage.objects for update to authenticated
  using (bucket_id = 'csf' and (storage.foldername(name))[1] in (select p.empresa_id::text from profiles p where p.id = auth.uid()));
create policy csf_delete_own_empresa on storage.objects for delete to authenticated
  using (bucket_id = 'csf' and (storage.foldername(name))[1] in (select p.empresa_id::text from profiles p where p.id = auth.uid()));

-- recibos-cobros
create policy recibos_cobros_select_empresa on storage.objects for select to authenticated
  using (bucket_id = 'recibos-cobros' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.id = auth.uid()));
create policy recibos_cobros_insert_empresa on storage.objects for insert to authenticated
  with check (bucket_id = 'recibos-cobros' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.id = auth.uid()));
create policy recibos_cobros_update_empresa on storage.objects for update to authenticated
  using (bucket_id = 'recibos-cobros' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.id = auth.uid()));

-- ruta-fotos
create policy ruta_fotos_public_read on storage.objects for select to public
  using (bucket_id = 'ruta-fotos');
create policy ruta_fotos_tenant_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ruta-fotos' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()));
create policy ruta_fotos_tenant_update on storage.objects for update to authenticated
  using (bucket_id = 'ruta-fotos' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()))
  with check (bucket_id = 'ruta-fotos' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()));
create policy ruta_fotos_tenant_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ruta-fotos' and (storage.foldername(name))[1] in (select profiles.empresa_id::text from profiles where profiles.user_id = auth.uid()));

-- auth.users
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger trg_link_partner_on_signup after insert on auth.users for each row execute function public.link_partner_on_signup();
