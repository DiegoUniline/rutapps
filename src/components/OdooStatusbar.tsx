import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StatusbarStep {
  key: string;
  label: string;
}

interface OdooStatusbarProps {
  steps: StatusbarStep[];
  current: string;
  onStepClick?: (key: string) => void;
}

export function OdooStatusbar({ steps, current, onStepClick }: OdooStatusbarProps) {
  const currentIdx = steps.findIndex(s => s.key === current);
  const ref = useRef<HTMLDivElement>(null);

  // En pantallas angostas la barra se desplaza en horizontal: centra el paso actual.
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const active = el.children[currentIdx] as HTMLElement | undefined;
    if (active) el.scrollLeft = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
  }, [currentIdx, steps.length]);

  return (
    <div ref={ref} className="relative flex items-center max-w-full overflow-x-auto no-scrollbar">
      {steps.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const isPending = i > currentIdx;
        return (
          <button
            key={step.key}
            onClick={() => onStepClick?.(step.key)}
            className={cn(
              "statusbar-step",
              i === 0 && "rounded-l",
              i === steps.length - 1 && "rounded-r",
              isActive && "statusbar-step-active",
              isDone && "statusbar-step-done",
              isPending && "statusbar-step-pending",
            )}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
