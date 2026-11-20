import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, FileText, Banknote, Trash2, Ban } from 'lucide-react';
import { ListaTarjetaMovil, ListaTarjetasMovil, type TonoPildora } from '@/components/layout/ListaTarjetaMovil';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { generateVentaPdfById } from '@/lib/ventaPdfFromId';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

import { isVentaEntregadaParcial } from '@/lib/ventaEntregaParcial';
import { saldoRealVenta, totalEfectivoVenta } from '@/lib/ventaCerrada';

interface Props {
  items: any[];
  clientesList: any[] | undefined;
  empresaId: string;
  canDelete: boolean;
  fmtCurrency: (v: number) => string;
  onDeleteTarget: (id: string) => void;
  onCancelTarget?: (id: string) => void;
  /** Total de ventas del filtro y «Cargar más» (teléfono). */
  total?: number;
  onCargarMas?: () => void;
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', confirmado: 'Confirmada', entregado: 'Entregada', entregado_parcial: 'Entrega parcial',
  facturado: 'Facturada', cancelado: 'Cancelada',
};
const ESTADO_TONO: Record<string, TonoPildora> = {
  borrador: 'neutro', confirmado: 'primario', entregado: 'exito', entregado_parcial: 'aviso', facturado: 'exito', cancelado: 'peligro',
};

export function VentasMobileList({ items, clientesList, empresaId, canDelete, fmtCurrency, onDeleteTarget, onCancelTarget, total, onCargarMas }: Props) {
  const navigate = useNavigate();
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waPdfBlob, setWaPdfBlob] = useState<Blob | null>(null);
  const [waPdfName, setWaPdfName] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  return (
    <>
      <ListaTarjetasMovil
        vacia={items.length === 0}
        mensajeVacio="No hay ventas. Crea la primera."
        mostrados={items.length}
        total={total ?? items.length}
        onCargarMas={onCargarMas}
      >
      {items.map((v) => {
        const cliente = clientesList?.find(c => c.id === v.cliente_id);
        const openWa = async () => {
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
        const estado = isVentaEntregadaParcial(v) ? 'entregado_parcial' : v.status;
        const saldo = saldoRealVenta(v);
        return (
          <ListaTarjetaMovil
            key={v.id}
            titulo={v.clientes?.nombre || (v.cliente_id ? '—' : 'Público en general')}
            linea2={<>
              {fmtCurrency(totalEfectivoVenta(v))} · {fmtDate(v.fecha ?? v.created_at)}
              <span className="text-xs"> · {v.folio || v.id.slice(0, 8)}</span>
              {saldo > 0 && v.status !== 'cancelado' && <span className="text-warning"> · Saldo {fmtCurrency(saldo)}</span>}
            </>}
            pildora={ESTADO_LABEL[estado] ?? estado}
            tono={ESTADO_TONO[estado] ?? 'neutro'}
            onClick={() => navigate(`/ventas/${v.id}`)}
            acciones={[
              { key: 'ver', label: 'Ver detalle', icon: FileText, onClick: () => navigate(`/ventas/${v.id}`) },
              ...(v.status !== 'borrador' && saldo > 0 ? [{ key: 'cobrar', label: 'Cobrar', icon: Banknote, onClick: () => navigate(`/ventas/cobranza`, { state: { clienteId: v.cliente_id, ventaId: v.id } }) }] : []),
              { key: 'wa', label: generatingPdf === v.id ? 'Generando PDF...' : 'WhatsApp', icon: MessageCircle, disabled: generatingPdf === v.id, onClick: openWa },
              ...(onCancelTarget && canDelete && v.status !== 'borrador' && v.status !== 'cancelado' ? [{ key: 'cancelar', label: 'Cancelar', icon: Ban, destructiva: true, separar: true, onClick: () => onCancelTarget(v.id) }] : []),
              ...((v.status === 'borrador' || (v.status === 'cancelado' && canDelete)) ? [{ key: 'eliminar', label: 'Eliminar', icon: Trash2, destructiva: true, onClick: () => onDeleteTarget(v.id) }] : []),
            ]}
          />
        );
      })}
      </ListaTarjetasMovil>
      <WhatsAppPreviewDialog open={waOpen} onClose={() => { setWaOpen(false); setWaPdfBlob(null); }} phone={waPhone} message={waMessage} empresaId={empresaId} tipo="venta" pdfBlob={waPdfBlob} pdfFileName={waPdfName} />
    </>
  );
}
