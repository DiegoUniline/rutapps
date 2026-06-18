import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sparkles, Package, Users, Boxes, CheckCircle2, ArrowRight,
  Loader2, PartyPopper, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ProductoForm {
  nombre: string;
  codigo: string;
  precio: string;
}
interface ClienteForm {
  nombre: string;
  telefono: string;
  direccion: string;
}

const TOTAL_STEPS = 6;

export default function PrimerosPasosModal({ open, onOpenChange }: Props) {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);

  const [prod, setProd] = useState<ProductoForm>({ nombre: '', codigo: '', precio: '' });
  const [prodSaving, setProdSaving] = useState(false);
  const [prodId, setProdId] = useState<string | null>(null);

  const [stockQty, setStockQty] = useState<string>('10');
  const [stockSaving, setStockSaving] = useState(false);

  const [cli, setCli] = useState<ClienteForm>({ nombre: '', telefono: '', direccion: '' });
  const [cliSaving, setCliSaving] = useState(false);

  const empresaId = empresa?.id;

  useEffect(() => {
    if (open) {
      setStep(0);
      setProd({ nombre: '', codigo: '', precio: '' });
      setProdId(null);
      setStockQty('10');
      setCli({ nombre: '', telefono: '', direccion: '' });
    }
  }, [open]);

  const markOnboarded = async () => {
    if (!empresaId) return;
    await supabase.from('empresas').update({ onboarding_completado: true }).eq('id', empresaId);
    sessionStorage.setItem(`primeros_pasos_session_dismissed_${empresaId}`, '1');
  };

  const handleSaveProd = async () => {
    if (!empresaId) return;
    const nombre = prod.nombre.trim();
    const codigo = prod.codigo.trim().toUpperCase();
    const precio = Number(prod.precio);
    if (!nombre) return toast.error('Captura el nombre');
    if (!codigo) return toast.error('Captura el código');
    if (!precio || precio <= 0) return toast.error('Captura un precio válido');

    setProdSaving(true);
    try {
      const [{ data: alm }, { data: uniFallback }] = await Promise.all([
        supabase.from('almacenes').select('id').eq('empresa_id', empresaId).limit(1).maybeSingle(),
        supabase.from('unidades').select('id').eq('empresa_id', empresaId).limit(1).maybeSingle(),
      ]);
      const { data, error } = await supabase
        .from('productos')
        .insert({
          empresa_id: empresaId,
          codigo,
          nombre,
          precio_principal: precio,
          unidad_venta_id: uniFallback?.id ?? null,
          unidad_compra_id: uniFallback?.id ?? null,
          almacenes: alm?.id ? [alm.id] : [],
          status: 'activo',
        })
        .select('id')
        .single();
      if (error) throw error;
      setProdId(data.id);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['setup-check'] });
      qc.invalidateQueries({ queryKey: ['onboarding-gate'] });
      toast.success('Producto creado');
      setStep(2);
    } catch (e: any) {
      const msg = e?.message?.includes('duplicate') ? 'Ya existe un producto con ese código' : (e?.message ?? 'Error al guardar');
      toast.error(msg);
    } finally {
      setProdSaving(false);
    }
  };

  const handleSaveStock = async () => {
    if (!prodId || !empresaId || !user?.id) return setStep(3);
    const qty = Number(stockQty);
    if (!qty || qty <= 0) return setStep(3);
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
      toast.success('Stock registrado');
      setStep(3);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar stock');
    } finally {
      setStockSaving(false);
    }
  };

  const handleSaveCli = async () => {
    if (!empresaId) return;
    const nombre = cli.nombre.trim();
    if (!nombre) return toast.error('Captura el nombre del cliente');
    setCliSaving(true);
    try {
      const { error } = await supabase.from('clientes').insert({
        empresa_id: empresaId,
        nombre,
        telefono: cli.telefono.trim() || null,
        direccion: cli.direccion.trim() || null,
        status: 'activo',
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['setup-check'] });
      qc.invalidateQueries({ queryKey: ['onboarding-gate'] });
      toast.success('Cliente creado');
      setStep(5);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar');
    } finally {
      setCliSaving(false);
    }
  };

  const dismiss = async () => {
    await markOnboarded();
    onOpenChange(false);
  };

  const finish = async (goto?: string) => {
    await markOnboarded();
    onOpenChange(false);
    if (goto) navigate(goto);
  };

  const nombre = empresa?.nombre || 'tu negocio';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-[95vw] sm:max-w-lg w-full max-h-[90dvh] overflow-hidden flex flex-col">
        <div className="bg-primary px-4 py-3 sm:px-6 sm:py-4 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-base sm:text-lg font-bold">Primeros pasos</h2>
          </div>
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i <= step ? 'bg-white' : 'bg-white/30')} />
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {step === 0 && (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <PartyPopper className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">¡Bienvenido a Rutapp!</h3>
              <p className="text-sm text-muted-foreground">
                Vamos a dejar listo <strong>{nombre}</strong> en unos pasos cortos. Solo captura lo esencial y empieza a vender.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <Mini icon={Package} label="Producto" />
                <Mini icon={Boxes} label="Stock" />
                <Mini icon={Tag} label="Precios" />
                <Mini icon={Users} label="Cliente" />
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
              <Header icon={Package} title="Tu primer producto" subtitle="Captura los campos obligatorios" />
              <Field label="Nombre *">
                <Input value={prod.nombre} onChange={e => setProd({ ...prod, nombre: e.target.value })} placeholder="Coca-Cola 600ml" maxLength={120} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Código *">
                  <Input value={prod.codigo} onChange={e => setProd({ ...prod, codigo: e.target.value.toUpperCase() })} placeholder="COCA-600" maxLength={20} />
                </Field>
                <Field label="Precio *">
                  <Input type="number" step="0.01" min="0" value={prod.precio} onChange={e => setProd({ ...prod, precio: e.target.value })} placeholder="18.00" />
                </Field>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(0)} className="w-full">Atrás</Button>
                <Button onClick={handleSaveProd} disabled={prodSaving} className="w-full">
                  {prodSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Guardar <ArrowRight className="ml-1 h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Header icon={Boxes} title="Stock inicial" subtitle="¿Cuántas piezas tienes en almacén?" />
              <div className="rounded-lg border border-border p-4 bg-card">
                <p className="text-sm font-medium text-foreground">{prod.nombre}</p>
                <p className="text-xs text-muted-foreground mb-3">{prod.codigo}</p>
                <Field label="Cantidad disponible">
                  <Input type="number" min="0" step="1" value={stockQty} onChange={e => setStockQty(e.target.value)} className="text-lg" />
                </Field>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setStep(3)} className="w-full">Sin stock por ahora</Button>
                <Button onClick={handleSaveStock} disabled={stockSaving} className="w-full">
                  {stockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Guardar <ArrowRight className="ml-1 h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Header icon={Tag} title="Listas de precios" subtitle="¿Manejas precios diferentes por tipo de cliente?" />
              <div className="rounded-lg border border-border p-4 bg-card text-sm text-muted-foreground">
                Por ejemplo: mayoreo, menudeo, distribuidor o por zona. Si tu negocio maneja un solo precio, omite este paso.
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(4)} className="w-full" size="lg">
                  No, un solo precio
                </Button>
                <Button onClick={() => finish('/listas-precio')} className="w-full" size="lg">
                  Sí, configurar <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Si eliges "Sí, configurar" te llevaré a Listas de Precios para crearlas.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Header icon={Users} title="Tu primer cliente" subtitle="Captura los datos básicos" />
              <Field label="Nombre *">
                <Input value={cli.nombre} onChange={e => setCli({ ...cli, nombre: e.target.value })} placeholder="Abarrotes Don Pepe" maxLength={120} />
              </Field>
              <Field label="Teléfono">
                <Input value={cli.telefono} onChange={e => setCli({ ...cli, telefono: e.target.value })} placeholder="81 1234 5678" maxLength={20} />
              </Field>
              <Field label="Dirección">
                <Input value={cli.direccion} onChange={e => setCli({ ...cli, direccion: e.target.value })} placeholder="Calle y número, colonia" maxLength={200} />
              </Field>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(3)} className="w-full">Atrás</Button>
                <Button onClick={handleSaveCli} disabled={cliSaving} className="w-full">
                  {cliSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Guardar <ArrowRight className="ml-1 h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground">¡Ya puedes vender! 🎉</h3>
              <p className="text-sm text-muted-foreground">
                Tu negocio quedó listo con un producto, stock y un cliente. Puedes seguir agregando más cuando quieras.
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
    <div className="rounded-lg border border-border bg-card p-2 flex flex-col items-center gap-1">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-[10px] sm:text-xs font-medium text-foreground text-center">{label}</span>
    </div>
  );
}
