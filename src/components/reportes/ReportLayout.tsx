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
    <div className="space-y-6">
      {/* ─── Report Header ─── */}
      <div className="bg-card border border-border rounded-lg p-5 print:border-0 print:p-0">
        <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-[12px] text-muted-foreground">
          {empresa?.nombre && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {empresa.nombre}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDate(desde)} — {formatDate(hasta)}
          </span>
          {filters && filters.length > 0 && (
            <span className="flex items-center gap-1">
              <FilterIcon className="h-3 w-3" />
              {filters.map(f => `${f.label}: ${f.value}`).join(' · ')}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Generado: {generatedAt}</p>
      </div>

      {/* ─── Report Body ─── */}
      {children}

      {/* ─── Report Footer (Resumen General) ─── */}
      {footer}
    </div>
  );
}
