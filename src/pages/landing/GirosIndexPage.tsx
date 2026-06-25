import { Link } from "react-router-dom";
import { SEO } from "@/components/landing/SEO";

const GIROS = [
  { slug: "distribuidoras-de-abarrotes", nombre: "Distribuidoras de abarrotes" },
  { slug: "refresqueras-y-bebidas", nombre: "Refresqueras y bebidas" },
  { slug: "panaderias-y-reparto", nombre: "Panaderías y reparto" },
  { slug: "productos-de-limpieza", nombre: "Productos de limpieza" },
  { slug: "lacteos-y-cremerias", nombre: "Lácteos y cremerías" },
  { slug: "botanas-y-dulces", nombre: "Botanas y dulces" },
  { slug: "agua-purificada", nombre: "Agua purificada" },
];

export default function GirosIndexPage() {
  return (
    <>
      <SEO
        title="Software de venta en ruta por giro | Rutapp"
        description="Sistema de preventa, reparto y cobranza offline para distribuidoras, refresqueras, panaderías, agua purificada y más."
        path="/landing-nueva/giros"
      />
      <main className="min-h-screen bg-white text-slate-900">
        <header className="border-b border-slate-200 py-4">
          <div className="container mx-auto px-4 flex justify-between items-center">
            <Link to="/landing-nueva" className="font-bold">Rutapp</Link>
            <Link to="/landing-nueva/precios" className="text-sm">Precios</Link>
          </div>
        </header>
        <section className="container mx-auto px-4 py-16 max-w-5xl">
          <h1 className="text-4xl font-bold text-center">Rutapp para tu giro</h1>
          <p className="text-center text-slate-600 mt-4">Elige tu industria y mira cómo Rutapp resuelve los dolores específicos de tu negocio.</p>
          <div className="grid md:grid-cols-3 gap-4 mt-12">
            {GIROS.map((g) => (
              <Link
                key={g.slug}
                to={`/landing-nueva/giros/${g.slug}`}
                className="p-6 rounded-xl border border-slate-200 hover:border-primary hover:shadow-sm transition bg-white"
              >
                <h2 className="font-semibold text-lg">{g.nombre}</h2>
                <p className="text-sm text-slate-500 mt-2">Ver solución →</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
