import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, Warehouse, Tag, Package, Users, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SetupStep {
  key: string;
  icon: React.ElementType;
  title: string;
  description: string;
  link: string;
  linkLabel: string;
  check: (data: any) => boolean;
}

const STEPS: SetupStep[] = [
  {
    key: 'empresa',
    icon: Building2,
    title: 'Datos de tu empresa',
    description: 'Configura el nombre, logo, RFC y dirección de tu empresa para que aparezcan en tickets y documentos.',
    link: '/configuracion',
    linkLabel: 'Configurar empresa',
    check: (d) => !!(d.empresa?.rfc && d.empresa?.direccion && d.empresa?.nombre),
  },
  {
    key: 'almacen',
    icon: Warehouse,
    title: 'Almacenes y unidades',
    description: 'Revisa tu almacén principal y las unidades de medida. Puedes agregar más almacenes si manejas varias bodegas.',
    link: '/almacen/almacenes',
    linkLabel: 'Ver almacenes',
    check: (d) => (d.almacenesCount ?? 0) >= 1,
  },
  {
    key: 'tarifa',
    icon: Tag,
    title: 'Tarifas de precio',
    description: 'Configura tus tarifas con reglas por categoría o producto. Define márgenes, descuentos o precios fijos.',
    link: '/tarifas',
    linkLabel: 'Ver tarifas',
    check: (d) => (d.tarifaLineasCount ?? 0) >= 1,
  },
  {
    key: 'producto',
    icon: Package,
    title: 'Tu primer producto',
    description: 'Agrega al menos un producto con código, nombre y precio para empezar a vender.',
    link: '/productos/nuevo',
    linkLabel: 'Crear producto',
    check: (d) => (d.productosCount ?? 0) >= 1,
  },
  {
    key: 'cliente',
    icon: Users,
    title: 'Tu primer cliente',
    description: 'Registra un cliente con zona y vendedor asignado para comenzar a operar rutas y ventas.',
    link: '/clientes/nuevo',
    linkLabel: 'Crear cliente',
    check: (d) => (d.clientesCount ?? 0) >= 1,
  },
];

function useSetupData() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['setup-check', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eid = empresa!.id;
      const [empresaRes, almRes, tarifaRes, prodRes, cliRes] = await Promise.all([
        supabase.from('empresas').select('nombre, rfc, direccion, logo_url').eq('id', eid).single(),
        supabase.from('almacenes').select('id', { count: 'exact', head: true }).eq('empresa_id', eid),
        supabase.from('tarifa_lineas').select('id', { count: 'exact', head: true }).eq('tarifa_id', 
          (await supabase.from('tarifas').select('id').eq('empresa_id', eid).limit(1).single()).data?.id ?? ''
        ),
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('empresa_id', eid),
        supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', eid),
      ]);
      return {
        empresa: empresaRes.data,
        almacenesCount: almRes.count ?? 0,
        tarifaLineasCount: tarifaRes.count ?? 0,
        productosCount: prodRes.count ?? 0,
        clientesCount: cliRes.count ?? 0,
      };
    },
    staleTime: 10_000,
  });
}

export function useSetupComplete() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['setup-complete', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eid = empresa!.id;
      const [empresaRes, prodRes, cliRes] = await Promise.all([
        supabase.from('empresas').select('rfc, direccion, nombre').eq('id', eid).single(),
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('empresa_id', eid),
        supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', eid),
      ]);
      const emp = empresaRes.data;
      return !!(emp?.rfc && emp?.direccion && emp?.nombre) && (prodRes.count ?? 0) >= 1 && (cliRes.count ?? 0) >= 1;
    },
    staleTime: 30_000,
  });
}

export default function ConfiguracionInicialPage() {
  const { data, isLoading } = useSetupData();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground text-sm">Cargando...</div>
      </div>
    );
  }

  const pending = STEPS.filter(s => !s.check(data));
  const completed = STEPS.filter(s => s.check(data));
  const progress = completed.length / STEPS.length;

  if (pending.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">¡Todo listo!</h1>
        <p className="text-muted-foreground">Tu sistema está configurado y listo para operar.</p>
        <Link to="/dashboard" className="inline-flex items-center gap-2 mt-4 text-primary hover:underline font-medium">
          Ir al Dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Configuración inicial
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Completa estos pasos para empezar a usar el sistema. Cada sección desaparecerá al completarse.
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{completed.length} de {STEPS.length} completados</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Pending steps */}
      <div className="space-y-3">
        {pending.map((step, i) => (
          <div
            key={step.key}
            className={cn(
              "border border-border rounded-xl p-5 bg-card hover:shadow-md transition-shadow",
              i === 0 && "ring-2 ring-primary/30"
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                <step.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm">{step.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                <Link
                  to={step.link}
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-primary hover:underline"
                >
                  {step.linkLabel} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Completed section */}
      {completed.length > 0 && (
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Completados</p>
          {completed.map(step => (
            <div key={step.key} className="flex items-center gap-3 text-sm text-muted-foreground py-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="line-through">{step.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
