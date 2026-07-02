import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Shield, LogOut, BarChart3, Building2, CreditCard, Receipt, MessageCircle, Bell, ArrowLeft, BanknoteIcon, Megaphone, Store, UserX, Ticket, Radio, Database, Calculator, ShieldAlert, Handshake, ShieldCheck, Bot, Sparkles, Menu, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminInactivosTab from '@/components/admin/AdminInactivosTab';
import AdminStatsTab from '@/components/admin/AdminStatsTab';
import AdminEmpresasTab from '@/components/admin/AdminEmpresasTab';
import AdminSubscriptionsTab from '@/components/admin/AdminSubscriptionsTab';
import AdminEmpresaDetail from '@/components/admin/AdminEmpresaDetail';
import AdminInvoicesTab from '@/components/admin/AdminInvoicesTab';
import AdminPagosTab from '@/components/admin/AdminPagosTab';
import AdminWhatsAppTab from '@/components/admin/AdminWhatsAppTab';
import AdminNotificationsTab from '@/components/admin/AdminNotificationsTab';
import AdminPaymentRequestsTab from '@/components/admin/AdminPaymentRequestsTab';
import AdminAnunciosTab from '@/components/admin/AdminAnunciosTab';
import AdminPublicidadTab from '@/components/admin/AdminPublicidadTab';
import AdminCobrosTab from '@/components/admin/AdminCobrosTab';
import AdminRegistrosIncompletosTab from '@/components/admin/AdminRegistrosIncompletosTab';
import AdminCuponesTab from '@/components/admin/AdminCuponesTab';
import AdminWaCampaignsTab from '@/components/admin/AdminWaCampaignsTab';
import AdminPosTab from '@/components/admin/AdminPosTab';
import AdminWaBotTab from '@/components/admin/AdminWaBotTab';
import PartnersInlineTab from '@/components/admin/PartnersInlineTab';
import ControlPage from '@/pages/ControlPage';
import AdminBroadcastTab from '@/components/admin/AdminBroadcastTab';

type TabKey =
  | 'dashboard' | 'empresas' | 'subscriptions' | 'invoices' | 'pagos' | 'whatsapp'
  | 'notifications' | 'payment_requests' | 'anuncios' | 'publicidad' | 'cobros'
  | 'incompletos' | 'cupones' | 'campanas' | 'pos' | 'partners' | 'inactivos' | 'control' | 'wa_bot' | 'broadcast';

const NAV: { key: TabKey; label: string; icon: any; danger?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'empresas', label: 'Empresas', icon: Building2 },
  { key: 'subscriptions', label: 'Suscripciones', icon: CreditCard },
  { key: 'invoices', label: 'Facturas', icon: Receipt },
  { key: 'pagos', label: 'Pagos', icon: Wallet },
  { key: 'partners', label: 'Partners', icon: Handshake },
  { key: 'control', label: 'Control', icon: ShieldCheck },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'wa_bot', label: 'Bot WhatsApp', icon: Bot },
  { key: 'notifications', label: 'Historial', icon: Bell },
  { key: 'broadcast', label: 'Mensajes en vivo', icon: Megaphone },
  { key: 'payment_requests', label: 'Pagos transferencia', icon: BanknoteIcon },
  { key: 'anuncios', label: 'Anuncios', icon: Megaphone },
  { key: 'publicidad', label: 'Publicidad ✨', icon: Sparkles },
  { key: 'cobros', label: 'Cobros', icon: Store },
  { key: 'incompletos', label: 'Registros incompletos', icon: UserX },
  { key: 'cupones', label: 'Cupones', icon: Ticket },
  { key: 'campanas', label: 'Campañas WA', icon: Radio },
  { key: 'pos', label: 'Punto de Venta', icon: Calculator },
  { key: 'inactivos', label: 'Inactivos', icon: ShieldAlert, danger: true },
];

interface NavListProps {
  tab: TabKey;
  selectedEmpresaId: string | null;
  onSelect: (k: TabKey) => void;
  signOut: () => void;
  navigate: (path: string) => void;
}

