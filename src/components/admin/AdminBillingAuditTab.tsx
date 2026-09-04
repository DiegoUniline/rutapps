import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, fmtDate } from '@/lib/utils';
import {
  auditSubscription,
  type AuditSeverity,
  type BillingAuditRecord,
  type SubscriptionAuditResult,
} from '@/lib/subscriptionAudit';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Copy,
  CreditCard,
  Download,
  Eye,
  Columns3,
  FileWarning,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';

interface AuditApiResponse {
  generated_at: string;
  records: BillingAuditRecord[];
  orphan_stripe_subscriptions: Array<{
    id: string;
    status: string;
    customer_id: string | null;
    customer_email: string | null;
    created_at: string | null;
  }>;
}

type AuditFilter = 'all' | 'healthy' | 'critical' | 'warning' | 'active_without_payment' | 'active' | 'trial' | 'down';

type AuditColumn =
  | 'empresa' | 'alta' | 'fin_demo' | 'suscripcion' | 'ultima_venta' | 'dias_sin_venta'
  | 'rutapp' | 'stripe' | 'periodo' | 'ultimo_cobro' | 'tarjeta' | 'stripe_id' | 'resultado';

const AUDIT_COLUMNS: Array<{ key: AuditColumn; label: string; essential?: boolean }> = [
  { key: 'empresa', label: 'Empresa', essential: true },
  { key: 'alta', label: 'Fecha de alta' },
  { key: 'fin_demo', label: 'Fin de demo' },
  { key: 'suscripcion', label: 'Día y hora de suscripción' },
  { key: 'ultima_venta', label: 'Última venta' },
  { key: 'dias_sin_venta', label: 'Días desde última venta' },
  { key: 'rutapp', label: 'Estado RutApp' },
  { key: 'stripe', label: 'Estado Stripe' },
  { key: 'periodo', label: 'Periodo' },
  { key: 'ultimo_cobro', label: 'Último cobro' },
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'stripe_id', label: 'ID Stripe' },
  { key: 'resultado', label: 'Resultado', essential: true },
];

const DEFAULT_COLUMNS: AuditColumn[] = [
  'empresa', 'alta', 'fin_demo', 'suscripcion', 'ultima_venta', 'dias_sin_venta', 'rutapp', 'ultimo_cobro', 'resultado',
];

const STATUS_LABELS: Record<SubscriptionAuditResult['operational_status'], string> = {
  active: 'Activa',
  trial: 'Prueba',
  past_due: 'Vencida',
  down: 'Baja',
  no_subscription: 'Sin suscripción',
};

const STRIPE_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  trialing: 'Prueba',
  past_due: 'Vencida',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
  unpaid: 'Impagada',
  incomplete: 'Incompleta',
  incomplete_expired: 'Expirada',
  paused: 'Pausada',
};

const CARD_BRANDS: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover',
};

const SEVERITY_ORDER: Record<AuditSeverity, number> = { critical: 0, warning: 1, ok: 2 };

function mexicoDateOnly(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(parsed);
}

function isDateInRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  const day = mexicoDateOnly(value);
  if (!day) return false;
  return (!from || day >= from) && (!to || day <= to);
}

function subscriptionCreatedAt(row: SubscriptionAuditResult): string | null {
  return row.stripe_subscription?.created_at ?? row.db_subscription?.created_at ?? null;
}

function trialEndAt(row: SubscriptionAuditResult): string {
  return row.empresa_demo_expires_at ?? row.db_subscription?.trial_ends_at ?? row.expected.trial_end;
}

function daysSince(value?: string | null): number | null {
  const day = mexicoDateOnly(value);
  if (!day) return null;
  const [year, month, date] = day.split('-').map(Number);
  const saleUtc = Date.UTC(year, month - 1, date);
  const today = mexicoDateOnly(new Date().toISOString()).split('-').map(Number);
  const todayUtc = Date.UTC(today[0], today[1] - 1, today[2]);
  return Math.max(0, Math.floor((todayUtc - saleUtc) / 86_400_000));
}

