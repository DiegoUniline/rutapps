import { describe, expect, it } from 'vitest';
import {
  activeManagerOptions,
  attributionChanged,
  commissionChannelLabel,
  directReportCounts,
  wouldCreateManagementCycle,
} from '@/lib/commissionAdmin';

const people = [
  { id: 'director', manager_id: null, is_active: true },
  { id: 'manager', manager_id: 'director', is_active: true },
  { id: 'seller', manager_id: 'manager', is_active: true },
  { id: 'inactive', manager_id: null, is_active: false },
];

describe('commissionAdmin', () => {
  it('impide asignarse a sí mismo o crear un ciclo indirecto', () => {
    expect(wouldCreateManagementCycle('director', 'director', people)).toBe(true);
    expect(wouldCreateManagementCycle('director', 'seller', people)).toBe(true);
    expect(wouldCreateManagementCycle('seller', 'director', people)).toBe(false);
  });

  it('solo ofrece encargados activos que no formen ciclos', () => {
    const options = activeManagerOptions('manager', people).map(person => person.id);
    expect(options).toEqual(['director']);
  });

  it('cuenta únicamente colaboradores directos', () => {
    const counts = directReportCounts(people);
    expect(counts.get('director')).toBe(1);
    expect(counts.get('manager')).toBe(1);
    expect(counts.get('seller')).toBeUndefined();
  });

  it('distingue una reasignación real de un guardado idéntico', () => {
    const current = {
      captured_by_id: 'seller', managed_by_id: 'manager', channel: 'whatsapp', notes: null,
    };
    expect(attributionChanged(current, current)).toBe(false);
    expect(attributionChanged(current, { ...current, managed_by_id: 'director' })).toBe(true);
  });

  it('presenta los canales con nombres entendibles', () => {
    expect(commissionChannelLabel('partner_link')).toBe('Enlace de partner');
    expect(commissionChannelLabel('whatsapp')).toBe('WhatsApp');
  });
});
