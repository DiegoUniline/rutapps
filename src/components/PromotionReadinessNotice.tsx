import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getPromotionReadinessCopy,
  type PromotionReadiness,
} from '@/lib/offlinePromotionSafety';

type Props = {
  status: PromotionReadiness;
  promotionCount: number;
  onRetry: () => void;
  showReady?: boolean;
  className?: string;
};

export function PromotionReadinessNotice({
  status,
  promotionCount,
  onRetry,
  showReady = false,
  className,
}: Props) {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // En operación normal no ocupa espacio. La confirmación positiva se muestra
  // al cobrar o cuando el equipo trabaja sin conexión.
  if (status === 'ready' && !showReady && isOnline) return null;

  const copy = getPromotionReadinessCopy({ status, promotionCount, isOnline });
  const toneClasses = {
    info: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100',
    warning: 'border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100',
  } as const;

  const Icon = status === 'loading'
    ? Loader2
    : status === 'error'
      ? (isOnline ? AlertTriangle : WifiOff)
      : CheckCircle2;

  return (
    <div className={cn('rounded-xl border px-3 py-2.5', toneClasses[copy.tone], className)} role={status === 'error' ? 'alert' : 'status'}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', status === 'loading' && 'animate-spin')} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold leading-tight">{copy.title}</p>
          <p className="mt-0.5 text-[10.5px] leading-snug opacity-85">{copy.description}</p>
        </div>
        {status === 'error' && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-current/25 bg-background/70 px-2.5 text-[10.5px] font-bold active:scale-95"
          >
            <RefreshCw className="h-3 w-3" />
            Comprobar
          </button>
        )}
      </div>
    </div>
  );
}
