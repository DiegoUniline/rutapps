import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { GoogleMapsProvider } from "@/hooks/useGoogleMapsKey";
import { useSubscription } from "@/hooks/useSubscription";
import AppLayout from "@/components/AppLayout";
import MobileLayout from "@/components/MobileLayout";
import SubscriptionBanner from "@/components/SubscriptionBanner";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const ProductosListPage = lazy(() => import("@/pages/ProductosListPage"));
const CatalogPage = lazy(() => import("@/pages/CatalogPage"));
const ProductoFormPage = lazy(() => import("@/pages/ProductoFormPage"));
const TarifasListPage = lazy(() => import("@/pages/TarifasListPage"));
const TarifaFormPage = lazy(() => import("@/pages/TarifaFormPage"));
const ClientesListPage = lazy(() => import("@/pages/ClientesListPage"));
const ClienteFormPage = lazy(() => import("@/pages/ClienteFormPage"));
const VentasListPage = lazy(() => import("@/pages/VentasListPage"));
const VentaFormPage = lazy(() => import("@/pages/VentaFormPage"));
const DemandaPage = lazy(() => import("@/pages/DemandaPage"));
const PedidoPendienteDetailPage = lazy(() => import("@/pages/PedidoPendienteDetailPage"));
const EntregaListPage = lazy(() => import("@/pages/EntregaListPage"));
const EntregaFormPage = lazy(() => import("@/pages/EntregaFormPage"));
const EntregaCamionPage = lazy(() => import("@/pages/EntregaCamionPage"));
// EntregasPage removed — functionality consolidated into EntregaListPage under /logistica/entregas
const ReporteEntregasPage = lazy(() => import("@/pages/ReporteEntregasPage"));
const CobranzaPage = lazy(() => import("@/pages/CobranzaPage"));
const RutasMapPage = lazy(() => import("@/pages/RutasMapPage"));
const MapaClientesPage = lazy(() => import("@/pages/MapaClientesPage"));
const MapaVentasPage = lazy(() => import("@/pages/MapaVentasPage"));
const InventarioPage = lazy(() => import("@/pages/InventarioPage"));
const AlmacenesPage = lazy(() => import("@/pages/AlmacenesPage"));
const ComprasPage = lazy(() => import("@/pages/ComprasPage"));
const CompraFormPage = lazy(() => import("@/pages/CompraFormPage"));
const LotesPage = lazy(() => import("@/pages/LotesPage"));
const CuentasCobrarPage = lazy(() => import("@/pages/CuentasCobrarPage"));
const CuentasPagarPage = lazy(() => import("@/pages/CuentasPagarPage"));
const GastosDesktopPage = lazy(() => import("@/pages/GastosDesktopPage"));
const ReportesPage = lazy(() => import("@/pages/ReportesPage"));
const ConfiguracionPage = lazy(() => import("@/pages/ConfiguracionPage"));
const UsuariosPage = lazy(() => import("@/pages/UsuariosPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const DescargasPage = lazy(() => import("@/pages/DescargasPage"));
const WhatsAppConfigPage = lazy(() => import("@/pages/WhatsAppConfigPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const PromocionesPage = lazy(() => import("@/pages/PromocionesPage"));
const TraspasosListPage = lazy(() => import("@/pages/TraspasosListPage"));
const TraspasoFormPage = lazy(() => import("@/pages/TraspasoFormPage"));
const AjustesInventarioPage = lazy(() => import("@/pages/AjustesInventarioPage"));
const AuditoriasPage = lazy(() => import("@/pages/AuditoriasPage"));
const AuditoriaConteoPage = lazy(() => import("@/pages/AuditoriaConteoPage"));
const AuditoriaResultadosPage = lazy(() => import("@/pages/AuditoriaResultadosPage"));
const SupervisorDashboardPage = lazy(() => import("@/pages/SupervisorDashboardPage"));
const PuntoVentaPage = lazy(() => import("@/pages/PuntoVentaPage"));
const SuperAdminPage = lazy(() => import("@/pages/SuperAdminPage"));
const SubscriptionBlockedPage = lazy(() => import("@/pages/SubscriptionBlockedPage"));
const FacturacionPage = lazy(() => import("@/pages/FacturacionPage"));

// Logistica pages
const LogisticaDashboardPage = lazy(() => import("@/pages/logistica/LogisticaDashboardPage"));
// PedidosPendientesPage removed — consolidated into DemandaPage under /logistica/pedidos
const OrdenCargaPage = lazy(() => import("@/pages/logistica/OrdenCargaPage"));

// Mobile ruta pages
const RutaDashboard = lazy(() => import("@/pages/ruta/RutaDashboard"));
const RutaVentas = lazy(() => import("@/pages/ruta/RutaVentas"));
const RutaClientes = lazy(() => import("@/pages/ruta/RutaClientes"));
const RutaStock = lazy(() => import("@/pages/ruta/RutaStock"));
const RutaGastos = lazy(() => import("@/pages/ruta/RutaGastos"));
const RutaNuevaVenta = lazy(() => import("@/pages/ruta/RutaNuevaVenta"));
const RutaCobros = lazy(() => import("@/pages/ruta/RutaCobros"));
const RutaCobrar = lazy(() => import("@/pages/ruta/RutaCobrar"));
const RutaVentaDetalle = lazy(() => import("@/pages/ruta/RutaVentaDetalle"));
const RutaMiCarga = lazy(() => import("@/pages/ruta/RutaMiCarga"));
const RutaDevolucion = lazy(() => import("@/pages/ruta/RutaDevolucion"));
const RutaEntregas = lazy(() => import("@/pages/ruta/RutaEntregas"));
const RutaDescarga = lazy(() => import("@/pages/ruta/RutaDescarga"));
const RutaMapaPage = lazy(() => import("@/pages/ruta/RutaMapaPage"));
const RutaPerfil = lazy(() => import("@/pages/ruta/RutaPerfil"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30s default for daily data
      gcTime: 10 * 60 * 1000, // 10 min garbage collection
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="text-muted-foreground text-sm">Cargando...</div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const subscription = useSubscription();

  if (loading || subscription.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Super admin always has access
  if (subscription.isSuperAdmin) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/super-admin" element={<SuperAdminPage />} />
          {renderAuthenticatedRoutes()}
        </Routes>
      </Suspense>
    );
  }

  // Blocked users — only billing access
  if (subscription.isBlocked) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/facturacion" element={<FacturacionPage />} />
          <Route path="*" element={<Navigate to="/facturacion" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <SubscriptionBanner />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {renderAuthenticatedRoutes()}
        </Routes>
      </Suspense>
    </>
  );
}

function renderAuthenticatedRoutes() {
  return (
    <>
      {/* Mobile route sales module */}
      <Route path="/ruta" element={<MobileLayout />}>
        <Route index element={<RutaClientes />} />
        <Route path="dashboard" element={<RutaDashboard />} />
        <Route path="ventas" element={<RutaVentas />} />
        <Route path="carga" element={<RutaMiCarga />} />
        <Route path="cobros" element={<RutaCobros />} />
        <Route path="stock" element={<RutaStock />} />
        <Route path="gastos" element={<RutaGastos />} />
        <Route path="entregas" element={<RutaEntregas />} />
        <Route path="perfil" element={<RutaPerfil />} />
      </Route>
      <Route path="/ruta/ventas/nueva" element={<RutaNuevaVenta />} />
      <Route path="/ruta/ventas/:id" element={<RutaVentaDetalle />} />
      <Route path="/ruta/cobros/nuevo" element={<RutaCobrar />} />
      <Route path="/ruta/devolucion" element={<RutaDevolucion />} />
      <Route path="/ruta/descarga" element={<RutaDescarga />} />
      <Route path="/ruta/mapa" element={<RutaMapaPage />} />

      {/* Desktop POS */}
      <Route path="/pos" element={<PuntoVentaPage />} />

      {/* Desktop ERP */}
      <Route path="*" element={
        <AppLayout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/supervisor" element={<SupervisorDashboardPage />} />
              <Route path="/productos" element={<ProductosListPage />} />
              <Route path="/catalogo/:catalog" element={<CatalogPage />} />
              <Route path="/productos/:id" element={<ProductoFormPage />} />
              <Route path="/tarifas" element={<TarifasListPage />} />
              <Route path="/tarifas/:id" element={<TarifaFormPage />} />
              <Route path="/clientes" element={<ClientesListPage />} />
              <Route path="/clientes/:id" element={<GoogleMapsProvider><ClienteFormPage /></GoogleMapsProvider>} />
              <Route path="/ventas" element={<VentasListPage />} />
              <Route path="/ventas/surtido" element={<Navigate to="/logistica/pedidos" replace />} />
              <Route path="/ventas/demanda" element={<Navigate to="/logistica/pedidos" replace />} />
              <Route path="/logistica/pedidos" element={<DemandaPage />} />
              <Route path="/logistica/pedidos/:id" element={<PedidoPendienteDetailPage />} />
              <Route path="/logistica/entregas" element={<EntregaListPage />} />
              <Route path="/logistica/entregas/nuevo" element={<Navigate to="/logistica/entregas" replace />} />
              <Route path="/logistica/entregas/camion/:vendedorId" element={<EntregaCamionPage />} />
              <Route path="/logistica/entregas/:id" element={<EntregaFormPage />} />
              <Route path="/entregas" element={<Navigate to="/logistica/entregas" replace />} />
              <Route path="/entregas/nuevo" element={<Navigate to="/logistica/entregas" replace />} />
              <Route path="/entregas/:id" element={<EntregaFormPage />} />
              <Route path="/logistica/pedidos-pendientes" element={<Navigate to="/logistica/pedidos" replace />} />
              <Route path="/ventas/entregas" element={<Navigate to="/logistica/entregas" replace />} />
              <Route path="/ventas/reporte-entregas" element={<Navigate to="/reportes/entregas" replace />} />
              <Route path="/reportes/entregas" element={<ReporteEntregasPage />} />
              <Route path="/ventas/cobranza" element={<CobranzaPage />} />
              <Route path="/ventas/rutas" element={<GoogleMapsProvider><RutasMapPage /></GoogleMapsProvider>} />
              <Route path="/ventas/mapa-clientes" element={<GoogleMapsProvider><MapaClientesPage /></GoogleMapsProvider>} />
              <Route path="/ventas/mapa-ventas" element={<GoogleMapsProvider><MapaVentasPage /></GoogleMapsProvider>} />
              <Route path="/ventas/promociones" element={<PromocionesPage />} />
              <Route path="/logistica/dashboard" element={<LogisticaDashboardPage />} />
              <Route path="/logistica/orden-carga/:camionId" element={<OrdenCargaPage />} />
              <Route path="/ventas/:id" element={<VentaFormPage />} />
              <Route path="/almacen/inventario" element={<InventarioPage />} />
              <Route path="/almacen/almacenes" element={<AlmacenesPage />} />
              <Route path="/almacen/compras" element={<ComprasPage />} />
              <Route path="/almacen/compras/:id" element={<CompraFormPage />} />
              <Route path="/almacen/lotes" element={<LotesPage />} />
              <Route path="/almacen/descargas" element={<DescargasPage />} />
              <Route path="/almacen/traspasos" element={<TraspasosListPage />} />
              <Route path="/almacen/traspasos/:id" element={<TraspasoFormPage />} />
              <Route path="/almacen/ajustes" element={<AjustesInventarioPage />} />
              <Route path="/almacen/auditorias" element={<AuditoriasPage />} />
              <Route path="/finanzas/por-cobrar" element={<CuentasCobrarPage />} />
              <Route path="/finanzas/por-pagar" element={<CuentasPagarPage />} />
              <Route path="/finanzas/gastos" element={<GastosDesktopPage />} />
              <Route path="/reportes" element={<ReportesPage />} />
              <Route path="/configuracion" element={<ConfiguracionPage />} />
              <Route path="/configuracion/whatsapp" element={<WhatsAppConfigPage />} />
              <Route path="/configuracion/usuarios" element={<UsuariosPage />} />
              <Route path="/facturacion" element={<FacturacionPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AppLayout>
      } />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
