import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Sparkles, Package, Users, Boxes, CheckCircle2, ArrowRight,
  Loader2, Wand2, PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Step = 0 | 1 | 2 | 3 | 4;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ProductoParsed {
  nombre: string;
  codigo: string;
  precio: number;
  unidad: string;
  categoria_sugerida?: string;
}
interface ClienteParsed {
  nombre: string;
  telefono?: string;
  direccion?: string;
  colonia?: string;
  contacto?: string;
}

export default function PrimerosPasosModal({ open, onOpenChange }: Props) {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);

  // Producto
  const [prodText, setProdText] = useState('');
  const [prodParsed, setProdParsed] = useState<ProductoParsed | null>(null);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodSaving, setProdSaving] = useState(false);
  const [prodId, setProdId] = useState<string | null>(null);

  // Cliente
  const [cliText, setCliText] = useState('');
  const [cliParsed, setCliParsed] = useState<ClienteParsed | null>(null);
  const [cliLoading, setCliLoading] = useState(false);
  const [cliSaving, setCliSaving] = useState(false);

  // Stock
  const [stockQty, setStockQty] = useState<string>('10');
  const [stockSaving, setStockSaving] = useState(false);

  const empresaId = empresa?.id;

  const parseWithAI = async (
    tipo: 'producto' | 'cliente',
    texto: string,
  ) => {
    const { data, error } = await supabase.functions.invoke('onboarding-parse', {
      body: { tipo, texto },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return (data as any).data;
  };

  const handleParseProd = async () => {
    if (!prodText.trim()) return;
    setProdLoading(true);
    try {
      const d = await parseWithAI('producto', prodText);
      setProdParsed({
        nombre: d.nombre ?? '',
        codigo: (d.codigo ?? '').toString().toUpperCase().slice(0, 12) || 'PROD-001',
        precio: Number(d.precio) || 0,
        unidad: d.unidad ?? 'Pieza',
        categoria_sugerida: d.categoria_sugerida,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude interpretar el texto');
    } finally {
      setProdLoading(false);
    }
  };

  const handleSaveProd = async () => {
    if (!prodParsed || !empresaId) return;
    setProdSaving(true);
    try {
      // Get default warehouse & unit
      const [{ data: alm }, { data: uniMatch }, { data: uniFallback }] = await Promise.all([
        supabase.from('almacenes').select('id').eq('empresa_id', empresaId).limit(1).maybeSingle(),
        supabase.from('unidades').select('id').eq('empresa_id', empresaId).ilike('nombre', prodParsed.unidad).maybeSingle(),
        supabase.from('unidades').select('id').eq('empresa_id', empresaId).limit(1).maybeSingle(),
      ]);
      const unidadId = uniMatch?.id ?? uniFallback?.id ?? null;
      const almacenes = alm?.id ? [alm.id] : [];

      const { data: prod, error } = await supabase
        .from('productos')
        .insert({
          empresa_id: empresaId,
          codigo: prodParsed.codigo,
          nombre: prodParsed.nombre,
          precio_principal: prodParsed.precio,
          unidad_venta_id: unidadId,
          unidad_compra_id: unidadId,
          almacenes,
          status: 'activo',
        })
        .select('id')
        .single();
      if (error) throw error;
      setProdId(prod.id);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['setup-check'] });
      qc.invalidateQueries({ queryKey: ['setup-complete'] });
      toast.success('Producto creado');
      setStep(2);
    } catch (e: any) {
      toast.error(e?.message?.includes('duplicate') ? 'Ya existe un producto con ese código' : (e?.message ?? 'Error al guardar'));
    } finally {
      setProdSaving(false);
    }
  };

  const handleParseCli = async () => {
    if (!cliText.trim()) return;
    setCliLoading(true);
    try {
      const d = await parseWithAI('cliente', cliText);
      setCliParsed({
        nombre: d.nombre ?? '',
        telefono: d.telefono ?? '',
        direccion: d.direccion ?? '',
        colonia: d.colonia ?? '',
        contacto: d.contacto ?? '',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude interpretar el texto');
    } finally {
      setCliLoading(false);
    }
  };

  const handleSaveCli = async () => {
    if (!cliParsed || !empresaId) return;
    setCliSaving(true);
    try {
      const { error } = await supabase.from('clientes').insert({
        empresa_id: empresaId,
        nombre: cliParsed.nombre,
        telefono: cliParsed.telefono || null,
        direccion: cliParsed.direccion || null,
        colonia: cliParsed.colonia || null,
        contacto: cliParsed.contacto || null,
        status: 'activo',
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['setup-check'] });
      qc.invalidateQueries({ queryKey: ['setup-complete'] });
      toast.success('Cliente creado');
      setStep(3);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar');
    } finally {
      setCliSaving(false);
    }
  };

  const handleSaveStock = async () => {
    if (!prodId || !empresaId || !user?.id) {
      setStep(4);
      return;
    }
    const qty = Number(stockQty);
    if (!qty || qty <= 0) {
      setStep(4);
      return;
    }
    setStockSaving(true);
    try {
      const { data: alm } = await supabase
        .from('almacenes').select('id').eq('empresa_id', empresaId).limit(1).maybeSingle();
      if (!alm?.id) throw new Error('No hay almacén configurado');

      const { error } = await supabase.from('ajustes_inventario').insert({
        empresa_id: empresaId,
        producto_id: prodId,
        almacen_id: alm.id,
        cantidad_anterior: 0,
        cantidad_nueva: qty,
        diferencia: qty,
        motivo: 'SAL- Stock inicial (Primeros Pasos)',
        user_id: user.id,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Stock inicial registrado');
      setStep(4);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar stock');
    } finally {
      setStockSaving(false);
    }
  };

  const dismiss = async () => {
    if (empresaId) {
      await supabase.from('empresas').update({ onboarding_completado: true }).eq('id', empresaId);
      localStorage.setItem(`primeros_pasos_dismissed_${empresaId}`, '1');
    }
    onOpenChange(false);
  };

  const finish = async (goto?: string) => {
    if (empresaId) {
      await supabase.from('empresas').update({ onboarding_completado: true }).eq('id', empresaId);
      localStorage.setItem(`primeros_pasos_completed_${empresaId}`, '1');
    }
    onOpenChange(false);
    if (goto) navigate(goto);
  };

  // reset step when reopened
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const nombre = empresa?.nombre || 'tu negocio';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-[95vw] sm:max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header progress */}
        <div className="bg-primary px-4 py-3 sm:px-6 sm:py-4 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-base sm:text-lg font-bold">Primeros pasos</h2>
          </div>
          <div className="flex gap-1.5 mt-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-all',
                  i <= step ? 'bg-white' : 'bg-white/30'
                )}
              />
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {step === 0 && (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <PartyPopper className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                ¡Bienvenido a Rutapp!
              </h3>
              <p className="text-sm text-muted-foreground">
                Te voy a ayudar a dejar listo <strong>{nombre}</strong> en 3 pasos súper fáciles.
                Lo describes en tus propias palabras y yo lo armo por ti.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2">
                <Mini icon={Package} label="Producto" />
                <Mini icon={Users} label="Cliente" />
                <Mini icon={Boxes} label="Stock" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-3">
                <Button onClick={() => setStep(1)} className="w-full" size="lg">
                  Empezar <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
                <Button onClick={dismiss} variant="outline" className="w-full" size="lg">
                  Más tarde
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Header icon={Package} title="Tu primer producto" subtitle="Descríbelo como se lo dirías a un amigo" />
              {!prodParsed ? (
                <>
                  <Textarea
                    placeholder="Ej: Coca-Cola de 600ml a 18 pesos"
                    value={prodText}
                    onChange={e => setProdText(e.target.value)}
                    rows={3}
                    className="text-base"
                  />
                  <Button
                    onClick={handleParseProd}
                    disabled={!prodText.trim() || prodLoading}
                    className="w-full"
                    size="lg"
                  >
                    {prodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="mr-2 h-4 w-4" /> Interpretar con AI</>}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Revísalo y edita si hace falta:</p>
                  <div className="space-y-3">
                    <Field label="Nombre">
                      <Input value={prodParsed.nombre} onChange={e => setProdParsed({ ...prodParsed, nombre: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Código">
                        <Input value={prodParsed.codigo} onChange={e => setProdParsed({ ...prodParsed, codigo: e.target.value })} />
                      </Field>
                      <Field label="Precio">
                        <Input type="number" step="0.01" value={prodParsed.precio} onChange={e => setProdParsed({ ...prodParsed, precio: Number(e.target.value) })} />
                      </Field>
                    </div>
                    <Field label="Unidad">
                      <Input value={prodParsed.unidad} onChange={e => setProdParsed({ ...prodParsed, unidad: e.target.value })} />
                    </Field>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Button variant="outline" onClick={() => setProdParsed(null)} className="w-full">
                      Reescribir
                    </Button>
                    <Button onClick={handleSaveProd} disabled={prodSaving} className="w-full">
                      {prodSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Guardar <ArrowRight className="ml-1 h-4 w-4" /></>}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Header icon={Users} title="Tu primer cliente" subtitle="Cuéntame de él en tus palabras" />
              {!cliParsed ? (
                <>
                  <Textarea
                    placeholder="Ej: Abarrotes Don Pepe, está en la colonia Centro, su tel es 81 1234 5678"
                    value={cliText}
                    onChange={e => setCliText(e.target.value)}
                    rows={3}
                    className="text-base"
                  />
                  <Button onClick={handleParseCli} disabled={!cliText.trim() || cliLoading} className="w-full" size="lg">
                    {cliLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="mr-2 h-4 w-4" /> Interpretar con AI</>}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Revísalo y edita si hace falta:</p>
                  <div className="space-y-3">
                    <Field label="Nombre del cliente">
                      <Input value={cliParsed.nombre} onChange={e => setCliParsed({ ...cliParsed, nombre: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Teléfono">
                        <Input value={cliParsed.telefono ?? ''} onChange={e => setCliParsed({ ...cliParsed, telefono: e.target.value })} />
                      </Field>
                      <Field label="Colonia">
                        <Input value={cliParsed.colonia ?? ''} onChange={e => setCliParsed({ ...cliParsed, colonia: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Dirección">
                      <Input value={cliParsed.direccion ?? ''} onChange={e => setCliParsed({ ...cliParsed, direccion: e.target.value })} />
                    </Field>
                    <Field label="Contacto (opcional)">
                      <Input value={cliParsed.contacto ?? ''} onChange={e => setCliParsed({ ...cliParsed, contacto: e.target.value })} />
                    </Field>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Button variant="outline" onClick={() => setCliParsed(null)} className="w-full">
                      Reescribir
                    </Button>
                    <Button onClick={handleSaveCli} disabled={cliSaving} className="w-full">
                      {cliSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Guardar <ArrowRight className="ml-1 h-4 w-4" /></>}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Header icon={Boxes} title="Stock inicial" subtitle="¿Cuántas piezas tienes en almacén?" />
              <div className="rounded-lg border border-border p-4 bg-card">
                <p className="text-sm font-medium text-foreground">{prodParsed?.nombre}</p>
                <p className="text-xs text-muted-foreground mb-3">{prodParsed?.codigo}</p>
                <Field label="Cantidad disponible">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={stockQty}
                    onChange={e => setStockQty(e.target.value)}
                    className="text-lg"
                  />
                </Field>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setStep(4)} className="w-full">
                  Sin stock por ahora
                </Button>
                <Button onClick={handleSaveStock} disabled={stockSaving} className="w-full">
                  {stockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Guardar stock <ArrowRight className="ml-1 h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">¡Ya puedes vender! 🎉</h3>
              <p className="text-sm text-muted-foreground">
                Tu negocio quedó listo con un producto, un cliente y stock inicial.
                Puedes seguir agregando más cuando quieras.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => finish('/pos')} size="lg" className="w-full">
                  Ir al POS y vender <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
                <Button onClick={() => finish()} variant="outline" size="lg" className="w-full">
                  Seguir configurando
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Header({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function Mini({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2 sm:p-3 flex flex-col items-center gap-1">
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-[11px] sm:text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}