export default function AdminBillingAuditTab() {
  const [filter, setFilter] = useState<AuditFilter>('critical');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SubscriptionAuditResult | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<AuditColumn[]>(DEFAULT_COLUMNS);
  const [dateFilters, setDateFilters] = useState({
    signupFrom: '', signupTo: '', trialFrom: '', trialTo: '', subscriptionFrom: '', subscriptionTo: '',
  });

  const query = useQuery<AuditApiResponse>({
    queryKey: ['admin-billing-audit'],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sesión no disponible');
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=audit_subscriptions`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'No fue posible ejecutar la auditoría');
      return payload as AuditApiResponse;
    },
  });

  const audited = useMemo(
    () => (query.data?.records ?? []).map(row => auditSubscription(row)),
    [query.data?.records],
  );

  const stats = useMemo(() => ({
    total: audited.length,
    healthy: audited.filter(row => row.severity === 'ok').length,
    critical: audited.filter(row => row.severity === 'critical').length,
    warning: audited.filter(row => row.severity === 'warning').length,
    activeWithoutPayment: audited.filter(row => row.active_without_payment).length,
    down: audited.filter(row => row.operational_status === 'down').length,
  }), [audited]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es-MX');
    return audited
      .filter(row => {
        if (filter === 'critical') return row.severity === 'critical';
        if (filter === 'warning') return row.severity === 'warning';
        if (filter === 'healthy') return row.severity === 'ok';
        if (filter === 'active_without_payment') return row.active_without_payment;
        if (filter === 'active') return row.operational_status === 'active';
        if (filter === 'trial') return row.operational_status === 'trial';
        if (filter === 'down') return row.operational_status === 'down';
        return true;
      })
      .filter(row => {
        if (!normalizedSearch) return true;
        const searchable = [
          row.empresa_nombre,
          row.empresa_email,
          row.empresa_id,
          row.db_subscription?.id,
          row.db_subscription?.stripe_customer_id,
          row.db_subscription?.stripe_subscription_id,
          row.stripe_subscription?.id,
          row.stripe_subscription?.card?.last4,
        ].filter(Boolean).join(' ').toLocaleLowerCase('es-MX');
        return searchable.includes(normalizedSearch);
      })
      .filter(row => (
        isDateInRange(row.empresa_created_at, dateFilters.signupFrom, dateFilters.signupTo)
        && isDateInRange(trialEndAt(row), dateFilters.trialFrom, dateFilters.trialTo)
        && isDateInRange(subscriptionCreatedAt(row), dateFilters.subscriptionFrom, dateFilters.subscriptionTo)
      ))
      .sort((a, b) => {
        const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        return severity || a.empresa_nombre.localeCompare(b.empresa_nombre, 'es-MX');
      });
  }, [audited, dateFilters, filter, search]);

  function exportAudit() {
    const rows = filtered.map(row => ({
      empresa: row.empresa_nombre,
      correo: row.empresa_email ?? '',
      empresa_id: row.empresa_id,
      alta: row.expected.signup_date,
      fin_prueba_esperado: row.expected.trial_end,
      fin_demo_empresa: row.empresa_demo_expires_at ?? '',
      fin_prueba_rutapp: row.db_subscription?.trial_ends_at ?? '',
      fecha_hora_suscripcion: subscriptionCreatedAt(row) ?? '',
      ultima_venta: row.last_sale?.created_at ?? '',
      folio_ultima_venta: row.last_sale?.folio ?? '',
      dias_desde_ultima_venta: daysSince(row.last_sale?.created_at) ?? '',
      inicio_periodo_real: row.expected.real_period_start,
      fin_prorrateo_esperado: row.expected.first_prorated_period_end,
      primera_mensualidad_completa: row.expected.first_full_invoice_date,
      estado_rutapp: row.db_subscription?.status ?? 'sin_suscripcion',
      estado_stripe: row.stripe_subscription?.status ?? 'sin_suscripcion',
      stripe_subscription_id: row.stripe_subscription?.id ?? row.db_subscription?.stripe_subscription_id ?? '',
      stripe_customer_id: row.stripe_subscription?.customer_id ?? row.db_subscription?.stripe_customer_id ?? '',
      tarjeta: row.stripe_subscription?.card
        ? `${row.stripe_subscription.card.brand} ****${row.stripe_subscription.card.last4}`
        : '',
      pagos_stripe: row.payments.stripe_paid_count,
      pagos_rutapp: row.payments.local_paid_count,
      resultado: row.severity,
      alertas: row.findings.map(f => f.title).join(' | '),
    }));
    const headers = Object.keys(rows[0] ?? {});
    if (!headers.length) return;
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(row => headers.map(key => escape(row[key as keyof typeof row])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `auditoria-suscripciones-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const cards: Array<{ key: AuditFilter; label: string; value: number; icon: typeof ShieldCheck; color: string }> = [
    { key: 'all', label: 'Empresas auditadas', value: stats.total, icon: ShieldCheck, color: 'bg-primary' },
    { key: 'critical', label: 'Problemas críticos', value: stats.critical, icon: AlertTriangle, color: 'bg-destructive' },
    { key: 'active_without_payment', label: 'Activas sin cobro', value: stats.activeWithoutPayment, icon: CircleDollarSign, color: 'bg-orange-500' },
    { key: 'warning', label: 'Por revisar', value: stats.warning, icon: FileWarning, color: 'bg-amber-500' },
    { key: 'healthy', label: 'Sin problemas', value: stats.healthy, icon: CheckCircle2, color: 'bg-emerald-500' },
    { key: 'down', label: 'De baja', value: stats.down, icon: Ban, color: 'bg-slate-500' },
  ];

  const isColumnVisible = (column: AuditColumn) => visibleColumns.includes(column);
  const toggleColumn = (column: AuditColumn, checked: boolean) => {
    const definition = AUDIT_COLUMNS.find(item => item.key === column);
    if (definition?.essential) return;
    setVisibleColumns(current => checked
      ? [...current, column]
      : current.filter(item => item !== column));
  };
  const updateDateFilter = (key: keyof typeof dateFilters, value: string) => {
    setDateFilters(current => ({ ...current, [key]: value }));
  };
  const hasDateFilters = Object.values(dateFilters).some(Boolean);
  const clearDateFilters = () => setDateFilters({
    signupFrom: '', signupTo: '', trialFrom: '', trialTo: '', subscriptionFrom: '', subscriptionTo: '',
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-sm">Auditoría segura de solo lectura</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compara RutApp, Stripe, facturas y tarjeta. No modifica fechas, estados, cobros ni cálculos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((card, index) => (
          <button
            key={`${card.label}-${index}`}
            type="button"
            onClick={() => setFilter(card.key)}
            className="text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Card className={cn('h-full border shadow-sm transition-colors hover:border-primary/40', filter === card.key && 'border-primary')}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', card.color)}>
                  <card.icon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold leading-none tabular-nums">{card.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{card.label}</div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {(query.data?.orphan_stripe_subscriptions.length ?? 0) > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <Unplug className="h-4 w-4" />
            {query.data!.orphan_stripe_subscriptions.length} suscripción(es) activa(s) en Stripe sin empresa RutApp vinculada
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {query.data!.orphan_stripe_subscriptions.map(orphan => (
              <code key={orphan.id} className="rounded bg-background border px-2 py-1 text-[11px]">{orphan.id}</code>
            ))}
          </div>
        </div>
      )}

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="p-3 border-b flex items-center gap-2 flex-wrap">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Empresa, correo, ID Stripe o últimos 4..."
                className="pl-9 h-9"
              />
            </div>
            <AuditFilterButton active={filter === 'all'} onClick={() => setFilter('all')}>Todas</AuditFilterButton>
            <AuditFilterButton active={filter === 'critical'} onClick={() => setFilter('critical')}>Críticas</AuditFilterButton>
            <AuditFilterButton active={filter === 'warning'} onClick={() => setFilter('warning')}>Revisar</AuditFilterButton>
            <AuditFilterButton active={filter === 'active'} onClick={() => setFilter('active')}>Activas</AuditFilterButton>
            <AuditFilterButton active={filter === 'trial'} onClick={() => setFilter('trial')}>Prueba</AuditFilterButton>
            <AuditFilterButton active={filter === 'down'} onClick={() => setFilter('down')}>Baja</AuditFilterButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Columns3 className="h-3.5 w-3.5" /> Columnas ({visibleColumns.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {AUDIT_COLUMNS.map(column => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={isColumnVisible(column.key)}
                    disabled={column.essential}
                    onCheckedChange={checked => toggleColumn(column.key, checked === true)}
                    onSelect={event => event.preventDefault()}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setVisibleColumns(DEFAULT_COLUMNS)}>
                  Restaurar vista recomendada
                </Button>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportAudit} disabled={!filtered.length}>
              <Download className="h-3.5 w-3.5" /> Exportar
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} /> Actualizar
            </Button>
          </div>

          <div className="px-3 py-3 border-b bg-muted/20 grid gap-3 lg:grid-cols-3">
            <DateRangeFilter
              label="Fecha de alta"
              from={dateFilters.signupFrom}
              to={dateFilters.signupTo}
              onFromChange={value => updateDateFilter('signupFrom', value)}
              onToChange={value => updateDateFilter('signupTo', value)}
            />
            <DateRangeFilter
              label="Fin de demo"
              from={dateFilters.trialFrom}
              to={dateFilters.trialTo}
              onFromChange={value => updateDateFilter('trialFrom', value)}
              onToChange={value => updateDateFilter('trialTo', value)}
            />
            <DateRangeFilter
              label="Fecha de suscripción"
              from={dateFilters.subscriptionFrom}
              to={dateFilters.subscriptionTo}
              onFromChange={value => updateDateFilter('subscriptionFrom', value)}
              onToChange={value => updateDateFilter('subscriptionTo', value)}
            />
            {hasDateFilters && (
              <div className="lg:col-span-3 flex justify-end -mt-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearDateFilters}>Limpiar fechas</Button>
              </div>
            )}
          </div>

          {query.isError && (
            <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <div className="font-semibold">No se pudo ejecutar la auditoría</div>
              <div className="mt-1 text-xs">{query.error instanceof Error ? query.error.message : 'Error desconocido'}</div>
            </div>
          )}

          {query.isLoading ? (
            <div className="py-20 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              <div className="text-sm font-medium">Comparando RutApp con Stripe...</div>
              <div className="text-xs mt-1">Puede tardar unos segundos porque consulta suscripciones, tarjetas y facturas reales.</div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[calc(100dvh-315px)]">
              <Table className="min-w-max">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    {isColumnVisible('empresa') && <TableHead className="w-[230px]">Empresa</TableHead>}
                    {isColumnVisible('alta') && <TableHead>Fecha de alta</TableHead>}
                    {isColumnVisible('fin_demo') && <TableHead>Fin de demo</TableHead>}
                    {isColumnVisible('suscripcion') && <TableHead>Suscripción</TableHead>}
                    {isColumnVisible('ultima_venta') && <TableHead>Última venta</TableHead>}
                    {isColumnVisible('dias_sin_venta') && <TableHead className="text-center">Días sin vender</TableHead>}
                    {isColumnVisible('rutapp') && <TableHead>RutApp</TableHead>}
                    {isColumnVisible('stripe') && <TableHead>Stripe</TableHead>}
                    {isColumnVisible('periodo') && <TableHead>Periodo</TableHead>}
                    {isColumnVisible('ultimo_cobro') && <TableHead>Último cobro</TableHead>}
                    {isColumnVisible('tarjeta') && <TableHead>Tarjeta asociada</TableHead>}
                    {isColumnVisible('stripe_id') && <TableHead className="w-[245px]">ID suscripción Stripe</TableHead>}
                    {isColumnVisible('resultado') && <TableHead>Resultado</TableHead>}
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(row => (
                    <TableRow
                      key={row.empresa_id}
                      className={cn(
                        'cursor-pointer',
                        row.severity === 'critical' && 'bg-destructive/[0.035]',
                        row.severity === 'warning' && 'bg-amber-500/[0.035]',
                      )}
                      onClick={() => setSelected(row)}
                    >
                      {isColumnVisible('empresa') && <TableCell>
                        <div className="font-semibold leading-tight">{row.empresa_nombre}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">{row.empresa_email || 'Sin correo'}</div>
                        <div className="font-mono text-[9px] text-muted-foreground mt-1">{row.empresa_id}</div>
                        {row.is_partner_sandbox && <Badge variant="outline" className="mt-1 text-[9px]">Sandbox partner</Badge>}
                      </TableCell>}
                      {isColumnVisible('alta') && <TableCell className="text-xs whitespace-nowrap font-medium">{fmtDate(row.expected.signup_date)}</TableCell>}
                      {isColumnVisible('fin_demo') && <TableCell className="text-xs whitespace-nowrap">
                        <div className="font-semibold">{fmtDate(trialEndAt(row))}</div>
                        {row.db_subscription?.trial_ends_at && mexicoDateOnly(row.db_subscription.trial_ends_at) !== row.expected.trial_end && (
                          <div className="text-[10px] text-amber-700">Esperado: {fmtDate(row.expected.trial_end)}</div>
                        )}
                      </TableCell>}
                      {isColumnVisible('suscripcion') && <TableCell className="text-xs whitespace-nowrap">
                        <div className="font-semibold">{fmtDateTime(subscriptionCreatedAt(row))}</div>
                        <div className="text-[10px] text-muted-foreground">{row.stripe_subscription?.created_at ? 'Stripe' : row.db_subscription?.created_at ? 'RutApp' : 'Sin suscripción'}</div>
                      </TableCell>}
                      {isColumnVisible('ultima_venta') && <TableCell className="text-xs whitespace-nowrap">
                        {row.last_sale ? (
                          <>
                            <div className="font-semibold">{fmtDateTime(row.last_sale.created_at)}</div>
                            <div className="text-[10px] text-muted-foreground">{row.last_sale.folio || 'Sin folio'} · ${row.last_sale.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                          </>
                        ) : <span className="font-semibold text-muted-foreground">Sin ventas</span>}
                      </TableCell>}
                      {isColumnVisible('dias_sin_venta') && <TableCell className="text-center">
                        <DaysWithoutSale value={daysSince(row.last_sale?.created_at)} />
                      </TableCell>}
                      {isColumnVisible('rutapp') && <TableCell>
                        <OperationalStatusBadge row={row} />
                        {row.db_subscription?.es_manual && <div className="text-[10px] text-muted-foreground mt-1">Control manual</div>}
                        {row.db_subscription?.acceso_bloqueado && <div className="text-[10px] text-destructive mt-1">Acceso bloqueado</div>}
                      </TableCell>}
                      {isColumnVisible('stripe') && <TableCell>
                        <StripeStatusBadge status={row.stripe_subscription?.status} />
                        {row.stripe_subscription?.cancel_at_period_end && <div className="text-[10px] text-amber-700 mt-1">Cancela al cierre</div>}
                      </TableCell>}
                      {isColumnVisible('periodo') && <TableCell className="text-xs">
                        <DateLine label="Real desde" value={row.expected.real_period_start} strong />
                        <DateLine label="Prorrateo hasta" value={row.expected.first_prorated_period_end} />
                        <DateLine label="Mensual completa" value={row.expected.first_full_invoice_date} />
                      </TableCell>}
                      {isColumnVisible('ultimo_cobro') && <TableCell>
                        <PaymentCell row={row} />
                      </TableCell>}
                      {isColumnVisible('tarjeta') && <TableCell>
                        <CardCell row={row} />
                      </TableCell>}
                      {isColumnVisible('stripe_id') && <TableCell onClick={event => event.stopPropagation()}>
                        <StripeIdCell id={row.stripe_subscription?.id ?? row.db_subscription?.stripe_subscription_id} />
                        {row.stripe_subscription?.customer_id || row.db_subscription?.stripe_customer_id ? (
                          <div className="mt-1 text-[9px] text-muted-foreground font-mono truncate max-w-[225px]">
                            Cliente: {row.stripe_subscription?.customer_id ?? row.db_subscription?.stripe_customer_id}
                          </div>
                        ) : null}
                      </TableCell>}
                      {isColumnVisible('resultado') && <TableCell>
                        <SeverityBadge row={row} />
                        {row.findings[0] && (
                          <div className="text-[10px] text-muted-foreground mt-1 max-w-[180px] leading-tight">{row.findings[0].title}</div>
                        )}
                      </TableCell>}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={event => { event.stopPropagation(); setSelected(row); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && !query.isError && (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length + 1} className="py-16 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                        No hay empresas que coincidan con este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {query.data?.generated_at && (
            <div className="px-3 py-2 border-t text-[10px] text-muted-foreground">
              Resultado obtenido directamente de RutApp y Stripe el {new Date(query.data.generated_at).toLocaleString('es-MX')}.
            </div>
          )}
        </CardContent>
      </Card>

      <AuditDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AuditFilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" className="h-9" onClick={onClick}>
      {children}
    </Button>
  );
}

function DateLine({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex gap-1.5 whitespace-nowrap', muted && 'text-muted-foreground')}>
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn('tabular-nums', strong && 'font-semibold text-foreground')}>{fmtDate(value)}</span>
    </div>
  );
}

function fmtDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function DaysWithoutSale({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="outline" className="text-slate-600">Nunca</Badge>;
  return (
    <Badge variant="outline" className={cn(
      'tabular-nums whitespace-nowrap',
      value <= 7 && 'border-emerald-200 bg-emerald-50 text-emerald-700',
      value > 7 && value <= 30 && 'border-amber-200 bg-amber-50 text-amber-700',
      value > 30 && 'border-red-200 bg-red-50 text-red-700',
    )}>
      {value === 0 ? 'Hoy' : `${value} días`}
    </Badge>
  );
}

function DateRangeFilter({
  label, from, to, onFromChange, onToChange,
}: {
  label: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-foreground">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-muted-foreground mb-0.5">Desde</div>
          <Input type="date" value={from} onChange={event => onFromChange(event.target.value)} className="h-8 bg-background text-xs" />
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground mb-0.5">Hasta</div>
          <Input type="date" value={to} onChange={event => onToChange(event.target.value)} className="h-8 bg-background text-xs" />
        </div>
      </div>
    </div>
  );
}

function OperationalStatusBadge({ row }: { row: SubscriptionAuditResult }) {
  const status = row.operational_status;
  return (
    <Badge className={cn(
      'whitespace-nowrap',
      status === 'active' && 'bg-emerald-600 hover:bg-emerald-600',
      status === 'trial' && 'bg-sky-600 hover:bg-sky-600',
      status === 'past_due' && 'bg-amber-500 hover:bg-amber-500',
      (status === 'down' || status === 'no_subscription') && 'bg-slate-600 hover:bg-slate-600',
    )}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function StripeStatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline">Sin Stripe</Badge>;
  const normalized = status.toLowerCase();
  return (
    <Badge variant={['active', 'trialing'].includes(normalized) ? 'default' : ['past_due', 'unpaid'].includes(normalized) ? 'destructive' : 'outline'}>
      {STRIPE_STATUS_LABELS[normalized] || status}
    </Badge>
  );
}

function SeverityBadge({ row }: { row: SubscriptionAuditResult }) {
  if (row.severity === 'ok') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCircle2 className="h-3 w-3" /> Correcta</Badge>;
  }
  if (row.severity === 'warning') {
    return <Badge className="bg-amber-500 hover:bg-amber-500 gap-1"><Clock3 className="h-3 w-3" /> Revisar ({row.findings.length})</Badge>;
  }
  return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Crítica ({row.findings.length})</Badge>;
}

function PaymentCell({ row }: { row: SubscriptionAuditResult }) {
  const payment = row.payments.latest_stripe_paid_invoice;
  if (!payment) {
    return (
      <div>
        <div className="text-xs font-semibold text-destructive">Sin cobro Stripe</div>
        <div className="text-[10px] text-muted-foreground">RutApp: {row.payments.local_paid_count} pagada(s)</div>
      </div>
    );
  }
  return (
    <div className="text-xs whitespace-nowrap">
      <div className="font-semibold text-emerald-700">${payment.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
      <div className="text-[10px] text-muted-foreground">{fmtDate(payment.paid_at || payment.created_at)}</div>
      <div className="text-[9px] text-muted-foreground font-mono">{payment.number || payment.id}</div>
    </div>
  );
}

function CardCell({ row }: { row: SubscriptionAuditResult }) {
  const card = row.stripe_subscription?.card;
  if (row.db_subscription?.es_manual) return <span className="text-xs text-muted-foreground">Cobro manual</span>;
  if (!card) return <span className="text-xs font-semibold text-destructive">Sin tarjeta</span>;
  return (
    <div className="whitespace-nowrap">
      <div className="flex items-center gap-1.5 text-xs font-semibold"><CreditCard className="h-3.5 w-3.5" /> {CARD_BRANDS[card.brand] || card.brand} •••• {card.last4}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">Vence {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}</div>
    </div>
  );
}

function StripeIdCell({ id }: { id?: string | null }) {
  if (!id) return <span className="text-xs font-semibold text-destructive">Sin ID</span>;
  return (
    <div className="flex items-center gap-1 max-w-[230px]">
      <code className="text-[10px] truncate" title={id}>{id}</code>
      <button
        type="button"
        className="p-1 rounded hover:bg-muted shrink-0"
        title="Copiar ID"
        onClick={async () => {
          await navigator.clipboard.writeText(id);
          toast.success('ID copiado');
        }}
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

function AuditDetailDialog({ row, onClose }: { row: SubscriptionAuditResult | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {row?.empresa_nombre}
            {row && <SeverityBadge row={row} />}
          </DialogTitle>
          <DialogDescription>Diagnóstico de solo lectura entre RutApp, Stripe y facturas.</DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <AuditDateBox label="Fecha de alta" value={row.expected.signup_date} />
              <AuditDateBox label="Alta + 7 días" value={row.expected.trial_end} accent />
              <AuditDateBox label="Suscripción" value={fmtDateTime(subscriptionCreatedAt(row))} formatted />
              <AuditDateBox label="Última venta" value={row.last_sale ? fmtDateTime(row.last_sale.created_at) : 'Sin ventas'} formatted />
              <AuditDateBox label="Días sin vender" value={daysSince(row.last_sale?.created_at) === null ? 'Nunca ha vendido' : `${daysSince(row.last_sale?.created_at)} día(s)`} formatted />
              <AuditDateBox label="Fin primer prorrateo" value={row.expected.first_prorated_period_end} />
              <AuditDateBox label="Primera mensual completa" value={row.expected.first_full_invoice_date} />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="font-semibold text-sm">RutApp</div>
                <DetailLine label="ID interno" value={row.db_subscription?.id} mono />
                <DetailLine label="Creada" value={fmtDateTime(row.db_subscription?.created_at)} />
                <DetailLine label="Estado" value={row.db_subscription?.status} />
                <DetailLine label="Fin de prueba" value={fmtDate(row.db_subscription?.trial_ends_at)} />
                <DetailLine label="Periodo" value={row.db_subscription ? `${fmtDate(row.db_subscription.current_period_start)} → ${fmtDate(row.db_subscription.current_period_end || row.db_subscription.fecha_vencimiento)}` : null} />
                <DetailLine label="Bloqueada" value={row.db_subscription?.acceso_bloqueado ? 'Sí' : 'No'} />
                <DetailLine label="Pagos registrados" value={String(row.payments.local_paid_count)} />
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="font-semibold text-sm">Stripe</div>
                <DetailLine label="Suscripción" value={row.stripe_subscription?.id || row.db_subscription?.stripe_subscription_id} mono />
                <DetailLine label="Creada" value={fmtDateTime(row.stripe_subscription?.created_at)} />
                <DetailLine label="Cliente" value={row.stripe_subscription?.customer_id || row.db_subscription?.stripe_customer_id} mono />
                <DetailLine label="Estado" value={row.stripe_subscription?.status} />
                <DetailLine label="Periodo" value={row.stripe_subscription ? `${fmtDate(row.stripe_subscription.current_period_start)} → ${fmtDate(row.stripe_subscription.current_period_end)}` : null} />
                <DetailLine label="Pagos comprobados" value={String(row.payments.stripe_paid_count)} />
                <DetailLine label="Tarjeta" value={row.stripe_subscription?.card ? `${CARD_BRANDS[row.stripe_subscription.card.brand] || row.stripe_subscription.card.brand} •••• ${row.stripe_subscription.card.last4}` : 'Sin tarjeta'} />
              </div>
            </div>

            <div>
              <div className="font-semibold text-sm mb-2">Resultado de la auditoría</div>
              {row.findings.length ? (
                <div className="space-y-2">
                  {row.findings.map(finding => (
                    <div key={finding.code} className={cn(
                      'rounded-lg border px-3 py-2.5 flex items-start gap-2',
                      finding.severity === 'critical' ? 'border-destructive/40 bg-destructive/10' : 'border-amber-300 bg-amber-50',
                    )}>
                      <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', finding.severity === 'critical' ? 'text-destructive' : 'text-amber-700')} />
                      <div>
                        <div className="font-semibold text-sm">{finding.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{finding.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 flex gap-2 text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 mt-0.5" />
                  <div className="text-sm">No se detectaron contradicciones con las reglas auditadas.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditDateBox({ label, value, accent, formatted }: { label: string; value: string; accent?: boolean; formatted?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-2.5', accent && 'border-primary/40 bg-primary/5')}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{formatted ? value : fmtDate(value)}</div>
    </div>
  );
}

function DetailLine({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right break-all', mono && 'font-mono text-[10px]')}>{value || '—'}</span>
    </div>
  );
}
