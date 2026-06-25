import { GiroTemplate } from "@/components/landing/GiroTemplate";
export default function BotanasPage() {
  return (
    <GiroTemplate
      slug="botanas-y-dulces"
      giroNombre="botanas y dulces"
      h1="Software para distribuidores de botanas, frituras y dulces"
      subtitulo="Catálogos grandes, displays por tiendita y rotación clara por SKU."
      dolores={[
        { titulo: "SKUs que no rotan", descripcion: "Productos olvidados en el camión y tú gastando en reposición que no necesitas." },
        { titulo: "Vendedores que no facturan", descripcion: "Tienditas pidiendo factura y el vendedor no sabe cómo emitirla." },
        { titulo: "Robo hormiga", descripcion: "Cajas que 'se pierden' entre el almacén y el camión sin trazabilidad." },
      ]}
      beneficios={[
        "Rotación por SKU y ABC automático",
        "Carga del camión con conteo doble (almacén → unidad)",
        "Facturación CFDI 4.0 al instante desde móvil",
        "Cierre de ruta con efectivo esperado vs real",
        "Promociones nxm para empujar SKUs lentos",
        "Funciona offline",
      ]}
    />
  );
}
