import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { Seo } from '@/components/seo/Seo';
import { BRAND, CURRENCIES, PLANS, fmtCur } from '@/lib/marketing-content';

const FAQ = [
  { q: '¿Hay contrato o permanencia?', a: 'No. Cancelas cuando quieras desde el panel. Sin penalizaciones.' },
  { q: '¿Qué incluye la prueba gratis?', a: '7 días con todos los módulos abiertos, sin tarjeta de crédito.' },
  { q: '¿Puedo agregar más usuarios?', a: 'Sí. Cada usuario adicional cuesta $300 MXN/mes y se prorratea al periodo en curso.' },
  { q: '¿La IA tiene costo extra?', a: 'No. La IA está incluida en todos los planes.' },
  { q: '¿Funciona sin internet?', a: 'Sí. La app móvil opera 100% offline y sincroniza cuando vuelve la señal.' },
  { q: '¿Aceptan pagos en otras monedas?', a: 'Cobramos en MXN, USD y por transferencia local en varios países.' },
];

export default function PreciosPage() {
  const [currency, setCurrency] = useState(CURRENCIES[0]);

  return (
    <MarketingShell>
      <Seo
        title="Precios — Rutapp"
        description="Planes desde $450 MXN/mes. 7 días gratis, sin tarjeta. IA, app móvil offline y todos los módulos incluidos. Cancela cuando quieras."
        path="/precios"
        jsonLd={[{
          '@context': 'https://schema.org', '@type': 'FAQPage',
          mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
        }]}
      />

      <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16" style={{ background: BRAND.surface }}>
        <div className="max-w-[1280px] mx-auto text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Precios</span>
          <h1 className="mt-2 text-[32px] md:text-[48px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            Simple. Sin sorpresas.
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: BRAND.muted }}>7 días gratis · cancela cuando quieras</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
            {CURRENCIES.map(c => {
              const active = c.code === currency.code;
              return (
                <button key={c.code} onClick={() => setCurrency(c)}
                  className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full border"
                  style={{ background: active ? BRAND.primary : '#fff', color: active ? '#fff' : BRAND.ink2, borderColor: active ? BRAND.primary : BRAND.line }}>
                  {c.label.split(' ')[0]} {c.code}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-10">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map(p => (
            <div key={p.slug} className="relative rounded-2xl p-6 bg-white border flex flex-col"
              style={{ borderColor: p.popular ? BRAND.primary : BRAND.line, boxShadow: p.popular ? `0 20px 50px -20px ${BRAND.primary}55` : 'none' }}>
              {p.popular && (
                <div className="absolute -top-2.5 left-6 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold text-white" style={{ background: BRAND.primary }}>
                  Más popular
                </div>
              )}
              <h3 className="text-[18px] font-semibold">{p.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-tight">{fmtCur(p.price, currency)}</span>
                <span className="text-[13px]" style={{ color: BRAND.muted }}>{currency.code} /mes</span>
              </div>
              <p className="mt-1 text-[12.5px]" style={{ color: BRAND.muted }}>{p.users} usuarios · extra {fmtCur(300, currency)}/mes</p>
              <Link to="/signup" className="mt-5 w-full text-center px-4 py-2.5 rounded-lg font-semibold text-[13.5px] text-white"
                style={{ background: p.popular ? BRAND.primary : BRAND.ink }}>
                Empezar gratis
              </Link>
              <ul className="mt-5 space-y-2 flex-1">
                {['Acceso completo a los 10 módulos','App móvil offline','IA incluida','Tienda en línea','Soporte por WhatsApp','Actualizaciones automáticas'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-[13px]" style={{ color: BRAND.ink2 }}>
                    <Check className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND.primary }} strokeWidth={3} /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-14 md:py-20" style={{ background: BRAND.surface }}>
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-[24px] md:text-[32px] font-semibold tracking-tight text-center mb-8" style={{ letterSpacing: '-0.022em' }}>
            Preguntas frecuentes
          </h2>
          <div className="space-y-3">
            {FAQ.map(f => (
              <details key={f.q} className="bg-white rounded-xl border p-4" style={{ borderColor: BRAND.line }}>
                <summary className="font-semibold text-[14.5px] cursor-pointer">{f.q}</summary>
                <p className="mt-2 text-[14px]" style={{ color: BRAND.ink2 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-20" style={{ background: BRAND.ink }}>
        <div className="max-w-[800px] mx-auto text-center text-white">
          <h2 className="text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            Empieza hoy. Sin tarjeta.
          </h2>
          <Link to="/signup" className="mt-6 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-[14.5px] text-white"
            style={{ background: BRAND.primary }}>
            Probar 7 días gratis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
