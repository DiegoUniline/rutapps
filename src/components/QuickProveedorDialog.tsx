import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName?: string;
  onCreated: (proveedor: { id: string; nombre: string; dias_credito: number; condicion_pago: string }) => void;
}

/** Alta rápida de proveedor desde el formulario de compra. */
export default function QuickProveedorDialog({ open, onOpenChange, initialName = '', onCreated }: Props) {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(initialName);
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [rfc, setRfc] = useState('');
  const [condicionPago, setCondicionPago] = useState<'contado' | 'credito'>('contado');
  const [diasCredito, setDiasCredito] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setNombre(initialName); setContacto(''); setTelefono(''); setEmail(''); setRfc(''); setCondicionPago('contado'); setDiasCredito(0); } }, [open, initialName]);

  const handleSave = async () => {
    if (!empresa?.id) return;
    if (!nombre.trim()) { toast.error('Escribe el nombre del proveedor'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('proveedores').insert({
        empresa_id: empresa.id,
        nombre: nombre.trim(),
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        rfc: rfc.trim() || null,
        condicion_pago: condicionPago,
        dias_credito: condicionPago === 'credito' ? diasCredito : 0,
      } as any).select('id, nombre, dias_credito, condicion_pago').single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor creado');
      onCreated({ id: (data as any).id, nombre: (data as any).nombre, dias_credito: (data as any).dias_credito ?? 0, condicion_pago: (data as any).condicion_pago ?? 'contado' });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'No se pudo crear el proveedor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
          <DialogDescription>Créalo aquí mismo y se selecciona en la compra.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del proveedor" autoFocus />
          </div>
          <div><Label>Contacto</Label><Input value={contacto} onChange={e => setContacto(e.target.value)} /></div>
          <div><Label>Teléfono</Label><Input value={telefono} onChange={e => setTelefono(e.target.value)} /></div>
          <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><Label>RFC</Label><Input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} /></div>
          <div>
            <Label>Condición de pago</Label>
            <Select value={condicionPago} onValueChange={v => setCondicionPago(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contado">Contado</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {condicionPago === 'credito' && (
            <div><Label>Días de crédito</Label><Input type="number" min={0} value={diasCredito} onChange={e => setDiasCredito(Math.max(0, Number(e.target.value) || 0))} /></div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Crear proveedor</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
