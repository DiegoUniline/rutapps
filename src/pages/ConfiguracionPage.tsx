import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Upload, Save, Building2, Receipt, FileText, Eye, KeyRound, Eye as EyeIcon, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DEFAULT_CAMPOS: Record<string, boolean> = {
  logo: true, nombre: true, razon_social: true, rfc: true,
  direccion: true, telefono: true, notas_ticket: true, firmas: true,
};

const CAMPO_LABELS: Record<string, string> = {
  logo: 'Logo', nombre: 'Nombre comercial', razon_social: 'Razón social',
  rfc: 'RFC', direccion: 'Dirección', telefono: 'Teléfono',
  notas_ticket: 'Notas de ticket', firmas: 'Firmas (nota de venta)',
};

function useEmpresaConfig() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['empresa-config', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('*').eq('id', empresa!.id).single();
      if (error) throw error;
      return data;
    },
  });
}

/* ─── Live Preview Components ─── */

interface PreviewProps {
  form: Record<string, string>;
  logoPreview: string | null;
  campos: Record<string, boolean>;
}

function TicketPreview({ form, logoPreview, campos }: PreviewProps) {
  const nombre = form.nombre || 'Mi Empresa';
  const dir = [form.direccion, form.colonia, form.ciudad].filter(Boolean).join(', ');

  return (
    <div className="bg-white text-black rounded-lg shadow-lg border border-border overflow-hidden" style={{ width: '280px', fontFamily: "'Courier New', monospace" }}>
      <div className="px-4 pt-4 pb-2 text-center">
        {campos.logo && logoPreview && <img src={logoPreview} alt="Logo" className="h-10 mx-auto mb-2 object-contain" />}
        {campos.nombre && <div className="font-bold text-[13px]">{nombre}</div>}
        {campos.razon_social && form.razon_social && <div className="text-[9px] text-gray-500">{form.razon_social}</div>}
        {campos.rfc && form.rfc && <div className="text-[9px] text-gray-500">RFC: {form.rfc}</div>}
        {campos.direccion && dir && <div className="text-[9px] text-gray-500">{dir}</div>}
        {campos.telefono && form.telefono && <div className="text-[9px] text-gray-500">Tel: {form.telefono}</div>}
      </div>
      <div className="border-t border-dashed border-gray-300 mx-3" />
      <div className="px-4 py-2">
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>Folio: VTA-0001</span>
          <span>14/03/2026</span>
        </div>
        <div className="text-[10px] text-gray-600 mt-1">Cliente: <span className="font-medium">Juan Pérez</span></div>
      </div>
      <div className="border-t border-dashed border-gray-300 mx-3" />
      <div className="px-4 py-2 space-y-1">
        <div className="flex justify-between text-[9px] font-bold text-gray-500 uppercase">
          <span className="flex-1">Producto</span>
          <span className="w-8 text-center">Qty</span>
          <span className="w-16 text-right">Total</span>
        </div>
        {[
          { nombre: 'Producto A', qty: 10, total: 250 },
          { nombre: 'Producto B', qty: 5, total: 175 },
          { nombre: 'Producto C', qty: 3, total: 90 },
        ].map((p, i) => (
          <div key={i} className="flex justify-between text-[10px]">
            <span className="flex-1 truncate">{p.nombre}</span>
            <span className="w-8 text-center">{p.qty}</span>
            <span className="w-16 text-right">$ {p.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-gray-300 mx-3" />
      <div className="px-4 py-2 space-y-0.5">
        <div className="flex justify-between text-[10px]"><span>Subtotal</span><span>$ 515.00</span></div>
        <div className="flex justify-between text-[10px]"><span>IVA 16%</span><span>$ 82.40</span></div>
        <div className="flex justify-between text-[12px] font-bold border-t border-gray-300 pt-1 mt-1"><span>Total</span><span>$ 597.40</span></div>
      </div>
      {campos.notas_ticket && form.notas_ticket && (
        <>
          <div className="border-t border-dashed border-gray-300 mx-3" />
          <div className="px-4 py-2 text-center text-[9px] text-gray-500">{form.notas_ticket}</div>
        </>
      )}
      <div className="border-t border-dashed border-gray-300 mx-3" />
      <div className="px-4 py-2 text-center text-[8px] text-gray-400">
        Elaborado por Uniline — Innovación en la nube
      </div>
    </div>
  );
}

function NotaVentaPreview({ form, logoPreview, campos }: PreviewProps) {
  const nombre = form.nombre || 'Mi Empresa';
  const dir = [form.direccion, form.colonia, form.ciudad, form.estado].filter(Boolean).join(', ');

  return (
    <div className="bg-white text-black rounded-lg shadow-lg border border-border overflow-hidden" style={{ width: '400px', fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="p-4 border-b-2 border-gray-200 flex justify-between items-start">
        <div className="flex items-center gap-3">
          {campos.logo && logoPreview && <img src={logoPreview} alt="Logo" className="h-10 object-contain" />}
          <div>
            {campos.nombre && <div className="font-bold text-[14px]">{nombre}</div>}
            {campos.razon_social && form.razon_social && <div className="text-[9px] text-gray-500">{form.razon_social}</div>}
            {campos.rfc && form.rfc && <div className="text-[9px] text-gray-500">RFC: {form.rfc}</div>}
            {campos.direccion && dir && <div className="text-[9px] text-gray-500 max-w-[200px]">{dir} {form.cp ? `C.P. ${form.cp}` : ''}</div>}
            {campos.telefono && form.telefono && <div className="text-[9px] text-gray-500">Tel: {form.telefono}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-gray-500 uppercase">Nota de venta</div>
          <div className="font-bold font-mono text-[14px]">VTA-0001</div>
          <div className="text-[10px] text-gray-500">14/03/2026</div>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[8px] font-semibold bg-amber-100 text-amber-700">Confirmado</span>
        </div>
      </div>

      {/* Client */}
      <div className="p-3 grid grid-cols-2 gap-3 bg-gray-50">
        <div>
          <div className="text-[8px] uppercase text-gray-400 tracking-wide">Cliente</div>
          <div className="font-semibold text-[11px]">Juan Pérez</div>
          <div className="text-[9px] text-gray-500">Calle Reforma 456, Centro</div>
        </div>
        <div>
          <div className="text-[8px] uppercase text-gray-400 tracking-wide">Condición</div>
          <div className="font-semibold text-[11px]">Crédito - 30 días</div>
        </div>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead>
          <tr className="bg-gray-100 text-[8px] uppercase text-gray-500 tracking-wide">
            <th className="py-1.5 px-3 text-left">#</th>
            <th className="py-1.5 px-2 text-left">Código</th>
            <th className="py-1.5 px-2 text-left">Producto</th>
            <th className="py-1.5 px-2 text-center">Cant</th>
            <th className="py-1.5 px-2 text-right">P.U.</th>
            <th className="py-1.5 px-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {[
            { cod: 'PROD-001', nombre: 'Producto A', qty: 10, pu: 25, total: 250 },
            { cod: 'PROD-002', nombre: 'Producto B', qty: 5, pu: 35, total: 175 },
            { cod: 'PROD-003', nombre: 'Producto C', qty: 3, pu: 30, total: 90 },
          ].map((p, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="py-1 px-3 text-gray-400">{i + 1}</td>
              <td className="py-1 px-2 font-mono text-[9px] text-gray-500">{p.cod}</td>
              <td className="py-1 px-2 font-medium">{p.nombre}</td>
              <td className="py-1 px-2 text-center">{p.qty}</td>
              <td className="py-1 px-2 text-right">$ {p.pu.toFixed(2)}</td>
              <td className="py-1 px-3 text-right font-medium">$ {p.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end p-3">
        <div className="w-48 space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>$ 515.00</span></div>
          <div className="flex justify-between"><span className="text-gray-500">IVA 16%</span><span>$ 82.40</span></div>
          <div className="flex justify-between font-bold text-[13px] border-t border-gray-300 pt-1 mt-1"><span>Total</span><span>$ 597.40</span></div>
        </div>
      </div>

      {/* Signatures */}
      {campos.firmas && (
        <div className="grid grid-cols-2 gap-8 px-6 pb-2 pt-4">
          <div className="border-t border-gray-400 pt-1 text-center text-[9px] text-gray-400">Entregó</div>
          <div className="border-t border-gray-400 pt-1 text-center text-[9px] text-gray-400">Recibió</div>
        </div>
      )}

      {campos.notas_ticket && form.notas_ticket && (
        <div className="mx-3 my-2 p-2 bg-gray-50 rounded text-[9px] text-gray-500 text-center">{form.notas_ticket}</div>
      )}

      <div className="text-center py-2 text-[8px] text-gray-300">
        Elaborado por Uniline — Innovación en la nube
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export default function ConfiguracionPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { data: config, isLoading } = useEmpresaConfig();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewTab, setPreviewTab] = useState<'ticket' | 'nota'>('ticket');

  const [form, setForm] = useState<Record<string, string>>({});
  const [campos, setCampos] = useState<Record<string, boolean>>(DEFAULT_CAMPOS);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [initialized, setInitialized] = useState(false);

  if (config && !initialized) {
    setForm({
      nombre: config.nombre ?? '',
      razon_social: (config as any).razon_social ?? '',
      rfc: (config as any).rfc ?? '',
      regimen_fiscal: (config as any).regimen_fiscal ?? '',
      direccion: (config as any).direccion ?? '',
      colonia: (config as any).colonia ?? '',
      ciudad: (config as any).ciudad ?? '',
      estado: (config as any).estado ?? '',
      cp: (config as any).cp ?? '',
      telefono: (config as any).telefono ?? '',
      email: (config as any).email ?? '',
      notas_ticket: (config as any).notas_ticket ?? '',
    });
    if ((config as any).logo_url) setLogoPreview((config as any).logo_url);
    if ((config as any).ticket_campos) {
      setCampos({ ...DEFAULT_CAMPOS, ...((config as any).ticket_campos as Record<string, boolean>) });
    }
    setInitialized(true);
  }

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logo_url = (config as any)?.logo_url ?? null;
      if (logoFile && empresa) {
        const { compressLogo } = await import('@/lib/imageCompressor');
        const compressed = await compressLogo(logoFile);
        const ext = compressed.name.split('.').pop();
        const path = `${empresa.id}/logo.${ext}`;
        const { error: upErr } = await supabase.storage.from('empresa-assets').upload(path, compressed, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(path);
        logo_url = urlData.publicUrl;
      }
      const { error } = await supabase.from('empresas').update({
        nombre: form.nombre, razon_social: form.razon_social, rfc: form.rfc,
        regimen_fiscal: form.regimen_fiscal, direccion: form.direccion, colonia: form.colonia,
        ciudad: form.ciudad, estado: form.estado, cp: form.cp, telefono: form.telefono,
        email: form.email, notas_ticket: form.notas_ticket, logo_url,
        ticket_campos: campos,
      } as any).eq('id', empresa!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configuración guardada');
      qc.invalidateQueries({ queryKey: ['empresa-config'] });
      qc.invalidateQueries({ queryKey: ['empresa'] });
      setLogoFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const field = (key: string, label: string, placeholder?: string) => (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">{label}</label>
      <Input
        value={form[key] ?? ''}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className="text-[13px]"
      />
    </div>
  );

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>;

  return (
    <div className="p-4 flex gap-6 min-h-full">
      {/* Left: Form */}
      <div className="flex-1 space-y-5 max-w-xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5" /> Configuración de empresa
          </h1>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm">
            <Save className="h-3.5 w-3.5 mr-1" /> Guardar
          </Button>
        </div>

        {/* Logo */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Logo de la empresa
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center overflow-hidden bg-muted/30">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1" /> Subir logo
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              <p className="text-[11px] text-muted-foreground mt-2">PNG o JPG, máximo 2MB</p>
            </div>
          </div>
        </div>

        {/* Campos visibles */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4" /> Campos visibles en ticket / nota
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">Elige qué información aparece en tus documentos impresos.</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(CAMPO_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                <Switch
                  checked={campos[key] ?? true}
                  onCheckedChange={(v) => setCampos(prev => ({ ...prev, [key]: v }))}
                  className="scale-75"
                />
                <span className="text-[12px] text-foreground">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Datos fiscales */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Datos fiscales</h3>
          <div className="grid grid-cols-2 gap-3">
            {field('nombre', 'Nombre comercial', 'Mi Empresa')}
            {field('razon_social', 'Razón social', 'Empresa SA de CV')}
            {field('rfc', 'RFC', 'XAXX010101000')}
            {field('regimen_fiscal', 'Régimen fiscal', '601 - General de Ley')}
          </div>
        </div>

        {/* Dirección */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Dirección</h3>
          <div className="grid grid-cols-2 gap-3">
            {field('direccion', 'Calle y número', 'Av. Principal 123')}
            {field('colonia', 'Colonia', 'Centro')}
            {field('ciudad', 'Ciudad', 'Guadalajara')}
            {field('estado', 'Estado', 'Jalisco')}
            {field('cp', 'Código postal', '44100')}
          </div>
        </div>

        {/* Contacto */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Contacto</h3>
          <div className="grid grid-cols-2 gap-3">
            {field('telefono', 'Teléfono', '33 1234 5678')}
            {field('email', 'Email', 'contacto@empresa.com')}
          </div>
        </div>

        {/* Notas ticket */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Notas para ticket</h3>
          <textarea
            value={form.notas_ticket ?? ''}
            onChange={e => setForm(prev => ({ ...prev, notas_ticket: e.target.value }))}
            placeholder="Ej: Gracias por su compra. No se aceptan devoluciones después de 7 días."
            className="input-odoo min-h-[70px] text-[13px] w-full"
          />
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="w-[440px] shrink-0 sticky top-0 self-start">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Vista previa en tiempo real</span>
        </div>
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setPreviewTab('ticket')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              previewTab === 'ticket' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Receipt className="h-3.5 w-3.5" /> Ticket
          </button>
          <button
            onClick={() => setPreviewTab('nota')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              previewTab === 'nota' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Nota de venta
          </button>
        </div>

        <div className="flex justify-center p-4 bg-muted/30 rounded-lg border border-border min-h-[500px]">
          {previewTab === 'ticket' ? (
            <TicketPreview form={form} logoPreview={logoPreview} campos={campos} />
          ) : (
            <NotaVentaPreview form={form} logoPreview={logoPreview} campos={campos} />
          )}
        </div>
      </div>
    </div>
  );
}
