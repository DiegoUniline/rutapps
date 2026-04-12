import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Warehouse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AlmacenRequeridoDialog({ open, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <Warehouse className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">Almacén no asignado</DialogTitle>
          <DialogDescription className="text-center">
            Para operar necesitas tener un almacén asignado a tu perfil. Ve a Configuración → Usuarios, busca tu usuario y asígnate un almacén.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={() => { onClose(); navigate('/configuracion/usuarios'); }}>
            Ir a Usuarios
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
