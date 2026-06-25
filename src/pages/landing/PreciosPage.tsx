import { Link } from "react-router-dom";
import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { SEO } from "@/components/landing/SEO";
import { waLink } from "@/lib/marketing";

const FEATURES = [
  "Venta en ruta y preventa",
  "Cobranza con tickets térmicos",
  "Inventario por camión y almacén",
  "CFDI 4.0 incluido",
  "Funciona offline",
  "App móvil para vendedores",
  "Tienda en línea para tus clientes",
  "Soporte y actualizaciones para siempre",
];

const PLANES = [
  { nombre: "Starter", desc: "1 vendedor en ruta", mensual: 499, anual: 4990, popular: false },
  { nombre: "Pro", desc: "Hasta 5 vendedores + tienda en línea", mensual: 1499, anual: 14990, popular: true },
  { nombre: "Business", desc: "Vendedores ilimitados + multi-sucursal", mensual: 2999, anual: 29990, popular: false },
];

export default function PreciosPage() {
  const [anual, setAnual] = useState(false);
  const wa = waLink("Hola, quiero información sobre los planes de Rutapp");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Rutapp",
    description: "Software de venta en ruta y reparto para PyMEs",
    offers: PLANES.map((p) => ({
      "@type": "Offer",
      name: p.nombre,
      price: anual ? p.anual : p.mensual,
      priceCurrency: "MXN",
    })),
  };

  return (
    <>
      <SEO
        title="Precios de Rutapp — Planes desde $499/mes"
        description="Planes mensuales y anuales de Rutapp. Sin contratos forzosos, sin hardware, con actualizaciones y soporte incluidos."
        path="/landing-nueva/precios"
        jsonLd={jsonLd}
      />
      <main className="min-h-screen bg-white text-slate-900">
        <header className="border-b border-slate-200 py-4">
          <div className="container mx-auto px-4 flex justify-between items-center">
            <Link to="/landing-nueva" className="font-bold">Rutapp</Link>
            <Link to="/landing-nueva/giros" className="text-sm">Giros</Link>
          </div>
        </header>

        <section className="container mx-auto px-4 py-16 max-w-6xl">
          <h1 className="text-4xl font-bold text-center">Precios claros. Sin sorpresas.</h1>
          <p className="text-center text-slate-600 mt-4">Actualizaciones y soporte incluidos para siempre. Cancela cuando quieras.</p>

          <div className="mt-8 flex justify-center">
            <div className="inline-flex p-1 rounded-lg bg-slate-100">
              <button onClick={() => setAnual(false)} className={`px-4 py-2 rounded-md text-sm font-semibold ${!anual ? "bg-white shadow" : ""}`}>Mensual</button>
              <button onClick={() => setAnual(true)} className={`px-4 py-2 rounded-md text-sm font-semibold ${anual ? "bg-white shadow" : ""}`}>Anual <span className="text-primary">(2 meses gratis)</span></button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {PLANES.map((p) => (
              <div key={p.nombre} className={`p-6 rounded-2xl border bg-white ${p.popular ? "border-primary border-2 shadow-lg" : "border-slate-200"}`}>
                {p.popular && <div className="text-xs font-bold text-primary mb-2">RECOMENDADO</div>}
                <h2 className="text-xl font-bold">{p.nombre}</h2>
                <p className="text-sm text-slate-600 mt-1">{p.desc}</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold">${(anual ? p.anual / 12 : p.mensual).toLocaleString("es-MX")}</span>
                  <span className="text-slate-500"> /mes</span>
                </div>
                {anual && <p className="text-xs text-slate-500">Facturado anual: ${p.anual.toLocaleString("es-MX")}</p>}
                <Link to="/signup" className={`mt-6 block text-center px-4 py-3 rounded-lg font-semibold ${p.popular ? "bg-primary text-primary-foreground" : "bg-slate-900 text-white"}`}>
                  Probar gratis
                </Link>
                <a href={wa} target="_blank" rel="noopener" className="mt-2 block text-center px-4 py-3 rounded-lg font-semibold bg-[#25D366] text-white">
                  <MessageCircle className="w-4 h-4 inline mr-1" /> WhatsApp
                </a>
                <ul className="mt-6 space-y-2 text-sm">
                  {FEATURES.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-slate-500 mt-10">Precios en MXN + IVA. Cambia de plan en cualquier momento.</p>
        </section>
      </main>
    </>
  );
}
