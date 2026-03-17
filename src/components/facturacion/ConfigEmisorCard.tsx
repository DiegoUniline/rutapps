import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Save, Loader2, Upload, FileText, ShieldCheck, CheckCircle, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';

export function ConfigEmisorCard() {
  const { empresa } = useAuth();
  const [form, setForm] = useState({
    rfc: '',
    razon_social: '',
    regimen_fiscal: '',
    cp: '',
    direccion: '',
    colonia: '',
    ciudad: '',
    estado: '',
  });
  const [saving, setSaving] = useState(false);
  const [initialForm, setInitialForm] = useState(form);

  // CSF upload
  const csfInputRef = useRef<HTMLInputElement>(null);
  const [parsingCsf, setParsingCsf] = useState(false);

  // CSD upload
  const cerInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [csdPassword, setCsdPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [uploadingCsd, setUploadingCsd] = useState(false);

  // Load regimen options
  const { data: regimenes } = useQuery({
    queryKey: ['cat_regimen_fiscal'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_regimen_fiscal').select('clave, descripcion').eq('activo', true).order('clave');
      return data || [];
    },
  });

  // Check CSD status
  const { data: csdStatus, refetch: refetchCsd } = useQuery({
    queryKey: ['csd_status'],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: { action: 'list_csds' },
      });
      if (error) return { loaded: false, csds: [] };
      return { loaded: true, csds: data?.csds || [] };
    },
  });

  useEffect(() => {
    if (empresa) {
      const initial = {
        rfc: empresa.rfc || '',
        razon_social: empresa.razon_social || '',
        regimen_fiscal: empresa.regimen_fiscal || '',
        cp: empresa.cp || '',
        direccion: empresa.direccion || '',
        colonia: empresa.colonia || '',
        ciudad: empresa.ciudad || '',
        estado: empresa.estado || '',
      };
      setForm(initial);
      setInitialForm(initial);
    }
  }, [empresa]);

  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm);

  async function handleSave() {
    if (!empresa?.id) return;
    if (!form.rfc || !form.razon_social || !form.regimen_fiscal || !form.cp) {
      toast.error('RFC, Razón Social, Régimen Fiscal y CP son obligatorios');
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
        direccion: form.direccion?.trim() || null,
        colonia: form.colonia?.trim() || null,
        ciudad: form.ciudad?.trim() || null,
        estado: form.estado?.trim() || null,
      })
      .eq('id', empresa.id);

    if (error) {
      toast.error('Error al guardar: ' + error.message);
    } else {
      toast.success('Datos fiscales guardados');
      setInitialForm(form);
    }
    setSaving(false);
  }

  // Parse Constancia de Situación Fiscal
  async function handleCsfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Solo se aceptan archivos PDF');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no debe superar 5 MB');
      return;
    }

    setParsingCsf(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke('parse-csf', {
        body: { pdf_base64: base64 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const parsed = data?.data;
      if (parsed) {
        setForm(prev => ({
          ...prev,
          rfc: parsed.rfc || prev.rfc,
          razon_social: parsed.razon_social || prev.razon_social,
          regimen_fiscal: parsed.regimen_fiscal || prev.regimen_fiscal,
          cp: parsed.cp || prev.cp,
          direccion: parsed.direccion || prev.direccion,
          colonia: parsed.colonia || prev.colonia,
          ciudad: parsed.ciudad || prev.ciudad,
          estado: parsed.estado || prev.estado,
        }));
        toast.success('Datos extraídos de la constancia correctamente');
      }
    } catch (err: any) {
      console.error('CSF parse error:', err);
      toast.error('Error al leer la constancia: ' + (err.message || 'Intenta de nuevo'));
    } finally {
      setParsingCsf(false);
      if (csfInputRef.current) csfInputRef.current.value = '';
    }
  }

  // Upload CSD to Facturama
  async function handleCsdUpload() {
    if (!cerFile || !keyFile || !csdPassword) {
      toast.error('Selecciona el .cer, .key e ingresa la contraseña');
      return;
    }
    if (!form.rfc) {
      toast.error('Primero configura el RFC del emisor');
      return;
    }

    setUploadingCsd(true);
    try {
      const [cerBuffer, keyBuffer] = await Promise.all([
        cerFile.arrayBuffer(),
        keyFile.arrayBuffer(),
      ]);

      const toBase64 = (buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };

      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'upload_csd',
          rfc: form.rfc,
          certificate_base64: toBase64(cerBuffer),
          private_key_base64: toBase64(keyBuffer),
          password: csdPassword,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Certificados CSD subidos a Facturama correctamente');
      setCerFile(null);
      setKeyFile(null);
      setCsdPassword('');
      if (cerInputRef.current) cerInputRef.current.value = '';
      if (keyInputRef.current) keyInputRef.current.value = '';
      refetchCsd();
    } catch (err: any) {
      console.error('CSD upload error:', err);
      toast.error('Error al subir CSD: ' + (err.message || 'Verifica los archivos'));
    } finally {
      setUploadingCsd(false);
    }
  }

  const regimenOptions = (regimenes || []).map((r: any) => ({
    value: r.clave,
    label: `${r.clave} - ${r.descripcion}`,
  }));

  const hasCsd = (csdStatus?.csds || []).some((c: any) =>
    c.Rfc?.toUpperCase() === form.rfc?.toUpperCase()
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── CONSTANCIA DE SITUACIÓN FISCAL ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Constancia de Situación Fiscal
          </CardTitle>
          <CardDescription>
            Sube el PDF del SAT y los datos se llenarán automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={csfInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleCsfUpload}
          />
          <Button
            variant="outline"
            onClick={() => csfInputRef.current?.click()}
            disabled={parsingCsf}
            className="w-full sm:w-auto"
          >
            {parsingCsf ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Leyendo constancia...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1.5" />
                Subir Constancia de Situación Fiscal (PDF)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── DATOS FISCALES DEL EMISOR ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Datos Fiscales del Emisor
          </CardTitle>
          <CardDescription>
            Estos datos se usarán al timbrar facturas.
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
              onChange={(val) => setForm({ ...form, regimen_fiscal: val })}
              placeholder="Selecciona régimen..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Calle y número"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colonia</Label>
              <Input
                value={form.colonia}
                onChange={(e) => setForm({ ...form, colonia: e.target.value })}
                placeholder="Colonia"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ciudad / Municipio</Label>
              <Input
                value={form.ciudad}
                onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                placeholder="Ciudad"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Input
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
                placeholder="Estado"
              />
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            variant={hasChanges ? "default" : "secondary"}
            className="w-full sm:w-auto"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            {hasChanges ? 'Guardar datos fiscales' : 'Sin cambios'}
          </Button>
        </CardContent>
      </Card>

      {/* ── CERTIFICADOS CSD ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            Certificados de Sello Digital (CSD)
          </CardTitle>
          <CardDescription>
            Sube los archivos .cer y .key de tu CSD junto con su contraseña para poder timbrar facturas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status badge */}
          {csdStatus?.loaded && (
            <div className="flex items-center gap-2">
              {hasCsd ? (
                <Badge variant="default" className="gap-1.5 bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-3 w-3" />
                  CSD cargado para {form.rfc || 'RFC'}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1.5">
                  <AlertCircle className="h-3 w-3" />
                  Sin CSD cargado — requerido para timbrar
                </Badge>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Certificado (.cer)</Label>
              <input
                ref={cerInputRef}
                type="file"
                accept=".cer"
                className="hidden"
                onChange={(e) => setCerFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
                onClick={() => cerInputRef.current?.click()}
              >
                <ShieldCheck className="h-4 w-4 mr-1.5 shrink-0" />
                <span className="truncate">
                  {cerFile ? cerFile.name : 'Seleccionar archivo .cer'}
                </span>
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Llave Privada (.key)</Label>
              <input
                ref={keyInputRef}
                type="file"
                accept=".key"
                className="hidden"
                onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
                onClick={() => keyInputRef.current?.click()}
              >
                <KeyRound className="h-4 w-4 mr-1.5 shrink-0" />
                <span className="truncate">
                  {keyFile ? keyFile.name : 'Seleccionar archivo .key'}
                </span>
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Contraseña de la llave privada</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={csdPassword}
                onChange={(e) => setCsdPassword(e.target.value)}
                placeholder="Contraseña del .key"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            onClick={handleCsdUpload}
            disabled={uploadingCsd || !cerFile || !keyFile || !csdPassword}
            className="w-full sm:w-auto"
          >
            {uploadingCsd ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Subiendo certificados...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1.5" />
                Subir CSD a Facturama
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
