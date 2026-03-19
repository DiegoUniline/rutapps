/**
 * Global error display singleton.
 * Call showAppError(error) from anywhere — hooks, event handlers, async functions.
 * The ErrorModalProvider in App.tsx subscribes to this.
 */

type ErrorListener = (error: unknown) => void;

let _listener: ErrorListener | null = null;

export function subscribeErrorModal(listener: ErrorListener) {
  _listener = listener;
  return () => { _listener = null; };
}

export function showAppError(error: unknown) {
  if (_listener) {
    _listener(error);
  } else {
    // Fallback: log to console if no modal is mounted
    console.error('[AppError]', error);
  }
}
