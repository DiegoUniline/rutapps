import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, LogOut, BarChart3, Building2, CreditCard, Receipt, MessageCircle, Bell, ArrowLeft } from 'lucide-react';
import AdminStatsTab from '@/components/admin/AdminStatsTab';
import AdminEmpresasTab from '@/components/admin/AdminEmpresasTab';
import AdminSubscriptionsTab from '@/components/admin/AdminSubscriptionsTab';
import AdminInvoicesTab from '@/components/admin/AdminInvoicesTab';
import AdminWhatsAppTab from '@/components/admin/AdminWhatsAppTab';
import AdminNotificationsTab from '@/components/admin/AdminNotificationsTab';

export default function SuperAdminPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsSuperAdmin(!!data));
  }, [user]);

  if (isSuperAdmin === null) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Verificando permisos...</div>;
  }
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Panel Master</h1>
              <p className="text-xs text-muted-foreground">Control total de empresas, suscripciones y facturación</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4 mr-1.5" /> Salir
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="bg-card border border-border/60 p-1 h-auto flex-wrap">
            <TabsTrigger value="dashboard" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="empresas" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-4 w-4" /> Empresas
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="h-4 w-4" /> Suscripciones
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Receipt className="h-4 w-4" /> Facturas
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Bell className="h-4 w-4" /> Historial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><AdminStatsTab /></TabsContent>
          <TabsContent value="empresas"><AdminEmpresasTab /></TabsContent>
          <TabsContent value="subscriptions"><AdminSubscriptionsTab /></TabsContent>
          <TabsContent value="invoices"><AdminInvoicesTab /></TabsContent>
          <TabsContent value="whatsapp"><AdminWhatsAppTab /></TabsContent>
          <TabsContent value="notifications"><AdminNotificationsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
