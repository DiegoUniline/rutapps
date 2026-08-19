import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { TiendaProvider } from "@/tienda/TiendaContext";
import TiendaLayout from "./TiendaLayout";

export default function TiendaShell({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!slug || !ready) return null;
  return (
    <TiendaProvider slug={slug}>
      <TiendaLayout>{children}</TiendaLayout>
    </TiendaProvider>
  );
}
