import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Shield, CreditCard, CheckCircle, AlertTriangle, Loader2, Lock } from 'lucide-react';

declare global {
  interface Window {
    OpenPay: any;
  }
}

interface PaymentLink {
  id: string;
  token: string;
  empresa_nombre: string;
  plan_name: string;
  plan_amount: number;
  plan_currency: string;
  plan_repeat_unit: string;
  customer_name: string;
  customer_email: string;
  status: string;
}

interface OpenpayConfig {
  merchant_id: string;
  public_key: string;
  sandbox: boolean;
}

const unitLabels: Record<string, string> = {
  month: 'mes',
  week: 'semana',
  year: 'año',
};

export default function PagarPage() {
  const { token } = useParams<{ token: string }>();
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [opConfig, setOpConfig] = useState<OpenpayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sdkReady, setSdkReady] = useState(false);

  // Card form
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<{ subscription_id: string; card_last4: string; charge_date: string } | null>(null);

  // Load OpenPay SDK
  useEffect(() => {
    if (window.OpenPay) { setSdkReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://js.openpay.mx/openpay.v1.min.js';
    s.onload = () => setSdkReady(true);
    document.head.appendChild(s);
  }, []);

  // Fetch payment link data
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('openpay-public', {
          body: { action: 'get_link', token },
        });
        if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message || 'Error');
        setLink(data.link);
        setOpConfig(data.openpay_config);
        if (data.link.status !== 'pending') {
          setError(data.link.status === 'completed' ? 'completed' : 'expired');
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const formatCardNumber = useCallback((val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!link || !opConfig || !sdkReady) return;
    if (!cardNumber || !cardHolder || !expMonth || !expYear || !cvv) return;

    setProcessing(true);
    try {
      // 1. Initialize OpenPay SDK
      const OP = window.OpenPay;
      OP.setId(opConfig.merchant_id);
      OP.setApiKey(opConfig.public_key);
      OP.setSandboxMode(opConfig.sandbox);

      // 2. Tokenize card
      const tokenId = await new Promise<string>((resolve, reject) => {
        OP.token.create({
          card_number: cardNumber.replace(/\s/g, ''),
          holder_name: cardHolder,
          expiration_year: expYear.length === 4 ? expYear.slice(2) : expYear,
          expiration_month: expMonth.padStart(2, '0'),
          cvv2: cvv,
        }, (response: any) => resolve(response.data.id),
        (err: any) => reject(new Error(err.data?.description || 'Error al procesar la tarjeta')));
      });

      // 3. Complete payment on server
      const deviceSessionId = OP.deviceData?.setup?.() || 'browser';
      const { data, error: fnErr } = await supabase.functions.invoke('openpay-public', {
        body: {
          action: 'complete_payment',
          token: link.token,
          token_id: tokenId,
          device_session_id: deviceSessionId,
        },
      });

      if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message);

      setSuccess({
        subscription_id: data.subscription_id,
        card_last4: data.card_last4 || '****',
        charge_date: data.charge_date,
      });
    } catch (e: any) {
      setError(e.message);
      setTimeout(() => setError(''), 5000);
    } finally {
      setProcessing(false);
    }
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ─── Already completed ───
  if (error === 'completed' || success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-emerald-100 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-8 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-4">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">¡Pago Registrado!</h1>
              <p className="text-emerald-100 mt-2 text-sm">Tu suscripción ha sido activada exitosamente</p>
            </div>
            <div className="p-8 space-y-4">
              {link && (
                <>
                  <div className="flex justify-between py-3 border-b border-slate-100">
                    <span className="text-slate-500 text-sm">Servicio</span>
                    <span className="font-semibold text-slate-800">{link.plan_name}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-slate-100">
                    <span className="text-slate-500 text-sm">Monto</span>
                    <span className="font-bold text-2xl text-slate-800">${link.plan_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-sm font-normal text-slate-400">{link.plan_currency}/{unitLabels[link.plan_repeat_unit] || link.plan_repeat_unit}</span></span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-slate-100">
                    <span className="text-slate-500 text-sm">Empresa</span>
                    <span className="font-medium text-slate-700">{link.empresa_nombre}</span>
                  </div>
                </>
              )}
              {success && (
                <>
                  <div className="flex justify-between py-3 border-b border-slate-100">
                    <span className="text-slate-500 text-sm">Tarjeta</span>
                    <span className="font-mono text-slate-700">•••• {success.card_last4}</span>
                  </div>
                  {success.charge_date && (
                    <div className="flex justify-between py-3">
                      <span className="text-slate-500 text-sm">Próximo cobro</span>
                      <span className="font-medium text-slate-700">{success.charge_date}</span>
                    </div>
                  )}
                </>
              )}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center mt-4">
                <p className="text-emerald-700 text-sm font-medium">
                  Se realizará el cobro automáticamente cada periodo. Puedes cancelar en cualquier momento.
                </p>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            Powered by <span className="font-semibold">Rutapp</span> · Pagos seguros con OpenPay
          </p>
        </div>
      </div>
    );
  }

  // ─── Error / Not found ───
  if (!link || (error && error !== '')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-red-100 p-8 max-w-md w-full text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-800">Enlace no válido</h1>
          <p className="text-slate-500 text-sm">{error || 'Este enlace de pago no existe, ha expirado o ya fue utilizado.'}</p>
        </div>
      </div>
    );
  }

  // ─── Payment Form ───
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-slate-200/60 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{link.empresa_nombre}</h1>
                <p className="text-blue-200 text-xs">Pago seguro de suscripción</p>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mt-4">
              <p className="text-blue-100 text-xs uppercase tracking-wider font-medium">Plan seleccionado</p>
              <p className="text-white text-lg font-bold mt-1">{link.plan_name}</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-extrabold text-white">${link.plan_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                <span className="text-blue-200 text-sm">MXN / {unitLabels[link.plan_repeat_unit] || link.plan_repeat_unit}</span>
              </div>
            </div>
          </div>

          {/* Card Form */}
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-5 w-5 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-800">Datos de tu tarjeta</h2>
            </div>

            {/* Card Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Número de tarjeta</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="4111 1111 1111 1111"
                value={cardNumber}
                onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                maxLength={19}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-lg tracking-wider placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Holder */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre del titular</label>
              <input
                type="text"
                placeholder="COMO APARECE EN LA TARJETA"
                value={cardHolder}
                onChange={e => setCardHolder(e.target.value.toUpperCase())}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm uppercase placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Exp + CVV */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mes</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="MM"
                  maxLength={2}
                  value={expMonth}
                  onChange={e => setExpMonth(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-center text-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Año</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="AA"
                  maxLength={2}
                  value={expYear}
                  onChange={e => setExpYear(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-center text-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">CVV</label>
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="•••"
                  maxLength={4}
                  value={cvv}
                  onChange={e => setCvv(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-center text-lg placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Inline error */}
            {error && error !== 'completed' && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={processing || !sdkReady}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-base shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Procesando pago...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Suscribirme · ${link.plan_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN/{unitLabels[link.plan_repeat_unit] || link.plan_repeat_unit}
                </>
              )}
            </button>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 pt-2">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Lock className="h-3.5 w-3.5" />
                <span className="text-xs">SSL Seguro</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <Shield className="h-3.5 w-3.5" />
                <span className="text-xs">Datos encriptados</span>
              </div>
            </div>

            <p className="text-center text-xs text-slate-400 leading-relaxed">
              Al suscribirte, aceptas que se realice un cobro recurrente de <strong>${link.plan_amount} MXN</strong> cada {unitLabels[link.plan_repeat_unit] || link.plan_repeat_unit}.
              Puedes cancelar en cualquier momento contactando al equipo de {link.empresa_nombre}.
            </p>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by <span className="font-semibold">Rutapp</span> · Pagos seguros con OpenPay
        </p>
      </div>
    </div>
  );
}
