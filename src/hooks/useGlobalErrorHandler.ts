import { useEffect } from 'react';
import { useErrorModal } from '@/components/ErrorModal';

/**
 * Catches unhandled promise rejections and shows the error modal.
 * Mount once at app level.
 */
export function useGlobalErrorHandler() {
  const { showError } = useErrorModal();

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      showError(event.reason);
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, [showError]);
}
