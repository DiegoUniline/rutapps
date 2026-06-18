import { useMemo } from 'react';
import { todayLocal } from '@/lib/utils';

type Preset = 'hoy' | 'semana' | 'mes' | 'trimestre' | 'año';

interface Props {
  desde: string;
  hasta: string;
  onDesdeChange: (v: string) => void;
  onHastaChange: (v: string) => void;
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'año', label: 'Año' },
];

const toYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function DatePresetButtons({ desde, hasta, onDesdeChange, onHastaChange }: Props) {
  const activePreset = useMemo(() => {
    const today = todayLocal();
    if (desde === today && hasta === today) return 'hoy';
    const t = new Date(today + 'T12:00:00');
    const y = t.getFullYear();
    const m = t.getMonth();
    const d = t.getDate();
    const dayOfWeek = t.getDay();
    const diff = (dayOfWeek + 6) % 7;
    const monday = new Date(t);
    monday.setDate(d - diff);
    if (desde === toYmd(monday) && hasta === today) return 'semana';
    const firstMonth = new Date(y, m, 1);
    if (desde === toYmd(firstMonth) && hasta === today) return 'mes';
    const qm = Math.floor(m / 3) * 3;
    const firstQuarter = new Date(y, qm, 1);
    if (desde === toYmd(firstQuarter) && hasta === today) return 'trimestre';
    const firstYear = new Date(y, 0, 1);
    if (desde === toYmd(firstYear) && hasta === today) return 'año';
    return null;
  }, [desde, hasta]);

  const applyPreset = (key: Preset) => {
    const today = todayLocal();
    const t = new Date(today + 'T12:00:00');
    const y = t.getFullYear();
    const m = t.getMonth();
    const d = t.getDate();
    let desde = today;
    let hasta = today;
    switch (key) {
      case 'hoy':
        break;
      case 'semana': {
        const diff = (t.getDay() + 6) % 7;
        const monday = new Date(t);
        monday.setDate(d - diff);
        desde = toYmd(monday);
        break;
      }
      case 'mes':
        desde = toYmd(new Date(y, m, 1));
        break;
      case 'trimestre': {
        const qm = Math.floor(m / 3) * 3;
        desde = toYmd(new Date(y, qm, 1));
        break;
      }
      case 'año':
        desde = toYmd(new Date(y, 0, 1));
        break;
    }
    onDesdeChange(desde);
    onHastaChange(hasta);
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {PRESETS.map(p => {
        const active = activePreset === p.key;
        return (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border hover:border-primary/50'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
