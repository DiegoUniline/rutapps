import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
  onExcel: () => void;
  onPDF?: () => void;
  label?: string;
}

export function ExportButton({ onExcel, onPDF, label = 'Exportar' }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border font-medium transition-colors"
        style={{ backgroundColor: '#217346', borderColor: '#1a5c38', color: '#fff' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a5c38')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#217346')}
      >
        <Download className="h-3.5 w-3.5" />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[160px]">
          <button
            onClick={() => { onExcel(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Excel (.xlsx)
          </button>
          {onPDF && (
            <button
              onClick={() => { onPDF(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-t border-border"
            >
              <FileText className="h-4 w-4 text-red-500" />
              PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}
