import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CreditCard, Loader2, ShieldCheck, Sparkles, LogOut, Star } from 'lucide-react';
import { fmtMoney } from '@/lib/currency';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface PlanRow {
  id: string;
  nombre: string;
  periodo: string;
  meses: number;
  precio_por_usuario: number;
  precio_base: number;
  usuarios_incluidos: number;
  precio_extra_usuario: number;
  slug: string | null;
  orden: number;
  popular: boolean;
  ideal_para: string | null;
  capacitacion_sesiones: number;
  descuento_pct: number;
  stripe_price_id: string | null;
  activo: boolean;
}

type BillingPeriod = 'mensual' | 'semestral' | 'anual';

const PERIOD_DISCOUNT: Record<BillingPeriod, number> = {
  mensual: 0,
  semestral: 10,
  anual: 15,
};

const PERIOD_MONTHS: Record<BillingPeriod, number> = {
  mensual: 1,
  semestral: 6,
  anual: 12,
};

function calcMonthly(plan: PlanRow, qty: number) {
  const extras = Math.max(0, qty - (plan.usuarios_incluidos || 0));
  return Number(plan.precio_base || 0) + extras * Number(plan.precio_extra_usuario || 0);
}

function calcTotalWithPeriod(plan: PlanRow, qty: number, period: BillingPeriod) {
  const monthly = calcMonthly(plan, qty);
  const disc = PERIOD_DISCOUNT[period];
  return disc > 0 ? monthly * (1 - disc / 100) : monthly;
}

function calcCargoPorPeriodo(plan: PlanRow, qty: number, period: BillingPeriod) {
  return calcTotalWithPeriod(plan, qty, period) * PERIOD_MONTHS[period];
}


