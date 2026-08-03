import { Link } from "react-router-dom";
import { Check, MessageCircle, ArrowRight, WifiOff } from "lucide-react";
import { SEO } from "./SEO";
import { waLink, SITE_URL } from "@/lib/marketing";

export interface GiroPageProps {
  slug: string; // e.g. "distribuidoras-de-abarrotes"
  giroNombre: string; // "distribuidoras de abarrotes"
  h1: string;
  subtitulo: string;
  dolores: { titulo: string; descripcion: string }[];
  beneficios: string[];
  faq?: { q: string; a: string }[];
  metaTitle?: string;
  metaDescription?: string;
}

export function GiroTemplate(p: GiroPageProps) {
  const path = `/landing-nueva/giros/${p.slug}`;
  const title = p.metaTitle || `${p.h1} | Rutapp`;
  const description =
    p.metaDescription ||
    `${p.subtitulo} Software de venta en ruta, offline y con CFDI 4.0 para ${p.giroNombre}.`;

  const faq = p.faq || [];
  const jsonLd: object[] = [];
  if (faq.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  jsonLd.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE_URL}/landing-nueva` },
      { "@type": "ListItem", position: 2, name: "Giros", item: `${SITE_URL}/landing-nueva/giros` },
      { "@type": "ListItem", position: 3, name: p.h1, item: `${SITE_URL}${path}` },
    ],
  });

  const wa = waLink(`Hola, tengo un negocio de ${p.giroNombre} y quiero probar Rutapp`);

  return (
    <>
      <SEO title={title} description={description} path={path} jsonLd={jsonLd} />
      <main className="min-h-screen bg-white text-slate-900">
        {/* Nav */}
        <header className="border-b border-slate-200 sticky top-0 bg-white/90 backdrop-blur z-40">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link to="/landing-nueva" className="font-bold text-lg">Rutapp</Link>
            <nav className="hidden md:flex gap-6 text-sm">
              <Link to="/landing-nueva#funciones">Funciones</Link>
              <Link to="/landing-nueva/giros">Giros</Link>
              <Link to="/landing-nueva/precios">Precios</Link>
              <Link to="/soporte">Soporte</Link>
            </nav>
            <div className="flex gap-2">
              <Link to="/signup" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Probar gratis</Link>
              <a href={wa} target="_blank" rel="noopener" className="px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-semibold flex items-center gap-1"><MessageCircle className="w-4 h-4" /></a>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="container mx-auto px-4 py-16 md:py-24 max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{p.h1}</h1>
          <p className="mt-6 text-lg text-slate-600">{p.subtitulo}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup" className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2">
              Probar gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <a href={wa} target="_blank" rel="noopener" className="px-6 py-3 rounded-lg bg-[#25D366] text-white font-semibold inline-flex items-center justify-center gap-2">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-500">Sin cobro hasta el día 8 · Funciona offline · CFDI 4.0</p>
        </section>

        {/* Prueba social compacta */}
        <section className="border-y border-slate-200 bg-slate-50">
          <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-600">
            <span>★ 4.8</span>
            <span>+150 negocios activos</span>
            <span className="inline-flex items-center gap-1"><WifiOff className="w-4 h-4" /> Funciona sin internet</span>
            <span>México · Colombia · Perú · Chile</span>
          </div>
        </section>

        {/* Dolores */}
        <section className="container mx-auto px-4 py-16 max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-12">Lo que te está costando dinero en {p.giroNombre}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {p.dolores.map((d, i) => (
              <div key={i} className="p-6 rounded-xl border border-slate-200 bg-white">
                <h3 className="font-semibold text-lg">{d.titulo}</h3>
                <p className="mt-2 text-sm text-slate-600">{d.descripcion}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Beneficios */}
        <section className="bg-slate-50 py-16">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-3xl font-bold text-center mb-8">Cómo lo resuelve Rutapp</h2>
            <ul className="grid md:grid-cols-2 gap-4">
              {p.beneficios.map((b, i) => (
                <li key={i} className="flex gap-3 items-start p-4 bg-white rounded-lg border border-slate-200">
                  <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        {faq.length > 0 && (
          <section className="container mx-auto px-4 py-16 max-w-3xl">
            <h2 className="text-3xl font-bold text-center mb-8">Preguntas frecuentes</h2>
            <div className="space-y-3">
              {faq.map((f, i) => (
                <details key={i} className="p-4 rounded-lg border border-slate-200 bg-white">
                  <summary className="font-semibold cursor-pointer">{f.q}</summary>
                  <p className="mt-2 text-sm text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* CTA Final */}
        <section className="bg-primary text-primary-foreground py-16">
          <div className="container mx-auto px-4 text-center max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold">Empieza hoy. Sin cobro hasta el día 8. Sin instalar nada.</h2>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/signup" className="px-6 py-3 rounded-lg bg-white text-primary font-semibold">Probar gratis</Link>
              <a href={wa} target="_blank" rel="noopener" className="px-6 py-3 rounded-lg bg-[#25D366] text-white font-semibold inline-flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-10 text-sm text-slate-600">
          <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between gap-4">
            <div>© {new Date().getFullYear()} Rutapp</div>
            <nav className="flex flex-wrap gap-4">
              <Link to="/landing-nueva/giros">Giros</Link>
              <Link to="/landing-nueva/precios">Precios</Link>
              <Link to="/soporte">Soporte</Link>
              <Link to="/privacidad">Privacidad</Link>
              <Link to="/terminos">Términos</Link>
              <a href={wa} target="_blank" rel="noopener">WhatsApp</a>
            </nav>
          </div>
        </footer>

        {/* Botón flotante WhatsApp en mobile */}
        <a
          href={wa}
          target="_blank"
          rel="noopener"
          className="md:hidden fixed bottom-4 right-4 bg-[#25D366] text-white p-4 rounded-full shadow-lg z-50"
          aria-label="WhatsApp"
        >
          <MessageCircle className="w-6 h-6" />
        </a>
      </main>
    </>
  );
}
