import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Building2, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface EmpresaRow {
  id: string; nombre: string; email: string | null; telefono: string | null; created_at: string;
}

export default function AdminEmpresasTab() {
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('empresas').select('id, nombre, email, telefono, created_at');
    setEmpresas(data || []);
    setLoading(false);
  }

  async function deleteEmpresa(id: string, nombre: string) {
    if (!confirm(`¿Eliminar empresa "${nombre}" y TODOS sus datos? Esta acción es irreversible.`)) return;
    await supabase.from('subscriptions').delete().eq('empresa_id', id);
    const { error } = await supabase.from('empresas').delete().eq('id', id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Empresa eliminada'); load(); }
  }

  const filtered = empresas.filter(e => e.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Empresas ({empresas.length})
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{e.email || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{e.telefono || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(e.created_at), 'dd MMM yyyy', { locale: es })}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteEmpresa(e.id, e.nombre)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
