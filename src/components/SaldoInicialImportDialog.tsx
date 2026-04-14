import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { parseFile, type ImportColumn } from '@/lib/importUtils';
import * as XLSX from 'xlsx';

const SALDO_COLUMNS: ImportColumn[] = [
  { key: 'codigo_cliente', header: 'Codigo Cliente', required: true },
  { key: 'nombre_cliente', header: 'Nombre Cliente', required: false },
  { key: 'monto', header: 'Monto', required: true },
  { key: 'fecha', header: 'Fecha', required: false },
  { key: 'concepto', header: 'Concepto', required: false },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function SaldoInicialImportDialog({ open, onOpenChange }: Props) {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [progress, setProgress] = useState(0);
  const [resultOk, setResultOk] = useState(0);
  const [resultErrors, setResultErrors] = useState<string[]>([]);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setRows([]);
    setProgress(0);
    setResultOk(0);
    setResultErrors([]);
  }, []);

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const handleFileSelect = async (f: File) => {
    try {
      setFile(f);
      const parsed = await parseFile(f);
      if (parsed.length === 0) {
        toast.error('El archivo está vacío');
        return;
      }
      setRows(parsed);
      setStep('preview');
    } catch {
      toast.error('Error al leer el archivo');
    }
  };

  const handleImport = async () => {
    if (!empresa?.id) return;
    setStep('importing');
    setProgress(0);

    // Fetch all clients to map codigo -> id
    const { data: clientes } = await supabase
      .from('clientes')
      .select('id, codigo')
      .eq('empresa_id', empresa.id);
    const cliMap = new Map((clientes ?? []).map(c => [(c.codigo ?? '').toLowerCase(), c.id]));

    let ok = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      setProgress(Math.round(((i + 1) / rows.length) * 100));

      // Resolve client
      const codigoRaw = String(row.codigo_cliente ?? row['Codigo Cliente'] ?? '').trim();
      const clienteId = cliMap.get(codigoRaw.toLowerCase());
      if (!clienteId) {
        errors.push(`Fila ${rowNum}: Cliente "${codigoRaw}" no encontrado`);
        continue;
      }

      // Parse monto
      const monto = parseFloat(String(row.monto ?? row.Monto ?? '0').replace(/[^0-9.-]/g, ''));
      if (!monto || monto <= 0) {
        errors.push(`Fila ${rowNum}: Monto inválido`);
        continue;
      }

      // Parse fecha
      let fecha = new Date().toISOString().slice(0, 10);
      const rawFecha = row.fecha ?? row.Fecha;
      if (rawFecha) {
        const d = new Date(rawFecha);
        if (!isNaN(d.getTime())) fecha = d.toISOString().slice(0, 10);
      }

      const concepto = String(row.concepto ?? row.Concepto ?? 'Saldo anterior').trim() || 'Saldo anterior';

      try {
        const { error } = await supabase.rpc('registrar_saldo_inicial', {
          p_empresa_id: empresa.id,
          p_cliente_id: clienteId,
          p_monto: monto,
          p_fecha: fecha,
          p_concepto: concepto,
        });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        errors.push(`Fila ${rowNum}: ${e.message}`);
      }
    }

    setResultOk(ok);
    setResultErrors(errors);
    setStep('done');
    qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
    qc.invalidateQueries({ queryKey: ['saldos-iniciales'] });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar saldos iniciales</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Sube un archivo Excel (.xlsx) o CSV con las columnas: <strong>Codigo Cliente</strong>, <strong>Monto</strong>, Fecha (opcional), Concepto (opcional).
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={async () => {
                const { data: clientes } = await supabase
                  .from('clientes')
                  .select('codigo, nombre')
                  .eq('empresa_id', empresa!.id)
                  .order('codigo');
                const wb = XLSX.utils.book_new();
                const headers = SALDO_COLUMNS.map(c => c.header);
                const rows = (clientes ?? []).map(c => [c.codigo ?? '', c.nombre ?? '', '', '', '']);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
                XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
                XLSX.writeFile(wb, 'plantilla_saldos_iniciales.xlsx');
              }}>
                <Download className="h-4 w-4" /> Descargar plantilla
              </Button>
            </div>
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFileSelect(f);
              }}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Arrastra tu archivo aquí o haz clic para seleccionar</p>
              <p className="text-[11px] text-muted-foreground mt-1">.xlsx o .csv</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{file?.name}</span>
              <span className="text-xs text-muted-foreground">({rows.length} filas)</span>
            </div>
            <div className="max-h-48 overflow-auto border border-border rounded text-xs">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-2 py-1 text-left">#</th>
                    {SALDO_COLUMNS.map(c => <th key={c.key} className="px-2 py-1 text-left">{c.header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      {SALDO_COLUMNS.map(c => (
                        <td key={c.key} className="px-2 py-1">{String(r[c.key] ?? r[c.header] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && <p className="text-center text-muted-foreground py-1">...y {rows.length - 10} filas más</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={handleImport} className="gap-2">
                <Upload className="h-4 w-4" /> Importar {rows.length} saldos
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 space-y-4 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando saldos...</p>
            <Progress value={progress} className="max-w-xs mx-auto" />
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {step === 'done' && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">{resultOk} saldos registrados correctamente</span>
            </div>
            {resultErrors.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">{resultErrors.length} errores</span>
                </div>
                <div className="max-h-32 overflow-auto bg-muted rounded p-2 text-xs space-y-0.5">
                  {resultErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
