import { supabase } from '@/lib/supabase';

/**
 * Safely fetch the current user's empresa_id.
 * Always filters by auth.uid() to avoid RLS multi-row errors.
 */
export async function getEmpresaId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile?.empresa_id) throw new Error('Sin perfil de empresa');

  return profile.empresa_id;
}
