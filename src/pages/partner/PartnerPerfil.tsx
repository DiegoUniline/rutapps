import { usePartner } from '@/hooks/usePartner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export default function PartnerPerfil() {
  const { data: partner } = usePartner();
  const { signOut } = useAuth();
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold">Mi Perfil</h1>
      <Card>
        <CardHeader><CardTitle>Datos</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Nombre:</span> <strong>{partner?.nombre}</strong></div>
          <div><span className="text-muted-foreground">Email:</span> {partner?.email || '—'}</div>
          <div><span className="text-muted-foreground">Teléfono:</span> {partner?.telefono || '—'}</div>
          <div><span className="text-muted-foreground">Comisión base:</span> <strong>{partner?.comision_pct}%</strong></div>
          <div><span className="text-muted-foreground">Slug de referido:</span> <code className="bg-muted px-2 py-0.5 rounded">{partner?.ref_slug}</code></div>
          <div><span className="text-muted-foreground">Estado:</span> {partner?.estado}</div>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
    </div>
  );
}
