import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useQuiebres } from '@/hooks/useLogistica';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/TableSkeleton';

export default function QuiebresPage() {
  const [fecha] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: quiebres, isLoading } = useQuiebres(fecha);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> Quiebres de stock
        </h1>
        <p className="text-sm text-muted-foreground">Productos donde la cantidad pedida supera el stock disponible</p>
      </div>

      {isLoading ? <TableSkeleton /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Pedido total</TableHead>
                <TableHead className="text-right">Stock disponible</TableHead>
                <TableHead className="text-right">Faltante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!quiebres || quiebres.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Sin quiebres detectados hoy 🎉
                </TableCell></TableRow>
              )}
              {quiebres?.map(q => {
                const faltante = q.pedido_total - q.stock;
                return (
                  <TableRow key={q.producto_id} className="hover:bg-accent/40">
                    <TableCell className="font-mono text-[13px]">{q.codigo}</TableCell>
                    <TableCell>{q.nombre}</TableCell>
                    <TableCell className="text-right font-mono">{q.pedido_total}</TableCell>
                    <TableCell className="text-right font-mono">{q.stock}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive" className="font-mono">-{faltante}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
