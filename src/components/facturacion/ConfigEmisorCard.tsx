import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Building2, Save, Loader2 } from 'lucide-react';
import { SearchableSelect } from '@/components/SearchableSelect';

export function ConfigEmisorCard() {
  const { empresa } = useAuth();
  const [form, setForm] = useState({
    rfc: '',
    razon_social: '',
    regimen_fiscal: '',
    cp: '',
  });
  const [saving, setSaving] = useState(false);

  // Load regimen options
  const { data: regimenes } = useQuery({
    queryKey: ['cat_regimen_fiscal'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_regimen_fiscal').select('clave, descripcion').eq('activo', true).order('clave');
      return data || [];
    },
  });

  useEffect(() => {
    if (empresa) {
      setForm({
        rfc: empresa.rfc || '',
        razon_social: empresa.razon_social || '',
        regimen_fiscal: empresa.regimen_fiscal || '',
        cp: empresa.cp || '',
      });
    }
  }, [empresa]);

  async function handleSave() {
    if (!empresa?.id) return;
    if (!form.rfc || !form.razon_social || !form.regimen_fiscal || !form.cp) {
      toast.error('Todos los campos son obligatorios');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('empresas')
      .update({
        rfc: form.rfc.toUpperCase().trim(),
        razon_social: form.razon_social.trim(),
        regimen_fiscal: form.regimen_fiscal,
        cp: form.cp.trim(),
      })
      .eq('id', empresa.id);

    if (error) {
      toast.error('Error al guardar: ' + error.message);
    } else {
      toast.success('Datos fiscales guardados');
    }
    setSaving(false);
  }

  const regimenOptions = (regimenes || []).map((r: any) => ({
    value: r.clave,
    label: `${r.clave} - ${r.descripcion}`,
  }));

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          Datos Fiscales del Emisor
        </CardTitle>
        <CardDescription>
          Estos datos se usarán al timbrar facturas en Facturama.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>RFC</Label>
            <Input
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value })}
              placeholder="XAXX010101000"
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Código Postal (Lugar de Expedición)</Label>
            <Input
              value={form.cp}
              onChange={(e) => setForm({ ...form, cp: e.target.value })}
              placeholder="06600"
              maxLength={5}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Razón Social</Label>
          <Input
            value={form.razon_social}
            onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
            placeholder="Mi Empresa S.A. de C.V."
          />
        </div>
        <div className="space-y-1.5">
          <Label>Régimen Fiscal</Label>
          <SearchableSelect
            options={regimenOptions}
            value={form.regimen_fiscal}
            onValueChange={(val) => setForm({ ...form, regimen_fiscal: val })}
            placeholder="Selecciona régimen..."
          />
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
          Guardar datos fiscales
        </Button>
      </CardContent>
    </Card>
  );
}
