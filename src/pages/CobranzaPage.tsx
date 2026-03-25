import { useState } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Search, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MobileListCard } from '@/components/MobileListCard';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

function useCobros(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cobros-desktop', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('cobros')
        .select('*, clientes(nombre, telefono)')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      if (search) q = q.or(`clientes.nombre.ilike.%${search}%,referencia.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useClientesConDeuda() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-deuda', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('cliente_id, clientes(id, nombre, codigo, telefono), saldo_pendiente')
        .eq('empresa_id', empresa!.id)
        .gt('saldo_pendiente', 0);
      const map: Record<string, { nombre: string; codigo: string; id: string; total: number; ventas: number; telefono: string }> = {};
      for (const v of (data ?? [])) {
        const cid = v.cliente_id ?? '';
        if (!map[cid]) map[cid] = {
          id: cid,
          nombre: (v.clientes as any)?.nombre ?? '—',
          codigo: (v.clientes as any)?.codigo ?? '',
          telefono: (v.clientes as any)?.telefono ?? '',
          total: 0,
          ventas: 0,
        };
        map[cid].total += v.saldo_pendiente ?? 0;
        map[cid].ventas += 1;
      }
      return Object.values(map).sort((a, b) => b.total - a.total);
    },
  });
}

function buildCobroMessage(cobro: any) {
  const clienteNombre = (cobro.clientes as any)?.nombre ?? '—';
  return `✅ *Recibo de Cobro*\n\n` +
    `Cliente: ${clienteNombre}\n` +
    `Fecha: ${fmtDate(cobro.fecha)}\n` +
    `Método: ${cobro.metodo_pago}\n` +
    (cobro.referencia ? `Referencia: ${cobro.referencia}\n` : '') +
    `\n💰 *Monto: $${fmt(cobro.monto)}*\n\n` +
    `Gracias por su pago.`;
}

function buildDeudaMessage(deudor: { nombre: string; total: number; ventas: number }) {
  return `📋 *Estado de Cuenta*\n\n` +
    `Cliente: ${deudor.nombre}\n` +
    `Ventas pendientes: ${deudor.ventas}\n` +
    `\n💳 *Saldo total: $${fmt(deudor.total)}*\n\n` +
    `Le recordamos amablemente que tiene un saldo pendiente. Agradecemos su pronto pago.`;
}

export default function CobranzaPage() {
  const { empresa } = useAuth();
  const isMobile = useIsMobile();
  const { fmt: fmtC } = useCurrency();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'cobros' | 'deudores'>('deudores');
  const { data: cobros, isLoading } = useCobros(search);
  const { data: deudores } = useClientesConDeuda();

  // WhatsApp preview state
  const [waOpen, setWaOpen] = useState(false);
  const [waMessage, setWaMessage] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [waRefId, setWaRefId] = useState<string | undefined>();
  const [waTipo, setWaTipo] = useState('recibo_cobro');

  const totalCobrado = cobros?.reduce((s, c) => s + (c.monto ?? 0), 0) ?? 0;
  const totalDeuda = deudores?.reduce((s, d) => s + d.total, 0) ?? 0;

  const openWaCobro = (cobro: any) => {
    setWaMessage(buildCobroMessage(cobro));
    setWaPhone((cobro.clientes as any)?.telefono ?? '');
    setWaRefId(cobro.id);
    setWaTipo('recibo_cobro');
    setWaOpen(true);
  };

  const openWaDeuda = (deudor: any) => {
    setWaMessage(buildDeudaMessage(deudor));
    setWaPhone(deudor.telefono ?? '');
    setWaRefId(deudor.id);
    setWaTipo('recordatorio_deuda');
    setWaOpen(true);
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Banknote className="h-5 w-5" /> Cobranza
        <HelpButton title={HELP.cobranza.title} sections={HELP.cobranza.sections} />
      </h1>

      {/* Summary */}
      <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-3")}>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total por cobrar</p>
          <p className="text-2xl font-bold text-destructive">{fmtC(totalDeuda)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Clientes con deuda</p>
          <p className="text-2xl font-bold text-warning">{deudores?.length ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Cobros registrados</p>
          <p className="text-2xl font-bold text-success">{cobros?.length ?? 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([['deudores', 'Clientes con deuda'], ['cobros', 'Historial de cobros']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
            tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>{label}</button>
        ))}
      </div>

      {tab === 'deudores' && (
        isMobile ? (
          <div className="space-y-2">
            {deudores?.map(d => (
              <MobileListCard
                key={d.id}
                title={d.nombre}
                subtitle={d.codigo}
                badge={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-[#25D366]"
                    onClick={e => { e.stopPropagation(); openWaDeuda(d); }}
                    title="Enviar recordatorio por WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                }
                fields={[
                  { label: 'Ventas pendientes', value: d.ventas },
                  { label: 'Saldo', value: <span className="text-destructive font-bold">{fmtC(d.total)}</span> },
                ]}
              />
            ))}
            {(!deudores || deudores.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">Sin deudores 🎉</div>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Código</TableHead>
                  <TableHead className="text-[11px]">Cliente</TableHead>
                  <TableHead className="text-[11px] text-center">Ventas pendientes</TableHead>
                  <TableHead className="text-[11px] text-right">Saldo total</TableHead>
                  <TableHead className="text-[11px] text-center w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deudores?.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{d.codigo}</TableCell>
                    <TableCell className="font-medium text-[12px]">{d.nombre}</TableCell>
                    <TableCell className="text-center">{d.ventas}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{fmtC(d.total)}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-[#25D366] hover:text-[#25D366]/80"
                        onClick={() => openWaDeuda(d)}
                        title="Enviar recordatorio por WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!deudores || deudores.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin deudores 🎉</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {tab === 'cobros' && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cobro..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isMobile ? (
            <div className="space-y-2">
              {cobros?.map(c => (
                <MobileListCard
                  key={c.id}
                  title={(c.clientes as any)?.nombre ?? '—'}
                  subtitle={fmtDate(c.fecha)}
                  badge={
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{c.metodo_pago}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-[#25D366]"
                        onClick={e => { e.stopPropagation(); openWaCobro(c); }}
                        title="Enviar recibo por WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  }
                  fields={[
                    ...(c.referencia ? [{ label: 'Ref', value: c.referencia }] : []),
                    { label: 'Monto', value: <span className="text-success font-bold">{fmtC(c.monto)}</span> },
                  ]}
                />
              ))}
              {isLoading && <div className="text-center py-8 text-muted-foreground">Cargando...</div>}
              {!isLoading && cobros?.length === 0 && <div className="text-center py-8 text-muted-foreground">Sin cobros</div>}
            </div>
          ) : (
            <div className="bg-card border border-border rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Fecha</TableHead>
                    <TableHead className="text-[11px]">Cliente</TableHead>
                    <TableHead className="text-[11px]">Método</TableHead>
                    <TableHead className="text-[11px]">Referencia</TableHead>
                    <TableHead className="text-[11px] text-right">Monto</TableHead>
                    <TableHead className="text-[11px] text-center w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cobros?.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                      <TableCell className="font-medium text-[12px]">{(c.clientes as any)?.nombre ?? '—'}</TableCell>
                      <TableCell className="text-[12px]"><Badge variant="outline">{c.metodo_pago}</Badge></TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{c.referencia ?? '—'}</TableCell>
                      <TableCell className="text-right font-bold text-success">$ {fmt(c.monto)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-[#25D366] hover:text-[#25D366]/80"
                          onClick={() => openWaCobro(c)}
                          title="Enviar recibo por WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
                  {!isLoading && cobros?.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin cobros</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* WhatsApp Preview Dialog */}
      <WhatsAppPreviewDialog
        open={waOpen}
        onClose={() => setWaOpen(false)}
        message={waMessage}
        phone={waPhone}
        empresaId={empresa?.id ?? ''}
        tipo={waTipo}
        referencia_id={waRefId}
      />
    </div>
  );
}
