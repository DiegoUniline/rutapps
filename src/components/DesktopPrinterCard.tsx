import { useEffect, useState } from 'react';
import { Printer, Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AGENT_DOWNLOAD_WIN, AGENT_DOWNLOAD_MAC, isMac, getAgentStatus, getAgentPrinters, saveAgentConfig, printAgentTest, isDesktop,
  type AgentStatus,
} from '@/lib/desktopPrintAgent';

export default function DesktopPrinterCard() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState('');
  const [ancho, setAncho] = useState<'58' | '80'>('80');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  const load = async () => {
    setLoading(true);
    const st = await getAgentStatus(true);
    setStatus(st);
    if (st) {
      setAncho(st.ancho);
      try {
        const pl = await getAgentPrinters();
        setPrinters(pl.printers);
        setPrinter(st.printer || pl.default || pl.printers[0] || '');
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setLoading(false);
  };

  useEffect(() => { if (isDesktop()) load(); else setLoading(false); }, []);

  if (!isDesktop()) return null;

  const save = async () => {
    setBusy('save');
    try {
      await saveAgentConfig(printer, ancho);
      await load();
      toast.success('Impresora de escritorio guardada');
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  const test = async () => {
    setBusy('test');
    try {
      const r = await printAgentTest(printer, ancho);
      toast.success(`Prueba enviada a ${r.printer}`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <Printer className="h-4 w-4" /> Impresora de escritorio (cable / USB)
        <span className={cn('ml-auto text-[11px] font-medium', status ? 'text-green-600' : 'text-muted-foreground')}>
          {loading ? 'Buscando…' : status ? `Agente conectado v${status.version}` : 'Agente no detectado'}
        </span>
        <button onClick={load} className="text-muted-foreground hover:text-foreground" title="Volver a buscar">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </h3>

      {!loading && !status && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Descarga y abre <b>Rutapp Impresora</b> en esta computadora. Se instala solo y arranca al encender.{isMac() && ' En Mac usa Chrome o Edge.'}
            Si el navegador pregunta por acceso a la red local, permite el acceso.
          </p>
          <div className="flex flex-wrap gap-2">
            {([[AGENT_DOWNLOAD_WIN, 'Windows', !isMac()], [AGENT_DOWNLOAD_MAC, 'Mac', isMac()]] as const).map(([href, label, main]) => (
              <a
                key={label}
                href={href}
                download
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-semibold border',
                  main ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-secondary',
                )}
              >
                <Download className="h-4 w-4" /> Descargar para {label}
              </a>
            ))}
          </div>
        </div>
      )}

      {status && (
        <div className="mt-3 space-y-3 max-w-md">
          <select value={printer} onChange={e => setPrinter(e.target.value)} className="input-odoo w-full text-[13px]">
            {printers.length === 0 && <option value="">No hay impresoras instaladas</option>}
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="flex gap-2">
            {(['58', '80'] as const).map(v => (
              <button
                key={v}
                onClick={() => setAncho(v)}
                className={cn(
                  'flex-1 py-2 rounded-md text-[13px] font-semibold border transition-colors',
                  ancho === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-input hover:bg-secondary',
                )}
              >
                {v} mm
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={test} disabled={!printer || !!busy} className="flex-1 py-2 rounded-md border border-input text-[13px] font-semibold hover:bg-secondary disabled:opacity-50">
              {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Imprimir prueba'}
            </button>
            <button onClick={save} disabled={!printer || !!busy} className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-50">
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Guardar'}
            </button>
          </div>
          {status.printer && (
            <p className="text-[11px] text-muted-foreground">Guardada: <b>{status.printer}</b> · {status.ancho} mm. Los tickets en esta computadora se imprimen aquí.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Descargar agente: <a href={AGENT_DOWNLOAD_WIN} download className="underline">Windows</a> · <a href={AGENT_DOWNLOAD_MAC} download className="underline">Mac</a>
          </p>
        </div>
      )}
    </div>
  );
}
