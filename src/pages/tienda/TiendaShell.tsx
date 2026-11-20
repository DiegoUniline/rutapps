import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SincronizarPreciosCarrito, TiendaProvider } from "@/tienda/TiendaContext";
import TiendaLayout from "./TiendaLayout";

export default function TiendaShell({ children }: { children: React.ReactNode }) {
  const { slug: slugUrl } = useParams<{ slug: string }>();
  // Los slugs se guardan en minúsculas (TiendaConfigPage › slugify): un enlace
  // escrito con mayúsculas o espacios no debe dar "Tienda no encontrada".
  const slug = slugUrl?.trim().toLowerCase();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!slug || !ready) return null;
  return (
    <TiendaProvider slug={slug}>
      <SincronizarPreciosCarrito />
      <TiendaLayout>{children}</TiendaLayout>
    </TiendaProvider>
  );
}
