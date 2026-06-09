import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, FileText, Save, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CatRow { clave: string; descripcion: string }

interface Props {
  empresaId: string;
}

const REGIMENES: { clave: string; descripcion: string }[] = [
  { clave: '601', descripcion: '601 - General de Ley Personas Morales' },
  { clave: '603', descripcion: '603 - Personas Morales con Fines no Lucrativos' },
  { clave: '605', descripcion: '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { clave: '606', descripcion: '606 - Arrendamiento' },
  { clave: '612', descripcion: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { clave: '621', descripcion: '621 - Incorporación Fiscal' },
  { clave: '622', descripcion: '622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { clave: '626', descripcion: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { clave: '628', descripcion: '628 - Hidrocarburos' },
];

const METODOS_PAGO: { clave: string; descripcion: string }[] = [
  { clave: 'PUE', descripcion: 'PUE - Pago en una sola exhibición' },
  { clave: 'PPD', descripcion: 'PPD - Pago en parcialidades o diferido' },
];

export default function DatosFiscalesCard({ empresaId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [usosCfdi, setUsosCfdi] = useState<CatRow[]>([]);
  const [formasPago, setFormasPago] = useState<CatRow[]>([]);
  const [originalForm, setOriginalForm] = useState<typeof form | null>(null);
  const [form, setForm] = useState({
    razon_social: '',
    rfc: '',
    regimen_fiscal: '',
    cp: '',
    uso_cfdi: '',
    forma_pago_sat: '',
    metodo_pago_sat: '',
    email_facturacion: '',
    email_cc_facturacion: '',
    csf_url: '',
  });

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [empRes, usosRes, formasRes] = await Promise.all([
        supabase.from('empresas').select('razon_social, rfc, regimen_fiscal, cp, uso_cfdi, forma_pago_sat, metodo_pago_sat, email_facturacion, email_cc_facturacion, csf_url, email').eq('id', empresaId).maybeSingle(),
        supabase.from('cat_uso_cfdi').select('clave, descripcion').eq('activo', true).order('clave'),
        supabase.from('cat_forma_pago').select('clave, descripcion').eq('activo', true).order('clave'),
      ]);
      if (!active) return;
      if (empRes.data) {
        const loaded = {
          razon_social: empRes.data.razon_social || '',
          rfc: empRes.data.rfc || '',
          regimen_fiscal: empRes.data.regimen_fiscal || '',
          cp: empRes.data.cp || '',
          uso_cfdi: empRes.data.uso_cfdi || 'G03',
          forma_pago_sat: empRes.data.forma_pago_sat || '03',
          metodo_pago_sat: empRes.data.metodo_pago_sat || 'PUE',
          email_facturacion: empRes.data.email_facturacion || empRes.data.email || '',
          email_cc_facturacion: empRes.data.email_cc_facturacion || '',
          csf_url: empRes.data.csf_url || '',
        };
        setForm(loaded);
        setOriginalForm(loaded);
      }
      setUsosCfdi(usosRes.data || []);
      setFormasPago(formasRes.data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [empresaId]);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!form.rfc.trim() || !form.razon_social.trim()) {
      toast.error('RFC y Razón Social son obligatorios');
      return;
    }
    if (!form.email_facturacion.trim()) {
      toast.error('Captura el correo de facturación');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('empresas').update({
        razon_social: form.razon_social.trim().toUpperCase(),
        rfc: form.rfc.trim().toUpperCase(),
        regimen_fiscal: form.regimen_fiscal || null,
        cp: form.cp.trim() || null,
        uso_cfdi: form.uso_cfdi || null,
        forma_pago_sat: form.forma_pago_sat || null,
        metodo_pago_sat: form.metodo_pago_sat || null,
        email_facturacion: form.email_facturacion.trim(),
        email_cc_facturacion: form.email_cc_facturacion.trim() || null,
      }).eq('id', empresaId);
      if (error) throw error;
      toast.success('Datos fiscales guardados');
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadCSF(file: File) {
    if (file.type !== 'application/pdf') {
      toast.error('La CSF debe ser un archivo PDF');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no debe superar 5 MB');
      return;
    }
    setUploading(true);
    try {
      const path = `${empresaId}/csf-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from('csf').upload(path, file, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from('empresas').update({ csf_url: path }).eq('id', empresaId);
      if (updErr) throw updErr;
      setForm((f) => ({ ...f, csf_url: path }));
      toast.success('CSF subida correctamente');
    } catch (e: any) {
      toast.error(e.message || 'Error subiendo la CSF');
    } finally {
      setUploading(false);
    }
  }

  async function handleViewCSF() {
    if (!form.csf_url) return;
    const { data, error } = await supabase.storage.from('csf').createSignedUrl(form.csf_url, 300);
    if (error || !data?.signedUrl) {
      toast.error('No se pudo abrir el archivo');
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function handleRemoveCSF() {
    if (!form.csf_url) return;
    if (!confirm('¿Eliminar la CSF cargada?')) return;
    try {
      await supabase.storage.from('csf').remove([form.csf_url]);
      await supabase.from('empresas').update({ csf_url: null }).eq('id', empresaId);
      setForm((f) => ({ ...f, csf_url: '' }));
      toast.success('CSF eliminada');
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    }
  }

  if (loading) {
    return (
      <Card className="bg-white border border-border">
        <CardContent className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <FileText className="h-5 w-5" /> Datos fiscales para facturación (CFDI 4.0)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Estos datos se usarán para emitir tu factura mensual. Asegúrate de que coincidan exactamente con tu Constancia de Situación Fiscal (CSF).
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Razón Social *</Label>
            <Input value={form.razon_social} onChange={(e) => update('razon_social', e.target.value)} placeholder="Tal cual aparece en la CSF" />
          </div>
          <div>
            <Label>RFC *</Label>
            <Input value={form.rfc} onChange={(e) => update('rfc', e.target.value.toUpperCase())} maxLength={13} placeholder="XAXX010101000" />
          </div>
          <div>
            <Label>Régimen Fiscal</Label>
            <Select value={form.regimen_fiscal} onValueChange={(v) => update('regimen_fiscal', v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {REGIMENES.map((r) => <SelectItem key={r.clave} value={r.clave}>{r.descripcion}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Código Postal Fiscal</Label>
            <Input value={form.cp} onChange={(e) => update('cp', e.target.value.replace(/\D/g, ''))} maxLength={5} placeholder="00000" />
          </div>
          <div>
            <Label>Uso de CFDI</Label>
            <Select value={form.uso_cfdi} onValueChange={(v) => update('uso_cfdi', v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {usosCfdi.map((u) => <SelectItem key={u.clave} value={u.clave}>{u.clave} - {u.descripcion}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Forma de Pago</Label>
            <Select value={form.forma_pago_sat} onValueChange={(v) => update('forma_pago_sat', v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {formasPago.map((fp) => <SelectItem key={fp.clave} value={fp.clave}>{fp.clave} - {fp.descripcion}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Método de Pago</Label>
            <Select value={form.metodo_pago_sat} onValueChange={(v) => update('metodo_pago_sat', v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {METODOS_PAGO.map((m) => <SelectItem key={m.clave} value={m.clave}>{m.descripcion}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-4">
          <h3 className="font-semibold text-primary">Envío de la factura</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Correo principal (Para) *</Label>
              <Input type="email" value={form.email_facturacion} onChange={(e) => update('email_facturacion', e.target.value)} placeholder="facturas@tuempresa.mx" />
            </div>
            <div>
              <Label>Correos en copia (CC)</Label>
              <Input value={form.email_cc_facturacion} onChange={(e) => update('email_cc_facturacion', e.target.value)} placeholder="contador@... , admin@..." />
              <p className="text-xs text-muted-foreground mt-1">Separa varios correos con coma.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <h3 className="font-semibold text-primary">Constancia de Situación Fiscal (CSF)</h3>
          <p className="text-sm text-muted-foreground">Sube tu CSF en PDF (máx. 5 MB). La usaremos como respaldo de tus datos fiscales.</p>
          {form.csf_url ? (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium flex-1">CSF cargada</span>
              <Button type="button" variant="outline" size="sm" onClick={handleViewCSF}>
                <ExternalLink className="h-4 w-4 mr-1" /> Ver
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleRemoveCSF}>
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
              </Button>
              <label className="cursor-pointer">
                <input type="file" accept="application/pdf" className="hidden" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCSF(f); e.target.value = ''; }} />
                <span className="inline-flex items-center text-sm px-3 py-1.5 rounded-md border border-input hover:bg-accent">
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Reemplazar
                </span>
              </label>
            </div>
          ) : (
            <label className="block cursor-pointer">
              <input type="file" accept="application/pdf" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCSF(f); e.target.value = ''; }} />
              <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:bg-primary/5 transition-colors">
                {uploading ? (
                  <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
                    <p className="text-sm font-medium text-primary">Haz clic para subir tu CSF (PDF)</p>
                    <p className="text-xs text-muted-foreground mt-1">Máximo 5 MB</p>
                  </>
                )}
              </div>
            </label>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar datos fiscales
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
