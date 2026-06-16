import { useEffect } from "react";
import { useParams } from "react-router-dom";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function FacturaRedirectPage() {
  const { folio } = useParams<{ folio: string }>();

  useEffect(() => {
    if (folio) {
      window.location.replace(
        `${SUPABASE_URL}/functions/v1/factura-redirect?folio=${encodeURIComponent(folio)}`,
      );
    }
  }, [folio]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Redirigiendo a tu factura…</h1>
      <p className="text-sm text-muted-foreground">Folio: {folio}</p>
    </div>
  );
}
