import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { CustomerSegment } from '@/lib/customerIntelligence';

export interface CustomerIntelligenceMetrics {
  clients_total: number;
  active_clients: number;
  buyers_lifetime: number;
  buyers_recent: number;
  new_signups: number;
  retained_buyers: number;
  previous_buyers: number;
  retention_pct: number;
  recent_revenue: number;
  previous_revenue: number;
  revenue_at_risk: number;
  avg_ticket_recent: number;
}

export interface CustomerIntelligenceRow {
  id: string;
  codigo: string | null;
  nombre: string;
  status: string | null;
  signup_date: string | null;
  vendedor_id: string | null;
  seller_name: string;
  zona_id: string | null;
  zone_name: string;
  first_purchase: string | null;
  last_purchase: string | null;
  lifetime_orders: number;
  lifetime_total: number;
  active_months: number;
  recent_orders: number;
  recent_total: number;
  previous_orders: number;
  previous_total: number;
  purchase_before_window: string | null;
  avg_gap_days: number | null;
  days_since_purchase: number | null;
  avg_ticket: number;
  change_pct: number | null;
  expected_next_purchase: string | null;
  segment: CustomerSegment;
  days_overdue: number | null;
}

export interface SegmentSummary {
  clients: number;
  recent_total: number;
  previous_total: number;
  lifetime_total: number;
}

export interface CustomerIntelligenceSnapshot {
  generated_at: string;
  window_days: number;
  inactive_days: number;
  metrics: CustomerIntelligenceMetrics;
  segments: Partial<Record<CustomerSegment, SegmentSummary>>;
  monthly_portfolio: Array<{ month: string; orders: number; buyers: number; total: number }>;
  clients: CustomerIntelligenceRow[];
}

export interface CustomerIntelligenceDetail {
  generated_at: string;
  window_days: number;
  client: {
    id: string;
    codigo: string | null;
    nombre: string;
    status: string | null;
    signup_date: string | null;
    seller_name: string;
    zone_name: string;
    first_purchase: string | null;
    last_purchase: string | null;
    orders: number;
    lifetime_total: number;
    avg_ticket: number;
    recent_total: number;
    previous_total: number;
    change_pct: number | null;
  };
  monthly: Array<{ period: string; orders: number; total: number }>;
  weekly: Array<{ period: string; orders: number; total: number }>;
  products: Array<{
    id: string;
    codigo: string | null;
    nombre: string;
    unit: string;
    category_name: string;
    brand_name: string;
    history_qty: number;
    history_total: number;
    recent_qty: number;
    recent_total: number;
    previous_qty: number;
    previous_total: number;
    last_purchase: string | null;
    qty_change_pct: number | null;
    total_change_pct: number | null;
    trend: 'detenido' | 'bajando' | 'creciendo' | 'estable';
  }>;
  recent_purchases: Array<{
    id: string;
    folio: string | null;
    fecha: string;
    type: string;
    status: string;
    total: number;
  }>;
}

const EMPTY_METRICS: CustomerIntelligenceMetrics = {
  clients_total: 0, active_clients: 0, buyers_lifetime: 0, buyers_recent: 0,
  new_signups: 0, retained_buyers: 0, previous_buyers: 0, retention_pct: 0,
  recent_revenue: 0, previous_revenue: 0, revenue_at_risk: 0, avg_ticket_recent: 0,
};

type RpcResult = { data: unknown; error: Error | null };
const rpcClient = supabase as unknown as {
  rpc: (functionName: string, params: Record<string, unknown>) => Promise<RpcResult>;
};

function normalizeSnapshot(raw: unknown): CustomerIntelligenceSnapshot {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<CustomerIntelligenceSnapshot>;
  return {
    generated_at: data.generated_at ?? new Date().toISOString(),
    window_days: Number(data.window_days ?? 30),
    inactive_days: Number(data.inactive_days ?? 45),
    metrics: { ...EMPTY_METRICS, ...(data.metrics ?? {}) },
    segments: data.segments ?? {},
    monthly_portfolio: Array.isArray(data.monthly_portfolio) ? data.monthly_portfolio : [],
    clients: Array.isArray(data.clients) ? data.clients : [],
  };
}

export function useCustomerIntelligenceSnapshot(
  windowDays: number,
  inactiveDays: number,
  enabled: boolean,
) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['customer-intelligence-snapshot', empresa?.id, windowDays, inactiveDays],
    enabled: enabled && !!empresa?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc('fn_customer_intelligence_snapshot', {
        p_empresa_id: empresa!.id,
        p_window_days: windowDays,
        p_inactive_days: inactiveDays,
      });
      if (error) throw error;
      return normalizeSnapshot(data);
    },
  });
}

export function useCustomerIntelligenceDetail(
  clientId: string | null,
  months: number,
  windowDays: number,
  enabled: boolean,
) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['customer-intelligence-detail', empresa?.id, clientId, months, windowDays],
    enabled: enabled && !!empresa?.id && !!clientId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const params = { p_empresa_id: empresa!.id, p_cliente_id: clientId };
      const [detailResult, dimensionResult] = await Promise.all([
        rpcClient.rpc('fn_customer_intelligence_detail', {
          ...params,
          p_months: months,
          p_window_days: windowDays,
        }),
        rpcClient.rpc('fn_customer_intelligence_product_dimensions', params),
      ]);
      if (detailResult.error) throw detailResult.error;

      const detail = detailResult.data as CustomerIntelligenceDetail;
      const dimensionRows = Array.isArray(dimensionResult.data)
        ? dimensionResult.data as Array<{ id: string; category_name?: string | null; brand_name?: string | null }>
        : [];
      const dimensionByProduct = new Map(dimensionRows.map(row => [row.id, row]));

      return {
        ...detail,
        products: (detail.products ?? []).map(product => ({
          ...product,
          category_name: dimensionByProduct.get(product.id)?.category_name || 'Sin categoría',
          brand_name: dimensionByProduct.get(product.id)?.brand_name || 'Sin marca',
        })),
      } as CustomerIntelligenceDetail;
    },
  });
}
