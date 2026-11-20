import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ClienteCreado {
  id: string;
  nombre: string;
  codigo: string | null;
  credito: boolean;
  limite_credito: number;
  dias_credito: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nombre sugerido (p. ej. lo que se escribió en el buscador). */
  nombreInicial?: string;
  onCreated?: (cliente: ClienteCreado) => void;
}

/**
 * Alta rápida de cliente (Punto de venta y cualquier pantalla que la necesite).
 * Solo los datos básicos; el código lo asigna la BD (trg_auto_codigo_cliente). El resto se
 * completa después en la ficha del cliente.
 */
export function ClienteQuickForm({ open, onOpenChange, nombreInicial, onCreated }: Props) {
  const { empresa } = useAuth();
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rfc, setRfc] = useState('');
  const [direccion, setDireccion] = useState('');
  const [colonia, setColonia] = useState('');
  const [credito, setCredito] = useState(false);
  const [limite, setLimite] = useState('');
  const [dias, setDias] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(nombreInicial?.trim() ?? '');
    setTelefono(''); setRfc(''); setDireccion(''); setColonia('');
    setCredito(false); setLimite(''); setDias('');
  }, [open, nombreInicial]);

  const guardar = async () => {
    if (!empresa?.id) return;
    if (!nombre.trim()) { toast.error('Escribe el nombre del cliente'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('clientes').insert({
        empresa_id: empresa.id,
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        rfc: rfc.trim().toUpperCase() || null,
        direccion: direccion.trim() || null,
        colonia: colonia.trim() || null,
        credito,
        limite_credito: credito ? Number(limite) || 0 : 0,
        dias_credito: credito ? Number(dias) || 0 : 0,
        status: 'activo',
      } as any).select('id, nombre, codigo, credito, limite_credito, dias_credito').single();
      if (error) throw error;
      toast.success(`Cliente ${data.nombre} creado`);
      onCreated?.(data as ClienteCreado);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="cq-nombre">Nombre *</Label>
            <Input id="cq-nombre" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cq-tel">Teléfono</Label>
            <Input id="cq-tel" inputMode="tel" value={telefono} onChange={e => setTelefono(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cq-rfc">RFC</Label>
            <Input id="cq-rfc" value={rfc} onChange={e => setRfc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cq-dir">Dirección</Label>
            <Input id="cq-dir" value={direccion} onChange={e => setDireccion(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cq-col">Colonia</Label>
            <Input id="cq-col" value={colonia} onChange={e => setColonia(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="cq-credito" className="cursor-pointer">Vender a crédito</Label>
            <Switch id="cq-credito" checked={credito} onCheckedChange={setCredito} />
          </div>
          {credito && (
            <>
              <div className="space-y-1">
                <Label htmlFor="cq-limite">Límite de crédito</Label>
                <Input id="cq-limite" type="number" inputMode="decimal" min={0} value={limite} onChange={e => setLimite(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cq-dias">Días de crédito</Label>
                <Input id="cq-dias" type="number" inputMode="numeric" min={0} value={dias} onChange={e => setDias(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="cancelar" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving || !nombre.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ClienteQuickForm;
