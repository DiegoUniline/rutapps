import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { Seo } from '@/components/seo/Seo';
import { BRAND, MODULES } from '@/lib/marketing-content';
import { ModuleVisual } from '@/components/landing/ModuleVisuals';

export default function ModulosPage() {
  return (
    <MarketingShell>
      <Seo
        title="Módulos de Rutapp — ERP completo para distribuidoras"
        description="10 módulos integrados: Ventas, Cobranza, Inventario, Logística, Compras, Clientes, Finanzas, Comisiones, Reportes e IA. Una sola plataforma."
        path="/modulos"
      />
      <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16" style={{ background: BRAND.surface }}>
        <div className="max-w-[1280px] mx-auto text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Módulos</span>
          <h1 className="mt-2 text-[32px] md:text-[48px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            10 módulos. <span style={{ color: BRAND.primary }}>Una sola plataforma.</span>
          </h1>
          <p className="mt-3 text-[15px] max-w-2xl mx-auto" style={{ color: BRAND.ink2 }}>
            Todo lo que tu distribuidora necesita en un solo lugar. Sin integrar 5 herramientas distintas.
          </p>
          <Link to="/signup" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[14px] text-white"
            style={{ background: BRAND.primary }}>
            Empezar gratis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="max-w-[1280px] mx-auto space-y-14 md:space-y-20">
          {MODULES.map((m, i) => {
            const Icon = m.icon;
            const flip = i % 2 === 1;
            return (
              <article key={m.slug} className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${flip ? 'md:[&>*:first-child]:order-2' : ''}`}>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-[0.14em]"
                    style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                    <Icon className="h-3 w-3" /> {m.t}
                  </div>
                  <h2 className="mt-3 text-[24px] md:text-[32px] font-semibold tracking-tight leading-tight" style={{ letterSpacing: '-0.022em' }}>
                    {m.star.t}
                  </h2>
                  <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: BRAND.ink2 }}>{m.star.d}</p>
                  <div className="mt-5 grid sm:grid-cols-2 gap-2">
                    {m.features.map(f => (
                      <div key={f} className="flex items-start gap-2 text-[13px]" style={{ color: BRAND.ink2 }}>
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={3} style={{ color: BRAND.primary }} />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 text-[13px] italic border-l-2 pl-3" style={{ color: BRAND.ink, borderColor: BRAND.accent }}>
                    "{m.why}"
                  </div>
                </div>
                <div className="rounded-2xl border p-8 grid place-items-center aspect-[4/3]" style={{ borderColor: BRAND.line, background: BRAND.surface }}>
                  <Icon className="h-24 w-24" style={{ color: BRAND.primary, opacity: 0.5 }} strokeWidth={1.2} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-20" style={{ background: BRAND.ink }}>
        <div className="max-w-[800px] mx-auto text-center text-white">
          <h2 className="text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            ¿Listo para controlar tu distribuidora?
          </h2>
          <p className="mt-3 text-[14.5px] text-white/70">7 días gratis · sin tarjeta</p>
          <Link to="/signup" className="mt-6 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-[14.5px] text-white"
            style={{ background: BRAND.primary }}>
            Empezar gratis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
