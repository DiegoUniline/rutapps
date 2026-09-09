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

function buttonText(button: HTMLButtonElement) {
  return button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/**
 * En el detalle del CRM existen dos launchers globales distintos:
 * 1) el launcher del pitch (Ver pitch / Configurar pitch)
 * 2) la biblioteca global (Pitch de llamadas)
 * Ninguno debe flotar encima del expediente.
 */
function floatingPitchButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(button => {
    const text = buttonText(button);
    const isPitchAction =
      text === 'Ver pitch de llamada' ||
      text === 'Pitch de llamadas' ||
      text === 'Configurar pitch';
    return isPitchAction && !!button.closest<HTMLElement>('.fixed');
  });
}

function hideFloatingPitchActions() {
  const hidden = new Set<HTMLElement>();
  floatingPitchButtons().forEach(button => {
    const fixed = button.closest<HTMLElement>('.fixed');
    if (!fixed || hidden.has(fixed)) return;
    fixed.dataset.crmPitchHidden = 'true';
    fixed.style.setProperty('display', 'none', 'important');
    hidden.add(fixed);
  });
}

function restoreFloatingPitchActions() {
  document.querySelectorAll<HTMLElement>('[data-crm-pitch-hidden="true"]').forEach(element => {
    element.style.removeProperty('display');
    delete element.dataset.crmPitchHidden;
  });
}

function findLauncherButton(kind: 'pitch' | 'config') {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  return buttons.find(button => {
    const text = buttonText(button);
    if (!button.closest<HTMLElement>('.fixed')) return false;
    return kind === 'pitch'
      ? text === 'Ver pitch de llamada'
      : text === 'Configurar pitch';
  }) ?? null;
}

function findHeaderActions() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  const anchor = buttons.find(button => {
    const text = buttonText(button);
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
      restoreFloatingPitchActions();
      setTarget(null);
      return;
    }

    let scheduled = false;
    const sync = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        hideFloatingPitchActions();
        setTarget(findHeaderActions());
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', sync);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      restoreFloatingPitchActions();
    };
  }, [route?.scope, route?.empresaId]);

  if (!route || !target) return null;

  const openPitch = () => {
    const source = findLauncherButton('pitch');
    if (source) source.click();
  };

  const openConfig = () => {
    const source = findLauncherButton('config');
    if (source) source.click();
  };

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
