import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CreditCard, Loader2, ShieldCheck, Sparkles, Check, LogOut } from 'lucide-react';
import { fmtMoney } from '@/lib/format';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface PlanRow {
  id: string;
  nombre: string;
  periodo: string;
  meses: number;
  precio_por_usuario: number;
  descuento_pct: number;
  stripe_price_id: string | null;
  activo: boolean;
}

const MIN_USERS = 3;

export default function CompletarRegistroPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, empresa, signOut } = useAuth();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(MIN_USERS);
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
        .select('id, nombre, periodo, meses, precio_por_usuario, descuento_pct, stripe_price_id, activo')
        .eq('activo', true)
        .order('meses', { ascending: true });
      const rows = (data as PlanRow[] | null) || [];
      setPlans(rows);
      const monthly = rows.find(p => p.periodo === 'mensual') || rows[0];
      if (monthly) setSelectedPlanId(monthly.id);
      setLoading(false);
    })();
  }, []);

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || null;
  const chargeDate = addDays(new Date(), 7);

  function totalCharge(plan: PlanRow, qty: number) {
    const subtotal = plan.precio_por_usuario * qty * plan.meses;
    const discounted = plan.descuento_pct > 0
      ? subtotal * (1 - plan.descuento_pct / 100)
      : subtotal;
    return discounted;
  }

  async function handleContinue() {
    if (!selectedPlan) {
      toast.error('Selecciona un plan');
      return;
    }
    if (!accepted) {
      toast.error('Debes aceptar los términos del cobro automático');
      return;
    }
    if (quantity < MIN_USERS) {
      toast.error(`Mínimo ${MIN_USERS} usuarios`);
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
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
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

        {/* Plan selector */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Elige tu plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              {plans.map(plan => {
                const isSelected = selectedPlanId === plan.id;
                const total = totalCharge(plan, quantity);
                const ahorro = plan.descuento_pct > 0;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`text-left rounded-xl border-2 p-4 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-base">{plan.nombre}</span>
                      {isSelected && <Check className="h-5 w-5 text-primary" />}
                    </div>
                    {ahorro && (
                      <Badge variant="secondary" className="mb-2 text-xs">
                        Ahorras {plan.descuento_pct}%
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground mb-1">
                      ${plan.precio_por_usuario} MXN / usuario / mes
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {plan.meses} mes{plan.meses > 1 ? 'es' : ''} pagados por adelantado
                    </div>
                    <div className="mt-3 text-lg font-bold text-primary">
                      {fmtMoney(total)}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Cantidad de usuarios */}
            <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
              <div>
                <div className="text-sm font-semibold">Número de usuarios</div>
                <div className="text-xs text-muted-foreground">Mínimo {MIN_USERS}. Puedes cambiarlo después.</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuantity(q => Math.max(MIN_USERS, q - 1))}
                  disabled={quantity <= MIN_USERS}
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
          </CardContent>
        </Card>

        {/* Resumen + términos */}
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
                      • <strong>El {format(chargeDate, 'd \'de\' MMMM', { locale: es })}</strong> se cobra automáticamente <strong>{fmtMoney(totalCharge(selectedPlan, quantity))}</strong> y arranca tu mes de servicio.
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
                  <strong>{fmtMoney(totalCharge(selectedPlan, quantity))} MXN</strong> a mi tarjeta por el plan{' '}
                  <strong>{selectedPlan.nombre}</strong>, y que <strong>ese primer cargo no es reembolsable</strong>. Puedo cancelar en cualquier momento desde mi panel; si cancelo después del cobro conservo el acceso hasta el final del periodo pagado.
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

        {/* Salir */}
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
