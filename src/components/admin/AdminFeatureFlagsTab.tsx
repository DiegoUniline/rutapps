import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, FlaskConical, Loader2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import type { FeatureFlag, FeatureFlagAlcance } from '@/lib/featureFlags';

const ALCANCES: { value: FeatureFlagAlcance; label: string; hint: string }[] = [
  { value: 'nadie', label: 'Apagada (nadie)', hint: 'Ninguna empresa ve la función.' },
  { value: 'licencias', label: 'Solo licencias elegidas', hint: 'Únicamente las licencias listadas.' },
  { value: 'todos', label: 'Todas las empresas', hint: 'Liberada a producción para todos.' },
];

type Draft = {
  id?: string;
  clave: string;
  nombre: string;
  descripcion: string;
  notas_prueba: string;
  alcance: FeatureFlagAlcance;
  licenciasText: string;
};

const emptyDraft: Draft = {
  clave: '', nombre: '', descripcion: '', notas_prueba: '',
  alcance: 'licencias', licenciasText: '12324489',
};

export default function AdminFeatureFlagsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [verNotas, setVerNotas] = useState<FeatureFlag | null>(null);

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['feature_flags', 'admin'],
    queryFn: async (): Promise<FeatureFlag[]> => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('id, clave, nombre, descripcion, notas_prueba, alcance, licencias, created_at, updated_at')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as unknown as FeatureFlag[];
    },
  });

  const openNew = () => { setDraft(emptyDraft); setOpen(true); };
  const openEdit = (f: FeatureFlag) => {
    setDraft({
      id: f.id,
      clave: f.clave,
      nombre: f.nombre,
      descripcion: f.descripcion ?? '',
      notas_prueba: f.notas_prueba ?? '',
      alcance: f.alcance,
      licenciasText: (f.licencias ?? []).join(', '),
    });
    setOpen(true);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['feature_flags'] });
  };

  const save = async () => {
    if (!draft.clave.trim() || !draft.nombre.trim()) {
      toast.error('Clave y nombre son obligatorios');
      return;
    }
    setSaving(true);
    const payload = {
      clave: draft.clave.trim(),
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      notas_prueba: draft.notas_prueba.trim() || null,
      alcance: draft.alcance,
      licencias: draft.licenciasText
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const { error } = draft.id
      ? await supabase.from('feature_flags').update(payload).eq('id', draft.id)
      : await supabase.from('feature_flags').insert(payload as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Función guardada');
    setOpen(false);
    invalidate();
  };

  const remove = async (f: FeatureFlag) => {
    if (!confirm(`¿Eliminar la función "${f.nombre}"?`)) return;
    const { error } = await supabase.from('feature_flags').delete().eq('id', f.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Función eliminada');
    invalidate();
  };

  const quickAlcance = async (f: FeatureFlag, alcance: FeatureFlagAlcance) => {
    const { error } = await supabase.from('feature_flags').update({ alcance }).eq('id', f.id);
    if (error) { toast.error(error.message); return; }
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Funciones en pruebas
          </h2>
          <p className="text-sm text-muted-foreground">
            Elige qué empresas (por licencia) ven cada función nueva antes de liberarla a todos.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nueva función</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : flags.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          Aún no hay funciones registradas.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {flags.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{f.nombre}</span>
                      <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{f.clave}</code>
                      <Badge variant={f.alcance === 'todos' ? 'default' : f.alcance === 'licencias' ? 'secondary' : 'outline'}>
                        {ALCANCES.find((a) => a.value === f.alcance)?.label}
                      </Badge>
                    </div>
                    {f.descripcion && (
                      <p className="text-sm text-muted-foreground mt-1">{f.descripcion}</p>
                    )}
                    {f.alcance === 'licencias' && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {(f.licencias ?? []).length === 0
                          ? <span className="text-xs text-muted-foreground">Sin licencias asignadas</span>
                          : f.licencias.map((l) => (
                              <Badge key={l} variant="outline" className="font-mono text-[11px]">{l}</Badge>
                            ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {f.notas_prueba && (
                      <Button variant="ghost" size="sm" onClick={() => setVerNotas(f)}>
                        <ClipboardList className="h-4 w-4 mr-1" /> Qué revisar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(f)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {ALCANCES.map((a) => (
                    <Button
                      key={a.value}
                      size="sm"
                      variant={f.alcance === a.value ? 'default' : 'outline'}
                      onClick={() => quickAlcance(f, a.value)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Editar función' : 'Nueva función'}</DialogTitle>
            <DialogDescription>
              La clave es la que usa el código; no la cambies una vez publicada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Clave técnica</Label>
              <Input
                value={draft.clave}
                onChange={(e) => setDraft({ ...draft, clave: e.target.value })}
                placeholder="promo_persist"
                disabled={!!draft.id}
              />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea rows={2} value={draft.descripcion} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} />
            </div>
            <div>
              <Label>Plan de pruebas (qué revisar)</Label>
              <Textarea rows={5} value={draft.notas_prueba} onChange={(e) => setDraft({ ...draft, notas_prueba: e.target.value })} placeholder={'1) ...\n2) ...'} />
            </div>
            <div>
              <Label>Alcance</Label>
              <Select value={draft.alcance} onValueChange={(v) => setDraft({ ...draft, alcance: v as FeatureFlagAlcance })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALCANCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {draft.alcance === 'licencias' && (
              <div>
                <Label>Licencias habilitadas (separadas por coma)</Label>
                <Input
                  value={draft.licenciasText}
                  onChange={(e) => setDraft({ ...draft, licenciasText: e.target.value })}
                  placeholder="12324489, 53021303"
                  className="font-mono"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!verNotas} onOpenChange={(v) => !v && setVerNotas(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Qué revisar — {verNotas?.nombre}</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">{verNotas?.notas_prueba}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
