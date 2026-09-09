import { createContext, type ReactNode, useContext } from 'react';

export interface DateRangeFieldOption {
  value: string;
  label: string;
}

interface DateRangeFieldContextValue {
  value: string;
  onChange: (value: string) => void;
  options: DateRangeFieldOption[];
}

const DateRangeFieldContext = createContext<DateRangeFieldContextValue | null>(null);

export function DateRangeFieldProvider({
  value,
  onChange,
  options,
  children,
}: DateRangeFieldContextValue & { children: ReactNode }) {
  return (
    <DateRangeFieldContext.Provider value={{ value, onChange, options }}>
      {children}
    </DateRangeFieldContext.Provider>
  );
}

export function useDateRangeField() {
  return useContext(DateRangeFieldContext);
}
