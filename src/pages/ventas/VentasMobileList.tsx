import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, MessageCircle, FileText, Banknote, Loader2, Trash2 } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { MobileListCard } from '@/components/MobileListCard';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { generateVentaPdfById } from '@/lib/ventaPdfFromId';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { TIPO_LABELS, CONDICION_LABELS } from './ventasConstants';

interface Props {
  items: any[];
  clientesList: any[] | undefined;
  empresaId: string;
  canDelete: boolean;
  fmtCurrency: (v: number) => string;
  onDeleteTarget: (id: string) => void;
}

export function VentasMobileList({ items, clientesList, empresaId, canDelete, fmtCurrency, onDeleteTarget }: Props) {
  const navigate = useNavigate();
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waPdfBlob, setWaPdfBlob] = useState<Blob | null>(null);
  const [waPdfName, setWaPdfName] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  if (items.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No hay ventas. Crea la primera.</div>;
  }

  return (
    <>
      {items.map((v) => {
        const cliente = clientesList?.find(c => c.id === v.cliente_id);
        const openWa = async (e: React.MouseEvent) => {
          e.stopPropagation();
          setGeneratingPdf(v.id);
          try {
            const { blob, fileName, caption } = await generateVentaPdfById(v.id, empresaId);
            setWaPdfBlob(blob);
            setWaPdfName(fileName);
            setWaPhone(cliente?.telefono ?? '');
            setWaMessage(caption);
            setWaOpen(true);
          } catch (err: any) {
            toast.error(err.message || 'Error generando PDF');
          } finally {
            setGeneratingPdf(null);
          }
        };
        return (
          <MobileListCard
            key={v.id}
            title={v.clientes?.nombre || (v.cliente_id ? '—' : 'Público en general')}
            subtitle={`${v.folio || v.id.slice(0, 8)} · ${TIPO_LABELS[v.tipo] || v.tipo}`}
            badge={
              <div className="flex items-center gap-1">
                <StatusChip status={v.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                    <button className="p-1 rounded hover:bg-accent"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/ventas/${v.id}`); }}>
                      <FileText className="h-3.5 w-3.5 mr-2" /> Ver detalle
                    </DropdownMenuItem>
                    {v.status !== 'borrador' && v.saldo_pendiente > 0 && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cobranza`); }}>
                        <Banknote className="h-3.5 w-3.5 mr-2" /> Cobrar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={openWa} disabled={generatingPdf === v.id}>
                      {generatingPdf === v.id ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 mr-2" />}
                      {generatingPdf === v.id ? 'Generando PDF...' : 'WhatsApp'}
                    </DropdownMenuItem>
                    {(v.status === 'borrador' || (v.status === 'cancelado' && canDelete)) && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDeleteTarget(v.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
            onClick={() => navigate(`/ventas/${v.id}`)}
            fields={[
              { label: 'Fecha', value: fmtDate(v.fecha) },
              { label: 'Total', value: fmtCurrency(v.total) },
              { label: 'Condición', value: CONDICION_LABELS[v.condicion_pago] || v.condicion_pago },
              ...(v.saldo_pendiente > 0 ? [{ label: 'Saldo', value: <span className="text-warning">{fmtCurrency(v.saldo_pendiente)}</span> }] : []),
            ]}
          />
        );
      })}
      <WhatsAppPreviewDialog open={waOpen} onClose={() => { setWaOpen(false); setWaPdfBlob(null); }} phone={waPhone} message={waMessage} empresaId={empresaId} tipo="venta" pdfBlob={waPdfBlob} pdfFileName={waPdfName} />
    </>
  );
}
