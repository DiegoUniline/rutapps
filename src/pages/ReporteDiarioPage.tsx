import { lazy, Suspense } from 'react';

const ReporteDiarioRuta = lazy(() => import('@/components/reportes/ReporteDiarioRuta'));

export default function ReporteDiarioPage() {
  return (
    <div className="p-4 min-h-full">
      <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>}>
        <ReporteDiarioRuta />
      </Suspense>
    </div>
  );
}
