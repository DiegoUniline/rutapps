import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { captureAppError } from '@/lib/observability';
import { refreshAppVersion } from '@/lib/appUpdate';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message?.toLowerCase() || '';
  return (
    msg.includes('importing a module script failed') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module')
  );
}

function chunkRecoveryKey(error: Error): string {
  const input = error.message || 'unknown-chunk';
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return `rutapp:chunk-recovery:${Math.abs(hash)}`;
}

function shouldAutoRecoverChunk(error: Error): boolean {
  try {
    const key = chunkRecoveryKey(error);
    const previous = Number(sessionStorage.getItem(key) || 0);
    const now = Date.now();

    // Evita ciclos de recarga si el hosting realmente tiene un problema.
    if (previous > 0 && now - previous < 5 * 60 * 1000) return false;

    sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    // Si sessionStorage no está disponible, preferimos un solo intento de
    // recuperación en memoria mediante el ciclo normal del ErrorBoundary.
    return true;
  }
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const chunkError = isChunkLoadError(error);

    // Un 404 de un chunk con hash suele significar que el usuario conserva un
    // bundle anterior mientras ya se publicó una versión nueva. No es falta de
    // internet. Si hay red, limpiamos SW/cachés y cargamos la versión actual.
    if (chunkError) {
      if (navigator.onLine && shouldAutoRecoverChunk(error)) {
        void refreshAppVersion().catch(() => window.location.reload());
      }
      return;
    }

    if (navigator.onLine) {
      captureAppError(error, {
        componentStack: errorInfo.componentStack,
        boundary: 'GlobalErrorBoundary',
      });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRefreshVersion = () => {
    void refreshAppVersion().catch(() => window.location.reload());
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoBack = () => {
    this.setState({ hasError: false, error: null });
    try {
      window.history.back();
    } catch {
      window.location.href = '/';
    }
  };

  render() {
    if (this.state.hasError) {
      const chunkError = isChunkLoadError(this.state.error);
      const offline = !navigator.onLine;

      // Solo mostrar "Sin conexión" cuando el navegador realmente reporta que
      // no hay red. Un chunk 404 estando online es una versión desactualizada.
      if (offline) {
        return (
          <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="pt-8 pb-4 flex justify-center">
                <div className="rounded-full p-4 bg-amber-50 text-amber-500">
                  <WifiOff className="h-8 w-8" />
                </div>
              </div>
              <div className="px-6 pb-2 text-center">
                <h2 className="text-lg font-bold text-slate-900 mb-2">Sin conexión a internet</h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">
                  No se pudo cargar esta sección porque no hay conexión. Las funciones que ya estaban abiertas siguen disponibles.
                </p>
                <div className="bg-amber-50 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-amber-700 font-medium flex items-start gap-2">
                    <span className="text-base leading-none mt-px">💡</span>
                    <span>Regresa a la pantalla anterior para seguir trabajando sin conexión, o espera a tener señal y recarga.</span>
                  </p>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-2">
                <button
                  onClick={this.handleGoBack}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl py-3 text-sm transition-colors"
                >
                  ← Regresar
                </button>
                <button
                  onClick={this.handleReload}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (chunkError) {
        return (
          <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="pt-8 pb-4 flex justify-center">
                <div className="rounded-full p-4 bg-blue-50 text-blue-600">
                  <RefreshCw className="h-8 w-8" />
                </div>
              </div>
              <div className="px-6 pb-2 text-center">
                <h2 className="text-lg font-bold text-slate-900 mb-2">Hay una versión nueva de RutApp</h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">
                  Esta sección pertenece a una versión anterior de la aplicación. Vamos a cargar los archivos actuales sin borrar tus datos guardados.
                </p>
                <div className="bg-blue-50 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-blue-700 font-medium">
                    Si la actualización automática no terminó, pulsa “Actualizar ahora”.
                  </p>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-2">
                <button
                  onClick={this.handleGoBack}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl py-3 text-sm transition-colors"
                >
                  ← Regresar
                </button>
                <button
                  onClick={this.handleRefreshVersion}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualizar ahora
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="pt-8 pb-4 flex justify-center">
              <div className="rounded-full p-4 bg-red-50 text-red-500">
                <AlertTriangle className="h-8 w-8" />
              </div>
            </div>
            <div className="px-6 pb-2 text-center">
              <h2 className="text-lg font-bold text-slate-900 mb-2">Ocurrió un error inesperado</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                La aplicación encontró un problema y no pudo continuar. Esto puede deberse a un error temporal.
              </p>
              <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs text-slate-500 font-medium flex items-start gap-2">
                  <span className="text-base leading-none mt-px">💡</span>
                  <span>Recarga la página para volver a intentar. Si el problema persiste, contacta soporte.</span>
                </p>
              </div>
              {this.state.error && (
                <div className="bg-slate-900 rounded-lg px-3 py-2 max-h-20 overflow-y-auto mb-4">
                  <code className="text-[10px] text-slate-300 break-all font-mono">{this.state.error.message}</code>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={this.handleDismiss}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl py-3 text-sm transition-colors"
              >
                Continuar
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
