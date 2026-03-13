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

  return (
    <div className="flex items-center">
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
