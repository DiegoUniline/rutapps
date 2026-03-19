import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
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
