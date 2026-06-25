import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { Seo } from '@/components/seo/Seo';
import { BRAND, GIROS } from '@/lib/marketing-content';

const PUNTOS = [
  'Preventa, venta directa y entrega inmediata',
  'Cobranza FIFO multi-folio con ticket térmico',
  'Inventario por almacén y por camión',
  'Ruta optimizada con GPS',
  'Funciona sin internet',
  'Tienda en línea con precios por cliente',
];

export default function GiroDetallePage() {
  const { slug } = useParams<{ slug: string }>();
  const giro = GIROS.find(g => g.slug === slug);
  if (!giro) return <Navigate to="/giros" replace />;

  const FAQ = [
    { q: `¿Rutapp sirve para ${giro.t.toLowerCase()}?`, a: `Sí. Es uno de los giros principales que atendemos: tenemos clientes activos del giro ${giro.t.toLowerCase()} operando con Rutapp.` },
    { q: '¿Cuánto tarda implementarlo?', a: 'Días, no meses. Subes tu catálogo y clientes desde Excel y arrancas.' },
    { q: '¿Funciona sin internet?', a: 'Sí. La app móvil opera 100% offline y sincroniza al recuperar señal.' },
  ];

  return (
    <MarketingShell>
      <Seo
        title={`Rutapp para ${giro.t} — ERP especializado`}
        description={`${giro.d} Preventa, ruta, cobranza, inventario e IA — todo integrado.`}
        path={`/giros/${giro.slug}`}
        jsonLd={[
          { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://rutapp.mx/' },
            { '@type': 'ListItem', position: 2, name: 'Giros', item: 'https://rutapp.mx/giros' },
            { '@type': 'ListItem', position: 3, name: giro.t, item: `https://rutapp.mx/giros/${giro.slug}` },
          ]},
          { '@context': 'https://schema.org', '@type': 'FAQPage',
            mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
        ]}
      />

      <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16" style={{ background: BRAND.surface }}>
        <div className="max-w-[1080px] mx-auto">
          <Link to="/giros" className="text-[12.5px] font-semibold" style={{ color: BRAND.primary }}>← Todos los giros</Link>
          <h1 className="mt-3 text-[32px] md:text-[48px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            Rutapp para <span style={{ color: BRAND.primary }}>{giro.t}</span>
          </h1>
          <p className="mt-3 text-[15px] max-w-2xl" style={{ color: BRAND.ink2 }}>{giro.d}</p>
          <Link to="/signup" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[14px] text-white"
            style={{ background: BRAND.primary }}>
            Probar gratis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="max-w-[1080px] mx-auto">
          <h2 className="text-[22px] md:text-[28px] font-semibold tracking-tight mb-6" style={{ letterSpacing: '-0.022em' }}>
            Lo que necesitas para tu operación
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {PUNTOS.map(p => (
              <div key={p} className="flex items-start gap-2 p-4 rounded-xl border bg-white" style={{ borderColor: BRAND.line }}>
                <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BRAND.primary }} strokeWidth={3} />
                <span className="text-[14px]" style={{ color: BRAND.ink2 }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16" style={{ background: BRAND.surface }}>
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-[22px] md:text-[28px] font-semibold tracking-tight text-center mb-6" style={{ letterSpacing: '-0.022em' }}>
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
    </MarketingShell>
  );
}
