import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type State = 'loading' | 'valid' | 'invalid' | 'already' | 'success' | 'error';

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('loading');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(r => r.json())
      .then(d => {
        if (d.valid) setState('valid');
        else if (d.reason === 'already_unsubscribed') setState('already');
        else setState('invalid');
      })
      .catch(() => setState('error'));
  }, [token]);

  const confirm = async () => {
    setProcessing(true);
    const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', { body: { token } });
    setProcessing(false);
    if (error) setState('error');
    else if ((data as any)?.reason === 'already_unsubscribed') setState('already');
    else setState('success');
  };

  return (
    <div className="min-h-[100dvh] bg-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {state === 'loading' && <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />}
        {state === 'valid' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Cancelar suscripción</h1>
            <p className="text-muted-foreground mb-6">¿Confirmas que quieres dejar de recibir correos de Rutapp?</p>
            <button onClick={confirm} disabled={processing} className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium disabled:opacity-50">
              {processing ? 'Procesando…' : 'Confirmar cancelación'}
            </button>
          </>
        )}
        {state === 'success' && (
          <><CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" /><h1 className="text-2xl font-bold">Listo</h1><p className="text-muted-foreground mt-2">No volverás a recibir correos.</p></>
        )}
        {state === 'already' && (
          <><CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" /><h1 className="text-2xl font-bold">Ya estabas dado de baja</h1></>
        )}
        {state === 'invalid' && (
          <><XCircle className="w-12 h-12 text-destructive mx-auto mb-3" /><h1 className="text-2xl font-bold">Enlace inválido</h1><p className="text-muted-foreground mt-2">Este enlace expiró o no es válido.</p></>
        )}
        {state === 'error' && (
          <><XCircle className="w-12 h-12 text-destructive mx-auto mb-3" /><h1 className="text-2xl font-bold">Algo falló</h1><p className="text-muted-foreground mt-2">Intenta de nuevo más tarde.</p></>
        )}
      </div>
    </div>
  );
}
