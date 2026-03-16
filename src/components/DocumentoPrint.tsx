/**
 * DocumentoPrint — Reusable base for all printable documents (Odoo-style)
 * 
 * Usage:
 *   <DocumentoPrint
 *     docType="Factura"
 *     folio="FAC-001"
 *     empresa={empresa}
 *     actions={<Button onClick={...}>Enviar</Button>}
 *   >
 *     {children}
 *   </DocumentoPrint>
 */
import React, { useRef, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DocumentoPrintProps {
  /** Document type label, e.g. "Factura", "Remisión" */
  docType: string;
  /** Folio / reference */
  folio?: string;
  /** Date string */
  fecha?: string;
  /** Status badge */
  status?: ReactNode;
  /** Company info */
  empresa?: {
    nombre: string;
    razon_social?: string | null;
    rfc?: string | null;
    direccion?: string | null;
    colonia?: string | null;
    ciudad?: string | null;
    estado?: string | null;
    cp?: string | null;
    telefono?: string | null;
    email?: string | null;
    logo_url?: string | null;
  };
  /** Extra action buttons shown in the floating bar */
  actions?: ReactNode;
  /** Document body content */
  children: ReactNode;
}

export function DocumentoPrint({
  docType,
  folio,
  fecha,
  status,
  empresa,
  actions,
  children,
}: DocumentoPrintProps) {
  const docRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* ─── Floating action bar (hidden on print) ─── */}
      <div className="no-print fixed top-4 right-4 z-50 flex items-center gap-2 bg-background/90 backdrop-blur border border-border rounded-lg shadow-sm px-3 py-2">
        <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs gap-1.5">
          <Printer className="h-3.5 w-3.5" />
          Imprimir
        </Button>
        {actions}
      </div>

      {/* ─── Printable document ─── */}
      <div ref={docRef} className="documento mx-auto bg-white text-[#1a1a1a]" style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', maxWidth: '210mm' }}>

        {/* ─── Header ─── */}
        <div className="flex justify-between items-start pb-4 mb-5" style={{ borderBottom: '2px solid #e0e0e0' }}>
          {/* Left: Logo + Company */}
          <div className="flex items-center gap-3">
            {empresa?.logo_url && (
              <img
                src={empresa.logo_url}
                alt="Logo"
                style={{ height: '44px', objectFit: 'contain' }}
              />
            )}
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>
                {empresa?.razon_social || empresa?.nombre || 'Mi Empresa'}
              </div>
              {empresa?.rfc && (
                <div className="doc-detail">{empresa.rfc}</div>
              )}
              {(empresa?.direccion || empresa?.ciudad) && (
                <div className="doc-detail">
                  {[empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado, empresa.cp].filter(Boolean).join(', ')}
                </div>
              )}
              {empresa?.telefono && <div className="doc-detail">Tel: {empresa.telefono}</div>}
              {empresa?.email && <div className="doc-detail">{empresa.email}</div>}
            </div>
          </div>

          {/* Right: Doc type + Folio */}
          <div className="text-right">
            <div className="doc-tipo">{docType}</div>
            {folio && <div className="doc-folio">{folio}</div>}
            {fecha && <div className="doc-detail" style={{ marginTop: '4px' }}>{fecha}</div>}
            {status && <div style={{ marginTop: '6px' }}>{status}</div>}
          </div>
        </div>

        {/* ─── Body ─── */}
        {children}

        {/* ─── Footer ─── */}
        <div className="mt-10 pt-3 text-center" style={{ borderTop: '1px solid #e0e0e0', fontSize: '9px', color: '#aaa' }}>
          Este documento es una representación impresa. Generado por Rutapp.
        </div>
      </div>

      {/* ─── Embedded print styles ─── */}
      <style>{`
        .documento .doc-tipo {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
        }
        .documento .doc-folio {
          font-size: 14px;
          font-weight: 600;
          color: #555;
        }
        .documento .doc-detail {
          font-size: 10px;
          color: #777;
          line-height: 1.5;
        }

        /* ─── Info sections ─── */
        .documento .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        .documento .info-label {
          font-weight: 600;
          color: #555;
          min-width: 120px;
          font-size: 10px;
        }
        .documento .info-value {
          font-weight: 500;
          font-size: 11px;
        }
        .documento .info-row {
          display: flex;
          gap: 8px;
          padding: 3px 0;
        }

        /* ─── Table ─── */
        .documento table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
        }
        .documento thead th {
          font-weight: 700;
          font-size: 10px;
          background: #f7f7f7;
          border-bottom: 2px solid #e0e0e0;
          padding: 8px 12px;
          text-align: left;
          color: #333;
          text-transform: none;
          letter-spacing: 0;
        }
        .documento tbody td {
          padding: 7px 12px;
          border-bottom: 1px solid #eeeeee;
          vertical-align: top;
          font-size: 11px;
        }
        .documento tbody tr:last-child td {
          border-bottom: none;
        }
        .documento .text-right { text-align: right; }
        .documento .text-center { text-align: center; }
        .documento .font-mono { font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 10px; }

        /* ─── Totals ─── */
        .documento .totales-row {
          display: flex;
          justify-content: flex-end;
          gap: 24px;
          padding: 3px 12px;
          font-size: 11px;
        }
        .documento .totales-label {
          font-weight: 600;
          color: #555;
          text-align: right;
          min-width: 100px;
        }
        .documento .totales-value {
          min-width: 90px;
          text-align: right;
          font-weight: 500;
        }
        .documento .total-final {
          font-weight: 700;
          font-size: 13px;
          border-top: 2px solid #1a1a1a;
          padding-top: 6px;
          margin-top: 4px;
        }

        /* ─── Amount in words ─── */
        .documento .importe-letra {
          font-size: 10px;
          font-weight: 600;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          border-top: 1px solid #e0e0e0;
          border-bottom: 1px solid #e0e0e0;
          padding: 6px;
          margin: 12px 0;
          color: #333;
        }

        /* ─── Signatures ─── */
        .documento .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 48px;
        }
        .documento .sign-line {
          border-top: 1px solid #aaa;
          padding-top: 6px;
          text-align: center;
          font-size: 10px;
          color: #888;
          margin-top: 48px;
        }

        /* ─── Print media ─── */
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: white !important; }
          .documento { padding: 20mm 15mm; font-size: 10px; max-width: none; box-shadow: none; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }

        /* ─── Screen styling ─── */
        @media screen {
          .documento {
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            border: 1px solid #eee;
            border-radius: 4px;
            margin: 20px auto;
          }
        }
      `}</style>
    </>
  );
}

/**
 * Helper sub-components for consistent info sections
 */
export function DocInfoGrid({ children }: { children: ReactNode }) {
  return <div className="info-grid">{children}</div>;
}

export function DocInfoBlock({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function DocInfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value || '—'}</span>
    </div>
  );
}

export function DocTotalsBlock({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: '8px' }}>{children}</div>;
}

export function DocTotalRow({ label, value, isFinal }: { label: string; value: string; isFinal?: boolean }) {
  return (
    <div className={`totales-row ${isFinal ? 'total-final' : ''}`}>
      <span className="totales-label">{label}</span>
      <span className="totales-value">{value}</span>
    </div>
  );
}
