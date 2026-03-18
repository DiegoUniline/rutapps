import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeft, AlertTriangle, Heart, Frown, DollarSign, Headphones,
  Puzzle, Sparkles, Check, X, Loader2, Gift, ShieldCheck, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Survey Reasons ─── */
const REASONS = [
  { id: 'costo', icon: DollarSign, label: 'Muy caro', desc: 'El precio no se ajusta a mi presupuesto' },
  { id: 'funciones', icon: Puzzle, label: 'Faltan funciones', desc: 'No tiene lo que necesito para mi negocio' },
  { id: 'soporte', icon: Headphones, label: 'Soporte deficiente', desc: 'No recibí la ayuda que necesitaba' },
  { id: 'otro_sistema', icon: ShieldCheck, label: 'Cambié de sistema', desc: 'Encontré otra solución que se adapta mejor' },
] as const;

/* ─── Steps ─── */
type Step = 'survey' | 'detail' | 'offer' | 'confirm' | 'done';

export default function CancelSubscriptionPage() {
  const navigate = useNavigate();
  const { user, empresa } = useAuth();

  const [step, setStep] = useState<Step>('survey');
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [offerAccepted, setOfferAccepted] = useState(false);

  const selectedReason = REASONS.find(r => r.id === reason);

  /* ─── Accept discount offer ─── */
  async function handleAcceptOffer() {
    setSaving(true);
    try {
      // Save cancellation request as retained
      // @ts-ignore - table may not be in generated types yet
      await (supabase as any).from('cancellation_requests').insert({
        empresa_id: empresa!.id,
        user_id: user!.id,
        reason,
        reason_detail: detail || null,
        offered_discount: true,
        discount_accepted: true,
        cancelled: false,
      });

      // Apply discount via edge function
      const { data, error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'apply_retention_discount', reason, reason_detail: detail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setOfferAccepted(true);
      setStep('done');
      toast.success('¡Descuento aplicado! Gracias por quedarte con nosotros 🎉');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  /* ─── Confirm cancellation ─── */
  async function handleConfirmCancel() {
    setSaving(true);
    try {
      // @ts-ignore - table may not be in generated types yet
      await (supabase as any).from('cancellation_requests').insert({
        empresa_id: empresa!.id,
        user_id: user!.id,
        reason,
        reason_detail: detail || null,
        offered_discount: true,
        discount_accepted: false,
        cancelled: true,
      });

      const { data, error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'cancel_subscription', reason, reason_detail: detail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setStep('done');
      toast.success('Tu suscripción ha sido cancelada');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/mi-suscripcion')} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-bold text-foreground">Cancelar suscripción</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* ═══ STEP 1: Survey ═══ */}
        {step === 'survey' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                <Frown className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Sentimos que te vayas</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Antes de continuar, ayúdanos a entender qué podemos mejorar. Tu opinión es muy valiosa para nosotros.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REASONS.map(r => {
                const Icon = r.icon;
                const selected = reason === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setReason(r.id)}
                    className={cn(
                      'flex items-start gap-3.5 p-4 rounded-xl border-2 text-left transition-all',
                      selected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-muted-foreground/30 bg-card',
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                      selected ? 'bg-primary/10' : 'bg-muted',
                    )}>
                      <Icon className={cn('h-5 w-5', selected ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <div>
                      <p className={cn('text-sm font-semibold', selected ? 'text-foreground' : 'text-foreground/80')}>
                        {r.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{r.desc}</p>
                    </div>
                    {selected && (
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5 ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => navigate('/mi-suscripcion')}
                className="px-4 py-2.5 text-sm font-medium text-muted-foreground rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Mejor no
              </button>
              <button
                onClick={() => reason && setStep('detail')}
                disabled={!reason}
                className={cn(
                  'px-5 py-2.5 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-all',
                  reason
                    ? 'bg-foreground text-background hover:opacity-90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                Continuar <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: Detail ═══ */}
        {step === 'detail' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                {selectedReason && <selectedReason.icon className="h-7 w-7 text-foreground" />}
              </div>
              <h2 className="text-xl font-bold text-foreground">Cuéntanos más</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Seleccionaste: <span className="font-semibold text-foreground">{selectedReason?.label}</span>.
                ¿Hay algo más que nos quieras compartir?
              </p>
            </div>

            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="Opcional: comparte más detalles sobre tu experiencia..."
              rows={4}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />

            <div className="flex justify-between gap-2 pt-2">
              <button
                onClick={() => setStep('survey')}
                className="px-4 py-2.5 text-sm font-medium text-muted-foreground rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep('offer')}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-foreground text-background hover:opacity-90 transition-all flex items-center gap-1.5"
              >
                Continuar <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Retention Offer ═══ */}
        {step === 'offer' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Hero offer card */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-primary/5">
              {/* Decorative sparkles */}
              <div className="absolute top-4 right-4 opacity-20">
                <Sparkles className="h-20 w-20 text-primary" />
              </div>

              <div className="relative p-6 sm:p-8 space-y-5">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">Oferta especial para ti</span>
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">
                    <span className="text-primary">15% de descuento</span><br />
                    en tu próxima mensualidad
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    Sabemos que cada negocio tiene desafíos diferentes. Queremos darte una razón para quedarte y seguir
                    creciendo juntos. Este descuento se aplicará automáticamente a tu siguiente cobro.
                  </p>
                </div>

                {/* Benefits */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    'Descuento aplicado automáticamente',
                    'Sin compromiso adicional',
                    'Mantén todas tus funciones',
                    'Soporte prioritario incluido',
                  ].map(benefit => (
                    <div key={benefit} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-xs text-foreground/80">{benefit}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={handleAcceptOffer}
                    disabled={saving}
                    className="flex-1 bg-primary text-primary-foreground font-bold text-sm rounded-xl py-3.5 px-6 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                    ¡Sí, me quedo con el descuento!
                  </button>
                  <button
                    onClick={() => setStep('confirm')}
                    disabled={saving}
                    className="flex-1 border border-border text-muted-foreground font-medium text-sm rounded-xl py-3.5 px-6 hover:bg-muted transition-all"
                  >
                    No, quiero cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Final Confirmation ═══ */}
        {step === 'confirm' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground">¿Estás seguro?</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Tu suscripción seguirá activa hasta el final del periodo actual.
                Después de eso <span className="font-semibold text-foreground">perderás acceso</span> a todas las funciones del sistema.
              </p>
            </div>

            {/* What you lose */}
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-destructive">Lo que pierdes al cancelar</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Acceso a rutas y ventas',
                  'Control de inventario',
                  'Reportes y análisis',
                  'Facturación electrónica',
                  'App móvil para vendedores',
                  'Historial de datos',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2">
                    <X className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <span className="text-xs text-foreground/70">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => setStep('offer')}
                className="flex-1 bg-primary text-primary-foreground font-bold text-sm rounded-xl py-3 px-6 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <Heart className="h-4 w-4" /> Mejor me quedo
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={saving}
                className="flex-1 border border-destructive/30 text-destructive font-medium text-sm rounded-xl py-3 px-6 hover:bg-destructive/5 transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Confirmar cancelación
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 5: Done ═══ */}
        {step === 'done' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 text-center py-8">
            {offerAccepted ? (
              <>
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-2xl font-extrabold text-foreground">¡Bienvenido de vuelta! 🎉</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Tu <span className="font-semibold text-primary">15% de descuento</span> se aplicará automáticamente
                  en tu próximo cobro. Gracias por confiar en nosotros — seguiremos trabajando para mejorar tu experiencia.
                </p>
                <button
                  onClick={() => navigate('/mi-suscripcion')}
                  className="bg-primary text-primary-foreground font-semibold text-sm rounded-xl py-3 px-8 hover:bg-primary/90 transition-all inline-flex items-center gap-2 mx-auto"
                >
                  <Check className="h-4 w-4" /> Volver a Mi Suscripción
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Frown className="h-10 w-10 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Suscripción cancelada</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Tu acceso continuará hasta el final del periodo actual. Si cambias de opinión,
                  siempre puedes reactivar tu suscripción desde la página de suscripciones.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="border border-border text-foreground font-medium text-sm rounded-xl py-3 px-8 hover:bg-muted transition-all inline-flex items-center gap-2 mx-auto"
                >
                  Ir al inicio
                </button>
              </>
            )}
          </div>
        )}

        {/* Progress dots */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-2 pt-8">
            {(['survey', 'detail', 'offer', 'confirm'] as Step[]).map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  step === s ? 'w-6 bg-primary' : 'w-1.5 bg-border',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
