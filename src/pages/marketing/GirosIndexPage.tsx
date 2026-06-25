import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { Seo } from '@/components/seo/Seo';
import { BRAND, GIROS } from '@/lib/marketing-content';

export default function GirosIndexPage() {
  return (
    <MarketingShell>
      <Seo
        title="Rutapp por giro — ERP especializado para tu distribuidora"
        description="Soluciones específicas para abarrotes, refresqueras, panaderías, lácteos, botanas, agua purificada y productos de limpieza."
        path="/giros"
      />

      <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16" style={{ background: BRAND.surface }}>
        <div className="max-w-[1080px] mx-auto text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Giros</span>
          <h1 className="mt-2 text-[32px] md:text-[48px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            Hecho para tu giro.
          </h1>
          <p className="mt-3 text-[15px] max-w-2xl mx-auto" style={{ color: BRAND.ink2 }}>
            Rutapp se adapta a cómo opera tu distribuidora — desde preventa de abarrotes hasta retorno de envases de agua.
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {GIROS.map(g => (
            <Link key={g.slug} to={`/giros/${g.slug}`}
              className="rounded-2xl border bg-white p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
              style={{ borderColor: BRAND.line }}>
              <h2 className="text-[18px] font-semibold" style={{ color: BRAND.ink }}>{g.t}</h2>
              <p className="mt-2 text-[13.5px]" style={{ color: BRAND.ink2 }}>{g.d}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: BRAND.primary }}>
                Ver más <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
