import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Upload, Save, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

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

export default function ConfiguracionPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { data: config, isLoading } = useEmpresaConfig();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Record<string, string>>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize form when data loads
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
        const ext = logoFile.name.split('.').pop();
        const path = `${empresa.id}/logo.${ext}`;
        const { error: upErr } = await supabase.storage.from('empresa-assets').upload(path, logoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(path);
        logo_url = urlData.publicUrl;
      }

      const { error } = await supabase.from('empresas').update({
        nombre: form.nombre,
        razon_social: form.razon_social,
        rfc: form.rfc,
        regimen_fiscal: form.regimen_fiscal,
        direccion: form.direccion,
        colonia: form.colonia,
        ciudad: form.ciudad,
        estado: form.estado,
        cp: form.cp,
        telefono: form.telefono,
        email: form.email,
        notas_ticket: form.notas_ticket,
        logo_url,
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
    <div className="p-4 space-y-6 max-w-3xl">
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
          <div className="w-32 h-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center overflow-hidden bg-muted/30">
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
            <p className="text-[11px] text-muted-foreground mt-2">PNG o JPG, máximo 2MB. Se usará en tickets y documentos.</p>
          </div>
        </div>
      </div>

      {/* Datos fiscales */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Datos fiscales</h3>
        <div className="grid grid-cols-2 gap-4">
          {field('nombre', 'Nombre comercial', 'Mi Empresa')}
          {field('razon_social', 'Razón social', 'Empresa SA de CV')}
          {field('rfc', 'RFC', 'XAXX010101000')}
          {field('regimen_fiscal', 'Régimen fiscal', '601 - General de Ley')}
        </div>
      </div>

      {/* Dirección */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Dirección</h3>
        <div className="grid grid-cols-2 gap-4">
          {field('direccion', 'Calle y número', 'Av. Principal 123')}
          {field('colonia', 'Colonia', 'Centro')}
          {field('ciudad', 'Ciudad', 'Guadalajara')}
          {field('estado', 'Estado', 'Jalisco')}
          {field('cp', 'Código postal', '44100')}
        </div>
      </div>

      {/* Contacto */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Contacto</h3>
        <div className="grid grid-cols-2 gap-4">
          {field('telefono', 'Teléfono', '33 1234 5678')}
          {field('email', 'Email', 'contacto@empresa.com')}
        </div>
      </div>

      {/* Notas para ticket */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Notas para ticket / nota de venta</h3>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Mensaje al pie del ticket</label>
          <textarea
            value={form.notas_ticket ?? ''}
            onChange={e => setForm(prev => ({ ...prev, notas_ticket: e.target.value }))}
            placeholder="Ej: Gracias por su compra. No se aceptan devoluciones después de 7 días."
            className="input-odoo min-h-[80px] text-[13px] w-full"
          />
        </div>
      </div>
    </div>
  );
}
