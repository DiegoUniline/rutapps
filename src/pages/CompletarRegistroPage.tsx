import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CreditCard, Loader2, ShieldCheck, Sparkles, Check, LogOut, Star } from 'lucide-react';
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

function calcTotal(plan: PlanRow, qty: number) {
  if (plan.slug) {
    const extras = Math.max(0, qty - (plan.usuarios_incluidos || 0));
    return Number(plan.precio_base || 0) + extras * Number(plan.precio_extra_usuario || 0);
  }
  const subtotal = plan.precio_por_usuario * qty * plan.meses;
  return plan.descuento_pct > 0 ? subtotal * (1 - plan.descuento_pct / 100) : subtotal;
}

export default function CompletarRegistroPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signOut } = useAuth();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
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
      // Preselect from URL ?plan=slug, fallback to popular or first
      const urlPlan = searchParams.get('plan');
      const fromUrl = urlPlan ? rows.find(p => p.slug === urlPlan) : null;
      const popular = rows.find(p => p.popular);
      const chosen = fromUrl || popular || rows[0];
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
          accepted_terms: true,
        },
      });
      if (error) throw new Error(error.message || 'Error al crear el checkout');
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('No se recibió la URL de pago');
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo abrir el checkout');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-card py-8 px-4">
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

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Elige tu plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid md:grid-cols-3 gap-3">
              {plans.map(plan => {
                const isSelected = selectedPlanId === plan.id;
                const total = calcTotal(plan, Math.max(quantity, plan.usuarios_incluidos || 1));
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setQuantity(Math.max(1, plan.usuarios_incluidos || 1));
                    }}
                    className={`relative text-left rounded-xl border-2 p-4 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {plan.popular && (
                      <Badge className="absolute -top-2 right-3 bg-primary text-primary-foreground gap-1 text-[10px]">
                        <Star className="h-3 w-3 fill-current" /> Más popular
                      </Badge>
                    )}
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-base">{plan.nombre}</span>
                      {isSelected && <Check className="h-5 w-5 text-primary" />}
                    </div>
                    {plan.ideal_para && (
                      <div className="text-[11px] text-muted-foreground mb-2 leading-snug">
                        {plan.ideal_para}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Incluye {plan.usuarios_incluidos || 1} usuario{(plan.usuarios_incluidos || 1) > 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      +${plan.precio_extra_usuario} MXN / usuario extra
                    </div>
                    <div className="mt-3 text-xl font-black text-primary">
                      {fmtMoney(total)}
                      <span className="text-xs font-normal text-muted-foreground"> / mes</span>
                    </div>
                  </button>
                );
              })}
            </div>

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
                  <span className="text-primary">{fmtMoney(calcTotal(selectedPlan, quantity))}</span>
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
                      • <strong>El {format(chargeDate, 'd \'de\' MMMM', { locale: es })}</strong> se cobra automáticamente <strong>{fmtMoney(calcTotal(selectedPlan, quantity))}</strong> y arranca tu mes de servicio.
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
                  <strong>{fmtMoney(calcTotal(selectedPlan, quantity))} MXN</strong> a mi tarjeta por el plan{' '}
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
