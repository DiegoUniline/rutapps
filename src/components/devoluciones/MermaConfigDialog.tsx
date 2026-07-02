import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, PackageX, PackageCheck } from 'lucide-react';

// Motivos del enum motivo_devolucion (mismo orden y etiquetas amables).
const MOTIVOS: { key: string; label: string; hint: string }[] = [
  { key: 'danado', label: 'Dañado', hint: 'Producto roto o maltratado' },
  { key: 'vencido', label: 'Vencido', hint: 'Pasó su fecha de venta' },
  { key: 'caducado', label: 'Caducado', hint: 'Ya no es apto para consumo' },
  { key: 'no_vendido', label: 'No vendido', hint: 'Sobró, sigue bueno' },
  { key: 'cambio', label: 'Cambio', hint: 'El cliente lo cambió por otro' },
  { key: 'error_pedido', label: 'Error de pedido', hint: 'Se surtió de más o equivocado' },
  { key: 'otro', label: 'Otro', hint: 'Cualquier otro motivo' },
];

// Defaults que usa el trigger si no hay fila (para pintar bien la primera vez).
const DEFAULT_A_MERMAS: Record<string, boolean> = {
  danado: true, vencido: true, caducado: true,
  no_vendido: false, cambio: false, error_pedido: false, otro: false,
};

export function MermaConfigDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { empresa } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // map motivo -> a_mermas
  const [config, setConfig] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !empresa?.id) return;
    setLoading(true);
    (supabase as any)
      .from('devolucion_motivo_config')
      .select('motivo, a_mermas')
      .eq('empresa_id', empresa.id)
      .then(({ data }: any) => {
        const map: Record<string, boolean> = { ...DEFAULT_A_MERMAS };
        (data || []).forEach((r: any) => { map[r.motivo] = !!r.a_mermas; });
        setConfig(map);
        setLoading(false);
      });
  }, [open, empresa?.id]);

  async function save() {
    if (!empresa?.id) return;
    setSaving(true);
    try {
      const rows = MOTIVOS.map(m => ({
        empresa_id: empresa.id,
        motivo: m.key,
        a_mermas: config[m.key] ?? DEFAULT_A_MERMAS[m.key],
        updated_at: new Date().toISOString(),
      }));
      const { error } = await (supabase as any)
        .from('devolucion_motivo_config')
        .upsert(rows, { onConflict: 'empresa_id,motivo' });
      if (error) throw error;
      toast.success('Configuración de mermas guardada');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="h-5 w-5" /> Configurar mermas
          </DialogTitle>
          <DialogDescription>
            Elige a dónde va el producto que regresa según el motivo. <strong>Mermas</strong> = almacén
            de producto NO vendible (no vuelve a venta). <strong>Vendible</strong> = regresa al inventario
            del vendedor para volver a venderse.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-1.5 py-1">
            {MOTIVOS.map(m => {
              const aMermas = config[m.key] ?? DEFAULT_A_MERMAS[m.key];
              return (
                <div key={m.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.hint}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-medium flex items-center gap-1 ${aMermas ? 'text-muted-foreground' : 'text-emerald-600'}`}>
                      <PackageCheck className="h-3.5 w-3.5" /> Vendible
                    </span>
                    <Switch
                      checked={aMermas}
                      onCheckedChange={(v) => setConfig(c => ({ ...c, [m.key]: v }))}
                    />
                    <span className={`text-[11px] font-medium flex items-center gap-1 ${aMermas ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      <PackageX className="h-3.5 w-3.5" /> Mermas
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
