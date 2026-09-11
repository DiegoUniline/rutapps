type UnsavedEntry = {
  key: string;
  label: string;
};

const entries = new Map<string, UnsavedEntry>();
const CHANGE_EVENT = 'uniline:unsaved-changes-changed';

function notify() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function setUnsavedChanges(key: string, label: string, active: boolean) {
  if (!key) return;

  if (active) {
    entries.set(key, { key, label: label || 'Cambios sin guardar' });
  } else {
    entries.delete(key);
  }

  notify();
}

export function hasUnsavedChanges() {
  return entries.size > 0;
}

export function getUnsavedChanges(): UnsavedEntry[] {
  return Array.from(entries.values());
}

export function subscribeUnsavedChanges(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
