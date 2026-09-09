import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CrmRoute = {
  scope: 'super-admin' | 'equipo';
  empresaId: string;
};

function currentRoute(): CrmRoute | null {
  const match = window.location.pathname.match(/^\/(super-admin|equipo)\/crm\/([^/]+)/);
  return match ? { scope: match[1] as CrmRoute['scope'], empresaId: match[2] } : null;
}

function findOriginalLauncher(label: 'pitch' | 'config') {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  return buttons.find(button => {
    const text = button.textContent?.trim() ?? '';
    const isMatch = label === 'pitch'
      ? text.includes('Ver pitch de llamada')
      : text.includes('Configurar pitch');
    return isMatch && !!button.closest('div.fixed.bottom-5.right-5');
  }) ?? null;
}

function findHeaderActions() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  const anchor = buttons.find(button => {
    const text = button.textContent?.trim() ?? '';
    return text.includes('Marcar perdido') || text.includes('Crear oferta') || text.includes('Reemplazar oferta');
  });
  if (!anchor) return null;
  const parent = anchor.parentElement;
  return parent instanceof HTMLElement ? parent : null;
}

export default function CrmPitchHeaderActions() {
  const [route, setRoute] = useState<CrmRoute | null>(() => currentRoute());
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const syncRoute = () => setRoute(currentRoute());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('rutapp:navigation', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('rutapp:navigation', syncRoute);
    };
  }, []);

  useEffect(() => {
    if (!route) {
      setTarget(null);
      return;
    }

    const sync = () => {
      const originalPitch = findOriginalLauncher('pitch');
      const originalConfig = findOriginalLauncher('config');
      const floating = originalPitch?.closest<HTMLElement>('div.fixed.bottom-5.right-5')
        ?? originalConfig?.closest<HTMLElement>('div.fixed.bottom-5.right-5');
      if (floating) floating.style.display = 'none';
      setTarget(findHeaderActions());
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(sync, 250);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      const originalPitch = findOriginalLauncher('pitch');
      const originalConfig = findOriginalLauncher('config');
      const floating = originalPitch?.closest<HTMLElement>('div.fixed.bottom-5.right-5')
        ?? originalConfig?.closest<HTMLElement>('div.fixed.bottom-5.right-5');
      if (floating) floating.style.display = '';
    };
  }, [route?.scope, route?.empresaId]);

  if (!route || !target) return null;

  const openPitch = () => findOriginalLauncher('pitch')?.click();
  const openConfig = () => findOriginalLauncher('config')?.click();

  return createPortal(
    <>
      <Button variant="outline" onClick={openPitch} className="border-primary/25">
        <BookOpen className="mr-2 h-4 w-4" />
        Pitch de llamadas
      </Button>
      {route.scope === 'super-admin' && (
        <Button variant="outline" onClick={openConfig}>
          <PencilLine className="mr-2 h-4 w-4" />
          Configurar pitch
        </Button>
      )}
    </>,
    target,
  );
}
