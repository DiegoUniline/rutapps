import { useState } from 'react';
import { DateRangeFieldProvider, type DateRangeFieldOption } from '@/contexts/DateRangeFieldContext';
import EntregaListPageLegacy from './EntregaListPageLegacy';

const DATE_FIELD_OPTIONS: DateRangeFieldOption[] = [
  { value: 'levantamiento', label: 'Fecha de levantamiento' },
  { value: 'programada', label: 'Fecha programada de entrega' },
];

/**
 * Mantiene intacta la pantalla operativa de Entregas y le inyecta únicamente
 * la semántica del rango de fechas. DateRangePicker muestra el selector junto
 * al calendario y useEntregasWorkspaceList aplica el campo correcto en SQL.
 */
export default function EntregaListPage() {
  const [dateField, setDateField] = useState('programada');

  return (
    <DateRangeFieldProvider
      value={dateField}
      onChange={setDateField}
      options={DATE_FIELD_OPTIONS}
    >
      <EntregaListPageLegacy />
    </DateRangeFieldProvider>
  );
}
