import { useState, useRef, useCallback } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import {
  parseFile,
  downloadTemplate,
  importProducts,
  importClients,
  PRODUCT_IMPORT_COLUMNS,
  CLIENT_IMPORT_COLUMNS,
  type ImportResult,
  type ImportColumn,
} from '@/lib/importUtils';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ImportType = 'productos' | 'clientes';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ImportType;
}

export function ImportDialog({ open, onOpenChange, type }: ImportDialogProps) {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  const columns: ImportColumn[] = type === 'productos' ? PRODUCT_IMPORT_COLUMNS : CLIENT_IMPORT_COLUMNS;
  const label = type === 'productos' ? 'Productos' : 'Clientes';

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setRows([]);
    setResult(null);
    setProgress(0);
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
        toast.error('El archivo está vacío o no tiene datos válidos');
        return;
      }
      setRows(parsed);
      setStep('preview');
    } catch {
      toast.error('Error al leer el archivo. Verifica el formato.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const startImport = async () => {
    if (!empresa?.id) return;
    setStep('importing');
    setProgress(10);

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 5, 90));
    }, 500);

    try {
      const res = type === 'productos'
        ? await importProducts(rows, empresa.id)
        : await importClients(rows, empresa.id);

      clearInterval(interval);
      setProgress(100);
      setResult(res);
      setStep('done');

      // Invalidate queries
      qc.invalidateQueries({ queryKey: [type === 'productos' ? 'productos' : 'clientes'] });
      // Also invalidate catalogs that may have been auto-created
      ['marcas', 'clasificaciones', 'proveedores', 'listas', 'unidades', 'zonas', 'vendedores', 'cobradores'].forEach(k =>
        qc.invalidateQueries({ queryKey: [k] })
      );

      if (res.errors.length === 0) {
        toast.success(`Importación completada: ${res.created} creados, ${res.updated} actualizados`);
      } else {
        toast.warning(`Importación con ${res.errors.length} errores`);
      }
    } catch (err: any) {
      clearInterval(interval);
      toast.error('Error durante la importación: ' + (err.message || ''));
      setStep('preview');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar {label}
          </DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Sube un archivo Excel o CSV con tus {label.toLowerCase()}.
              </p>
              <button
                onClick={() => downloadTemplate(columns, `Plantilla_${label}`)}
                className="btn-odoo-secondary text-xs gap-1"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar plantilla
              </button>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">
                Arrastra tu archivo aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Formatos: .xlsx, .xls, .csv — Máx. 20 MB
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />

            <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">💡 Tips:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Descarga la plantilla para ver el formato correcto</li>
                <li>Si un catálogo (marca, zona, etc.) no existe, se creará automáticamente</li>
                <li>Si el código ya existe, se actualizarán los datos</li>
                <li>Los campos <strong>Nombre</strong> {type === 'productos' && <> y <strong>Código</strong></>} son obligatorios</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{file?.name}</p>
                <p className="text-xs text-muted-foreground">{rows.length} registros encontrados</p>
              </div>
              <button onClick={reset} className="btn-odoo-secondary text-xs gap-1">
                <X className="h-3.5 w-3.5" /> Cambiar archivo
              </button>
            </div>

            {/* Preview table */}
            <div className="border border-border rounded overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">#</th>
                    {Object.keys(rows[0] || {}).slice(0, 6).map(k => (
                      <th key={k} className="px-2 py-1.5 text-left text-muted-foreground font-medium whitespace-nowrap">{k}</th>
                    ))}
                    {Object.keys(rows[0] || {}).length > 6 && (
                      <th className="px-2 py-1.5 text-muted-foreground">...</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      {Object.values(r).slice(0, 6).map((v, j) => (
                        <td key={j} className="px-2 py-1 whitespace-nowrap max-w-[150px] truncate">{String(v ?? '')}</td>
                      ))}
                      {Object.keys(r).length > 6 && <td className="px-2 py-1 text-muted-foreground">...</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">...y {rows.length - 5} registros más</p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => handleClose(false)} className="btn-odoo-secondary">Cancelar</button>
              <button onClick={startImport} className="btn-odoo-primary gap-1">
                <Upload className="h-3.5 w-3.5" />
                Importar {rows.length} registros
              </button>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="py-8 space-y-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="text-sm font-medium">Importando {label.toLowerCase()}...</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Creando catálogos faltantes y procesando registros
            </p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="text-center py-4">
              {result.errors.length === 0 ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-success mb-2" />
              ) : (
                <AlertCircle className="h-12 w-12 mx-auto text-warning mb-2" />
              )}
              <h3 className="font-semibold text-lg">Importación completada</h3>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-2xl font-bold text-foreground">{result.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="bg-success/10 rounded-lg p-3">
                <p className="text-2xl font-bold text-success">{result.created}</p>
                <p className="text-xs text-muted-foreground">Creados</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3">
                <p className="text-2xl font-bold text-primary">{result.updated}</p>
                <p className="text-xs text-muted-foreground">Actualizados</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-destructive/10 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-destructive mb-2">
                  {result.errors.length} errores:
                </p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive/80">
                    Fila {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => handleClose(false)} className="btn-odoo-primary">
                Cerrar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
