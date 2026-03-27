import { useAuth } from '@/contexts/AuthContext';
import { Calendar, Building2, Filter as FilterIcon } from 'lucide-react';

interface ReportLayoutProps {
  title: string;
  desde: string;
  hasta: string;
  filters?: { label: string; value: string }[];
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ReportLayout({ title, desde, hasta, filters, children, footer }: ReportLayoutProps) {
  const { empresa } = useAuth();
  const now = new Date();
  const generatedAt = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* ─── Report Header — matches ReporteDiario style ─── */}
      <div className="bg-card border border-border rounded-lg p-4 print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            {empresa?.nombre && (
              <div className="text-[11px] text-muted-foreground font-medium">{empresa.nombre}</div>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {formatDate(desde)} — {formatDate(hasta)}
            </div>
          </div>
        </div>
        {filters && filters.length > 0 && (
          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
            <FilterIcon className="h-3 w-3" />
            {filters.map(f => `${f.label}: ${f.value}`).join(' · ')}
          </div>
        )}
        <p className="text-[9px] text-muted-foreground/50 mt-1">Generado: {generatedAt}</p>
      </div>

      {/* ─── Report Body ─── */}
      {children}

      {/* ─── Report Footer (Resumen General) ─── */}
      {footer}
    </div>
  );
}