function NavList({ tab, selectedEmpresaId, onSelect, signOut, navigate }: NavListProps) {
  return (
    <>
      <div className="px-4 py-4 border-b border-border flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm leading-tight">Panel Master</div>
          <div className="text-[10px] text-muted-foreground">Control total</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV.map(item => {
          const active = tab === item.key && !selectedEmpresaId;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                active
                  ? (item.danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground')
                  : (item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-muted')
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-border space-y-1">
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate('/super-admin/database-health')}>
          <Database className="h-4 w-4 mr-2" /> Salud de BD
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver a la app
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Salir
        </Button>
      </div>
    </>
  );
}

export default function SuperAdminPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [selectedEmpresaTab, setSelectedEmpresaTab] = useState<'usuarios' | 'facturas' | 'pagos' | 'historial'>('usuarios');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = sessionStorage.getItem('sa-tab') as TabKey | null;
    return saved || 'empresas';
  });

  useEffect(() => { sessionStorage.setItem('sa-tab', tab); }, [tab]);

  useEffect(() => {
    if (!user) return;
    supabase.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsSuperAdmin(!!data));
  }, [user]);

  if (isSuperAdmin === null) {
    return <div className="flex items-center justify-center min-h-[100dvh] text-muted-foreground">Verificando permisos...</div>;
  }
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  const handleSelect = (k: TabKey) => {
    setTab(k);
    setSelectedEmpresaId(null);
    setMobileOpen(false);
  };

  const activeLabel = NAV.find(n => n.key === tab)?.label ?? 'Panel Master';

  return (
    <div className="min-h-[100dvh] bg-background flex w-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-card flex-col sticky top-0 h-[100dvh]">
        <NavList tab={tab} selectedEmpresaId={selectedEmpresaId} onSelect={handleSelect} signOut={signOut} navigate={navigate} />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 bg-card border-b border-border flex items-center gap-2 px-3 h-12">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 -ml-1">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 flex flex-col">
              <NavList tab={tab} selectedEmpresaId={selectedEmpresaId} onSelect={handleSelect} signOut={signOut} navigate={navigate} />
            </SheetContent>
          </Sheet>
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground leading-none">Panel Master</div>
            <div className="text-sm font-bold truncate leading-tight">{selectedEmpresaId ? 'Detalle empresa' : activeLabel}</div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 min-w-0 px-3 sm:px-6 py-4 sm:py-6 max-w-full overflow-x-hidden">
          {selectedEmpresaId ? (
            <AdminEmpresaDetail empresaId={selectedEmpresaId} initialTab={selectedEmpresaTab} onBack={() => setSelectedEmpresaId(null)} />
          ) : (
            <>
              {tab === 'dashboard' && <AdminStatsTab onSelectEmpresa={(id) => { setSelectedEmpresaTab('usuarios'); setSelectedEmpresaId(id); }} />}
              {tab === 'empresas' && <AdminEmpresasTab onSelectEmpresa={(id) => { setSelectedEmpresaTab('usuarios'); setSelectedEmpresaId(id); }} />}
              {tab === 'subscriptions' && <AdminSubscriptionsTab />}
              {tab === 'invoices' && <AdminInvoicesTab />}
              {tab === 'pagos' && <AdminPagosTab onSelectEmpresa={(id, t) => { setSelectedEmpresaTab(t || 'pagos'); setSelectedEmpresaId(id); }} />}
              {tab === 'partners' && <PartnersInlineTab />}
              {tab === 'control' && <ControlPage />}
              {tab === 'whatsapp' && <AdminWhatsAppTab />}
              {tab === 'wa_bot' && <AdminWaBotTab />}
              {tab === 'notifications' && <AdminNotificationsTab />}
              {tab === 'broadcast' && <AdminBroadcastTab />}
              {tab === 'payment_requests' && <AdminPaymentRequestsTab />}
              {tab === 'anuncios' && <AdminAnunciosTab />}
              {tab === 'publicidad' && <AdminPublicidadTab />}
              {tab === 'cobros' && <AdminCobrosTab />}
              {tab === 'incompletos' && <AdminRegistrosIncompletosTab />}
              {tab === 'cupones' && <AdminCuponesTab />}
              {tab === 'campanas' && <AdminWaCampaignsTab />}
              {tab === 'pos' && <AdminPosTab />}
              {tab === 'inactivos' && <AdminInactivosTab />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
