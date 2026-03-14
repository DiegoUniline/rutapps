import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Phone, MapPin, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export default function RutaClientes() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['ruta-clientes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, codigo, nombre, telefono, direccion, colonia, status')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  const filtered = clientes?.filter(c =>
    !search || c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-3">
        <h1 className="text-[20px] font-bold text-foreground mb-3">Clientes</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 space-y-2 pb-4">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}
        {filtered?.map(c => (
          <div
            key={c.id}
            className="bg-card border border-border rounded-xl p-3.5 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold text-[14px]">
                  {c.nombre.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-foreground truncate">{c.nombre}</p>
                {c.codigo && <p className="text-[11px] text-muted-foreground">{c.codigo}</p>}
                {c.direccion && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" /> {c.direccion}{c.colonia ? `, ${c.colonia}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.telefono && (
                  <a
                    href={`tel:${c.telefono}`}
                    className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center text-success active:scale-90 transition-transform"
                    onClick={e => e.stopPropagation()}
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="w-9 h-9 rounded-xl bg-muted/10 flex items-center justify-center text-muted-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && filtered?.length === 0 && (
          <p className="text-center text-muted-foreground text-[13px] py-8">No hay clientes</p>
        )}
      </div>
    </div>
  );
}
