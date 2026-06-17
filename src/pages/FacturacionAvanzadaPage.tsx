import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Receipt, Users, Download, Mail, ShieldCheck, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import {
  ComplementosPagoSection,
  FacturaGlobalSection,
  DescargaMasivaSection,
  ReenvioCorreoSection,
  ValidarRfcSection,
  SustituirCfdiSection,
} from '@/components/facturacion/FacturacionAvanzadaTab';

type SectionDef = {
  key: string;
  title: string;
  description: string;
  Icon: typeof Receipt;
  Component: React.ComponentType;
};

const SECTIONS: SectionDef[] = [
  { key: 'pagos',     title: 'Complementos de Pago (REP)', description: 'Emite Pago 2.0 cuando cobras una factura PPD.', Icon: Receipt,      Component: ComplementosPagoSection },
  { key: 'global',    title: 'Factura Global',             description: 'Agrupa ventas a público en general por periodo.', Icon: Users,        Component: FacturaGlobalSection },
  { key: 'masiva',    title: 'Descarga Masiva',            description: 'Descarga XML y PDF de un periodo en un ZIP.',     Icon: Download,     Component: DescargaMasivaSection },
  { key: 'correo',    title: 'Reenvío por correo',         description: 'Envía un CFDI timbrado al correo del cliente.',   Icon: Mail,         Component: ReenvioCorreoSection },
  { key: 'rfc',       title: 'Validar RFC',                description: 'Valida RFC, razón social y CP fiscal en el SAT.', Icon: ShieldCheck,  Component: ValidarRfcSection },
  { key: 'sustituir', title: 'Sustituir CFDI',             description: 'Cancela y re-timbra con relación 04 (sustitución).', Icon: RefreshCw, Component: SustituirCfdiSection },
];

export default function FacturacionAvanzadaPage() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const isSuperAdmin = useIsSuperAdmin();

  if (!isSuperAdmin) return <Navigate to="/facturacion-cfdi" replace />;

  const active = SECTIONS.find(s => s.key === section);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(active ? '/facturacion-cfdi/avanzado' : '/facturacion-cfdi')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {active ? 'Avanzado' : 'Facturación'}
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {active ? active.title : 'Facturación Avanzada'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {active ? active.description : 'Operaciones avanzadas de CFDI 4.0 (solo super admin).'}
          </p>
        </div>
      </div>

      {active ? (
        <active.Component />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTIONS.map(({ key, title, description, Icon }) => (
            <Card
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/facturacion-cfdi/avanzado/${key}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/facturacion-cfdi/avanzado/${key}`); }}
              className="cursor-pointer hover:border-primary hover:shadow-sm transition"
            >
              <CardContent className="p-4 flex gap-3 items-start">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
