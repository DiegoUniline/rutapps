import { GiroTemplate } from "@/components/landing/GiroTemplate";
export default function LimpiezaPage() {
  return (
    <GiroTemplate
      slug="productos-de-limpieza"
      giroNombre="productos de limpieza"
      h1="ERP de venta en ruta para distribuidores de limpieza y químicos"
      subtitulo="Catálogo grande, presentaciones múltiples y precios por mayoreo, todo desde el celular del vendedor."
      dolores={[
        { titulo: "Catálogo enredado", descripcion: "Mismos productos en distintas presentaciones y el vendedor cobra mal." },
        { titulo: "Crédito sin control", descripcion: "Le sigues vendiendo a tiendas que ya rebasaron su límite y no pagan." },
        { titulo: "Inventario sin visibilidad", descripcion: "No sabes qué bidones quedan en cada camión." },
      ]}
      beneficios={[
        "Productos a granel y por presentación (caja, bidón, garrafa)",
        "Validación de crédito en tiempo real",
        "Listas de precios por mayoreo y por cliente",
        "Inventario por almacén y por camión",
        "Reportes de utilidad por línea de producto",
        "CFDI 4.0 desde la unidad",
      ]}
    />
  );
}