export default function CompletarRegistroPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signOut } = useAuth();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(() => {
    const fromUrl = searchParams.get('periodo') as BillingPeriod | null;
    if (fromUrl && fromUrl in PERIOD_DISCOUNT) return fromUrl;
    try {
      const saved = localStorage.getItem('rutapp_billing_period') as BillingPeriod | null;
      if (saved && saved in PERIOD_DISCOUNT) return saved;
    } catch { /* ignore */ }
    return 'mensual';
  });

  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get('canceled')) {
      toast.info('Pago no completado. Selecciona tu plan e inténtalo de nuevo.');
    }
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('id, nombre, periodo, meses, precio_por_usuario, precio_base, usuarios_incluidos, precio_extra_usuario, slug, orden, popular, ideal_para, capacitacion_sesiones, descuento_pct, stripe_price_id, activo')
        .eq('activo', true)
        .order('orden', { ascending: true });
      const rows = (data as PlanRow[] | null) || [];
      setPlans(rows);
      // Preselect from URL ?plan=slug, fallback to localStorage, popular, or first
      const urlPlan = searchParams.get('plan');
      let storedPlan: string | null = null;
      try { storedPlan = localStorage.getItem('rutapp_selected_plan'); } catch {}
      const fromUrl = urlPlan ? rows.find(p => p.slug === urlPlan) : null;
      const fromStorage = !fromUrl && storedPlan ? rows.find(p => p.slug === storedPlan) : null;
      const popular = rows.find(p => p.popular);
      const chosen = fromUrl || fromStorage || popular || rows[0];
      if (chosen) {
        setSelectedPlanId(chosen.id);
        setQuantity(Math.max(1, chosen.usuarios_incluidos || 1));
      }
      setLoading(false);
    })();
  }, [searchParams]);

  const selectedPlan = useMemo(() => plans.find(p => p.id === selectedPlanId) || null, [plans, selectedPlanId]);
  const minQty = selectedPlan ? Math.max(1, selectedPlan.usuarios_incluidos || 1) : 1;
  const extras = selectedPlan ? Math.max(0, quantity - (selectedPlan.usuarios_incluidos || 0)) : 0;
  const chargeDate = addDays(new Date(), 7);

  // Keep quantity at least minQty when plan changes
  useEffect(() => {
    if (quantity < minQty) setQuantity(minQty);
  }, [minQty]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleContinue() {
    if (!selectedPlan) {
      toast.error('Selecciona un plan');
      return;
    }
    if (!accepted) {
      toast.error('Debes aceptar los términos del cobro automático');
      return;
    }
    if (quantity < minQty) {
      toast.error(`Mínimo ${minQty} usuario${minQty > 1 ? 's' : ''}`);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-trial-checkout', {
        body: {
          plan_id: selectedPlan.id,
          quantity,
          billing_period: billingPeriod,
          accepted_terms: true,
        },
      });
      if (error) throw new Error(error.message || 'Error al crear el checkout');
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('No se recibió la URL de pago');
      // Open Stripe Checkout in a new tab — required when running inside an iframe (preview)
      // because Stripe blocks iframe embedding (X-Frame-Options: DENY).
      const popup = window.open(data.url, '_blank');
      if (!popup) {
        // Popup blocked → fallback to top-level redirect
        if (window.top) {
          window.top.location.href = data.url;
        } else {
          window.location.href = data.url;
        }
      } else {
        toast.success('Se abrió el checkout en una nueva pestaña');
        setSubmitting(false);
      }
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo abrir el checkout');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-card py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <img
            src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png"
            alt="Rutapp"
            className="h-14 w-14 mx-auto rounded-xl object-contain"
          />
          <h1 className="text-2xl md:text-3xl font-black">Activa tu prueba de 7 días gratis</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Capturas tu tarjeta una sola vez. Tienes <strong>7 días completos</strong> para probar todo. Si te encanta, no haces nada y se cobra automáticamente. Si no, cancelas con un clic y no se cobra nada.
          </p>
        </div>

        {/* Resumen del plan elegido (solo lectura) */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Plan seleccionado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedPlan && (
              <div className="rounded-xl border-2 border-primary bg-primary/5 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-lg">{selectedPlan.nombre}</span>
                  {selectedPlan.popular && (
                    <Badge className="bg-primary text-primary-foreground gap-1 text-[10px]">
                      <Star className="h-3 w-3 fill-current" /> Más popular
                    </Badge>
                  )}
                </div>
                {selectedPlan.ideal_para && (
                  <div className="text-xs text-muted-foreground mb-2">{selectedPlan.ideal_para}</div>
                )}
                <div className="text-2xl font-black text-primary">
                  {fmtMoney(calcTotalWithPeriod(selectedPlan, quantity, billingPeriod))}
                  <span className="text-sm font-normal text-muted-foreground"> / mes</span>
                  {PERIOD_DISCOUNT[billingPeriod] > 0 && (
                    <span className="ml-2 text-xs font-bold text-emerald-600">
                      -{PERIOD_DISCOUNT[billingPeriod]}%
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Incluye {selectedPlan.usuarios_incluidos || 1} usuario{(selectedPlan.usuarios_incluidos || 1) > 1 ? 's' : ''}
                  {selectedPlan.precio_extra_usuario > 0 && ` · +${fmtMoney(selectedPlan.precio_extra_usuario)} MXN / extra`}
                </div>
              </div>
            )}

            {/* Selector de periodo de facturación */}
            {selectedPlan && (
              <div className="space-y-2">
                <div className="text-sm font-semibold">Periodo de facturación</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['mensual', 'semestral', 'anual'] as BillingPeriod[]).map(p => {
                    const isActive = billingPeriod === p;
                    const disc = PERIOD_DISCOUNT[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setBillingPeriod(p)}
                        className={`relative rounded-lg border-2 p-3 text-center transition ${
                          isActive ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
                        }`}
                      >
                        <div className="text-sm font-bold capitalize">{p}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {p === 'mensual' ? 'Cobro cada mes' : `Cobro cada ${PERIOD_MONTHS[p]} meses`}
                        </div>
                        {disc > 0 && (
                          <span className="absolute -top-2 -right-2 bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            -{disc}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {PERIOD_DISCOUNT[billingPeriod] > 0 ? (
                    <>
                      El descuento de <strong>-{PERIOD_DISCOUNT[billingPeriod]}%</strong> se aplica al precio de <strong>cada mes</strong>
                      {' '}({fmtMoney(calcMonthly(selectedPlan, quantity))} → {fmtMoney(calcTotalWithPeriod(selectedPlan, quantity, billingPeriod))} / mes),
                      pero <strong>el cobro se realiza en una sola exhibición por {PERIOD_MONTHS[billingPeriod]} meses</strong>:{' '}
                      <strong>{fmtMoney(calcCargoPorPeriodo(selectedPlan, quantity, billingPeriod))} MXN</strong> cada {PERIOD_MONTHS[billingPeriod]} meses.
                    </>
                  ) : (
                    <>Se cobra {fmtMoney(calcMonthly(selectedPlan, quantity))} MXN cada mes. Semestral y Anual reducen el precio mensual (-10% / -15%) y el cobro se hace por todo el periodo contratado.</>
                  )}
                </p>

              </div>
            )}

            {/* Cantidad de usuarios */}
            {selectedPlan && (
              <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
                <div>
                  <div className="text-sm font-semibold">Número de usuarios</div>
                  <div className="text-xs text-muted-foreground">
                    El plan {selectedPlan.nombre} incluye {selectedPlan.usuarios_incluidos || 1}. Mínimo {minQty}.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setQuantity(q => Math.max(minQty, q - 1))}
                    disabled={quantity <= minQty}
                  >
                    −
                  </Button>
                  <span className="font-bold text-lg w-8 text-center">{quantity}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setQuantity(q => q + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
            )}

            {/* Desglose */}
            {selectedPlan && selectedPlan.slug && (
              <div className="rounded-lg border bg-card p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Base {selectedPlan.nombre} ({selectedPlan.usuarios_incluidos} incluidos)</span>
                  <span className="font-medium">{fmtMoney(selectedPlan.precio_base)}</span>
                </div>
                {extras > 0 && (
                  <div className="flex justify-between">
                    <span>{extras} usuario{extras > 1 ? 's' : ''} extra × {fmtMoney(selectedPlan.precio_extra_usuario)}</span>
                    <span className="font-medium">{fmtMoney(extras * selectedPlan.precio_extra_usuario)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t font-bold text-sm">
                  <span>Total mensual</span>
                  <span className="text-primary">{fmtMoney(calcTotalWithPeriod(selectedPlan, quantity, billingPeriod))}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedPlan && (
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-6 w-6 text-primary shrink-0 mt-1" />
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-foreground">Cómo funciona:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• <strong>Hoy:</strong> capturas tu tarjeta (no se cobra nada).</li>
                    <li>• <strong>7 días:</strong> usas Rutapp completo y gratis.</li>
                    <li>
                      • <strong>El {format(chargeDate, 'd \'de\' MMMM', { locale: es })}</strong> se cobra automáticamente <strong>{fmtMoney(calcTotalWithPeriod(selectedPlan, quantity, billingPeriod))}</strong> y arranca tu mes de servicio.
                    </li>
                    <li>• Puedes cancelar en cualquier momento desde tu panel.</li>
                  </ul>
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg bg-card border">
                <Checkbox
                  checked={accepted}
                  onCheckedChange={(v) => setAccepted(!!v)}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed">
                  Acepto que inicio mis 7 días de prueba gratis. Entiendo que el{' '}
                  <strong>{format(chargeDate, 'd \'de\' MMMM \'de\' yyyy', { locale: es })}</strong> se cobrará automáticamente{' '}
                  <strong>{fmtMoney(calcTotalWithPeriod(selectedPlan, quantity, billingPeriod))} MXN</strong> a mi tarjeta por el plan{' '}
                  <strong>{selectedPlan.nombre}</strong>, y que <strong>ese primer cargo no es reembolsable</strong>. Puedo cancelar en cualquier momento desde mi panel.
                </span>
              </label>

              <Button
                className="w-full h-12 text-base font-semibold"
                onClick={handleContinue}
                disabled={!accepted || submitting}
              >
                {submitting ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Abriendo pago seguro…</>
                ) : (
                  <><CreditCard className="h-5 w-5 mr-2" /> Capturar tarjeta y comenzar prueba</>
                )}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                Pago procesado de forma segura por Stripe. No guardamos tu tarjeta en nuestros servidores.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await signOut(); navigate('/login'); }}
          >
            <LogOut className="h-4 w-4 mr-1" /> Salir y continuar después
          </Button>
        </div>
      </div>
    </div>
  );
}
