import { GiroTemplate } from "@/components/landing/GiroTemplate";
export default function AbarrotesPage() {
  return (
    <GiroTemplate
      slug="distribuidoras-de-abarrotes"
      giroNombre="distribuidoras de abarrotes"
      h1="Sistema de venta en ruta para distribuidoras de abarrotes"
      subtitulo="Tus vendedores levantan pedidos, cobran y entregan sin papel — aunque el changarro no tenga señal."
      dolores={[
        { titulo: "Pedidos perdidos en la libreta", descripcion: "Notas mal anotadas, descuentos inventados y devoluciones que nadie registra." },
        { titulo: "No sabes qué hay en cada camión", descripcion: "Caja faltante al final del día y nadie sabe en qué tienda quedó." },
        { titulo: "Cobranza dispersa", descripcion: "Pagos en efectivo sin folio, clientes que dicen 'ya pagué' y tú no tienes prueba." },
      ]}
      beneficios={[
        "Catálogo con miles de SKUs y listas de precios por cliente",
        "Inventario por camión con kardex en vivo",
        "Cobranza con ticket térmico y firma del cliente",
        "Facturación CFDI 4.0 al cierre del día",
        "Reportes de utilidad por vendedor y por ruta",
        "Funciona offline en colonias sin señal",
      ]}
      faq={[
        { q: "¿Funciona sin internet en zonas rurales?", a: "Sí. La app guarda todo localmente y sincroniza cuando vuelve la señal." },
        { q: "¿Maneja listas de precios diferenciadas?", a: "Sí, ilimitadas. Cada cliente puede tener su propia lista o regla de descuento." },
        { q: "¿Emite facturas CFDI?", a: "Sí, CFDI 4.0 con PAC integrado. Tus vendedores facturan desde la calle." },
      ]}
    />
  );
}
