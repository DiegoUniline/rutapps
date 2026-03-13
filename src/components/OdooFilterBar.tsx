import { Search, Filter, ChevronDown } from 'lucide-react';

interface OdooFilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}

export function OdooFilterBar({ search, onSearchChange, placeholder = 'Buscar...', children }: OdooFilterBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="input-odoo pl-8"
        />
      </div>
      <button className="btn-odoo-secondary flex items-center gap-1">
        <Filter className="h-3.5 w-3.5" />
        Filtros
        <ChevronDown className="h-3 w-3" />
      </button>
      <button className="btn-odoo-secondary flex items-center gap-1">
        Agrupar por
        <ChevronDown className="h-3 w-3" />
      </button>
      {children}
    </div>
  );
}
