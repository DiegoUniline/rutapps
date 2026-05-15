import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Beaker, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SandboxBanner() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const empresaId = profile?.empresa_id;

  const { data: empresa } = useQuery({
    queryKey: ['empresa-sandbox-flag', empresaId],
    queryFn: async () => {
      if (!empresaId) return null;
      const { data } = await supabase
        .from('empresas')
        .select('is_partner_sandbox')
        .eq('id', empresaId)
        .maybeSingle();
      return data;
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  });

  const isSandbox = !!empresa?.is_partner_sandbox;

  const { data: usage } = useQuery({
    queryKey: ['sandbox-usage', empresaId],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_sandbox_usage', { p_empresa_id: empresaId! });
      return (data && data[0]) || null;
    },
    enabled: isSandbox && !!empresaId,
    refetchInterval: 30_000,
  });

  if (!isSandbox) return null;

  const handleExit = async () => {
    await signOut();
    navigate('/partner');
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-orange-500 text-white shadow-md">
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Beaker className="h-4 w-4 shrink-0" />
          <span className="font-bold whitespace-nowrap">Sandbox Partner</span>
          {usage && (
            <span className="hidden sm:inline opacity-95 truncate">
              · {usage.clientes_count}/{usage.clientes_max} clientes · {usage.productos_count}/{usage.productos_max} productos · {usage.ventas_count}/{usage.ventas_max} ventas
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="bg-white text-orange-600 hover:bg-orange-50 h-7 px-2"
          onClick={handleExit}
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Salir
        </Button>
      </div>
    </div>
  );
}
