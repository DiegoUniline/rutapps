import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useMonthlyGoal() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-monthly-goal', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('monthly_sales_goal')
        .eq('id', empresa!.id)
        .maybeSingle();
      if (error) throw error;
      return Number((data as any)?.monthly_sales_goal ?? 0);
    },
  });
}

export function useUpdateMonthlyGoal() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: number) => {
      const { error } = await supabase
        .from('empresas')
        .update({ monthly_sales_goal: goal } as any)
        .eq('id', empresa!.id);
      if (error) throw error;
      return goal;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-monthly-goal', empresa?.id] });
      toast.success('Meta del mes actualizada');
    },
    onError: (e: any) => toast.error(e.message || 'Error al actualizar meta'),
  });
}
