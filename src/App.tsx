import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation, Link } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { GoogleMapsProvider } from "@/hooks/useGoogleMapsKey";
import { useSubscription } from "@/hooks/useSubscription";
import { PermissionGuard } from "@/components/PermissionGuard";
import { usePermisos } from "@/hooks/usePermisos";
import AppLayout from "@/components/AppLayout";
import MobileLayout from "@/components/MobileLayout";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { ErrorModalProvider } from "@/components/ErrorModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { useGlobalErrorHandler } from "@/hooks/useGlobalErrorHandler";
import { useBootstrapPrefetch } from "@/hooks/useBootstrapPrefetch";
import { showAppError } from "@/lib/globalError";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const ProductosListPage = lazy(() => import("@/pages/ProductosListPage"));
const CatalogPage = lazy(() => import("@/pages/CatalogPage"));
const ProductoFormPage = lazy(() => import("@/pages/ProductoForm"));
const TarifasListPage = lazy(() => import("@/pages/TarifasListPage"));
const ListasPrecioListPage = lazy(() => import("@/pages/ListasPrecioListPage"));
const ProveedoresListPage = lazy(() => import("@/pages/ProveedoresListPage"));
const ProveedorFormPage = lazy(() => import("@/pages/ProveedorFormPage"));
const TarifaFormPage = lazy(() => import("@/pages/TarifaFormPage"));
const ClientesListPage = lazy(() => import("@/pages/ClientesListPage"));
const ClienteFormPage = lazy(() => import("@/pages/ClienteFormPage"));
const VentasListPage = lazy(() => import("@/pages/VentasListPage"));
const VentaFormPage = lazy(() => import("@/pages/VentaForm/index"));
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
const CompraFormPage = lazy(() => import("@/pages/CompraForm"));

const CuentasCobrarPage = lazy(() => import("@/pages/CuentasCobrarPage"));
const CuentasPagarPage = lazy(() => import("@/pages/CuentasPagarPage"));
const EstadoCuentaClientePage = lazy(() => import("@/pages/EstadoCuentaClientePage"));
const SaldosProveedorPage = lazy(() => import("@/pages/SaldosProveedorPage"));
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
const ConteosFisicosPage = lazy(() => import("@/pages/ConteosFisicosPage"));
const ConteoFisicoPage = lazy(() => import("@/pages/ConteoFisicoPage"));
const SupervisorDashboardPage = lazy(() => import("@/pages/SupervisorDashboardPage"));
const MonitorRutasPage = lazy(() => import("@/pages/MonitorRutasPage"));
const PuntoVentaPage = lazy(() => import("@/pages/PuntoVentaPage"));
const ReporteDiarioPage = lazy(() => import("@/pages/ReporteDiarioPage"));
const SuperAdminPage = lazy(() => import("@/pages/SuperAdminPage"));
const SubscriptionBlockedPage = lazy(() => import("@/pages/SubscriptionBlockedPage"));
const FacturacionPage = lazy(() => import("@/pages/FacturacionPage"));
const MiSuscripcionPage = lazy(() => import("@/pages/MiSuscripcionPage"));
const FacturacionCfdiPage = lazy(() => import("@/pages/FacturacionCfdiPage"));
const CfdiFormPage = lazy(() => import("@/pages/CfdiFormPage"));
const ComisionesPage = lazy(() => import("@/pages/ComisionesPage"));
const ConfiguracionInicialPage = lazy(() => import("@/pages/ConfiguracionInicialPage"));
const TerminosPage = lazy(() => import("@/pages/TerminosPage"));
const PrivacidadPage = lazy(() => import("@/pages/PrivacidadPage"));
const CancelSubscriptionPage = lazy(() => import("@/pages/CancelSubscriptionPage"));
const CatalogoPublicoPage = lazy(() => import("@/pages/CatalogoPublicoPage"));
const PagarPage = lazy(() => import("@/pages/PagarPage"));
const AuditoriaMobilePage = lazy(() => import("@/pages/AuditoriaMobilePage"));
const DevolucionesListPage = lazy(() => import("@/pages/DevolucionesListPage"));
const ControlPage = lazy(() => import("@/pages/ControlPage"));
const TutorialesPage = lazy(() => import("@/pages/TutorialesPage"));
const AplicarPagosPage = lazy(() => import("@/pages/AplicarPagosPage"));
const AplicarPagosProveedorPage = lazy(() => import("@/pages/AplicarPagosProveedorPage"));
const PagosProveedoresPage = lazy(() => import("@/pages/PagosProveedoresPage"));


// Logistica pages
const LogisticaDashboardPage = lazy(() => import("@/pages/logistica/LogisticaDashboardPage"));
// PedidosPendientesPage removed — consolidated into DemandaPage under /logistica/pedidos
const OrdenCargaPage = lazy(() => import("@/pages/logistica/OrdenCargaPage"));

// Mobile ruta pages — eagerly loaded so they work fully offline
import RutaDashboard from "@/pages/ruta/RutaDashboard";
import RutaVentas from "@/pages/ruta/RutaVentas";
import RutaVentasTab from "@/pages/ruta/RutaVentasTab";
import RutaClientesEntregas from "@/pages/ruta/RutaClientesEntregas";
import RutaStock from "@/pages/ruta/RutaStock";
import RutaGastos from "@/pages/ruta/RutaGastos";
import RutaNuevaVenta from "@/pages/ruta/RutaNuevaVenta/index";
import RutaCobros from "@/pages/ruta/RutaCobros";
import RutaCobrar from "@/pages/ruta/RutaCobrar";
import RutaVentaDetalle from "@/pages/ruta/RutaVentaDetalle";
import RutaMiCarga from "@/pages/ruta/RutaMiCarga";
import RutaDevolucion from "@/pages/ruta/RutaDevolucion";
import RutaEntregas from "@/pages/ruta/RutaEntregas";
import RutaDescarga from "@/pages/ruta/RutaDescarga";
import RutaMapaPage from "@/pages/ruta/RutaMapaPage";
import RutaNavegacionPage from "@/pages/ruta/RutaNavegacionPage";
import RutaPerfil from "@/pages/ruta/RutaPerfil";
import RutaSincronizarPage from "@/pages/ruta/RutaSincronizarPage";
import RutaNuevoCliente from "@/pages/ruta/RutaNuevoCliente";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      onError: (error) => {
        showAppError(error);
      },
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

const ForceChangePasswordPage = lazy(() => import("@/pages/ForceChangePasswordPage"));

function AppRoutes() {
  const { user, profile, loading, signOut } = useAuth();
  const subscription = useSubscription();
  
  const { hasPermiso, loading: permisosLoading } = usePermisos();
  
  // Global unhandled rejection → error modal
  useGlobalErrorHandler();
  
  // Pre-warm React Query cache with base catalogs on login
  useBootstrapPrefetch();

  const isSoloMovil = user && !permisosLoading && hasPermiso('solo_movil', 'ver');

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
          <Route path="/terminos" element={<TerminosPage />} />
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="/catalogo/:token" element={<CatalogoPublicoPage />} />
          <Route path="/pagar/:token" element={<PagarPage />} />
          <Route path="/auditoria-movil/:auditoria_id" element={<AuditoriaMobilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Force password change if flagged
  if (profile?.must_change_password) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="*" element={<ForceChangePasswordPage />} />
        </Routes>
      </Suspense>
    );
  }

  // Super admin always has access
  if (subscription.isSuperAdmin) {
    return (
      <>
        <SubscriptionBanner />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/super-admin" element={<SuperAdminPage />} />
            {renderAuthenticatedRoutes()}
          </Routes>
        </Suspense>
      </>
    );
  }

  // Blocked users — only billing access + sign-out header
  if (subscription.isBlocked) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg text-foreground">RutApp</span>
            <Badge variant="destructive" className="text-xs">Suspendida</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/mi-suscripcion">Mi Suscripción</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              Cerrar sesión
            </Button>
          </div>
        </header>
        <div className="flex-1">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/facturacion" element={<FacturacionPage />} />
              <Route path="/mi-suscripcion" element={<MiSuscripcionPage />} />
              <Route path="*" element={<Navigate to="/mi-suscripcion" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    );
  }

  // Solo móvil — user can only access /ruta routes
  if (isSoloMovil) {
    return (
      <Routes>
        <Route path="/ruta" element={<MobileLayout />}>
          <Route index element={<RutaClientesEntregas />} />
          <Route path="dashboard" element={<RutaDashboard />} />
          <Route path="ventas" element={<RutaVentasTab />} />
          <Route path="carga" element={<RutaMiCarga />} />
          <Route path="cobros" element={<RutaCobros />} />
          <Route path="stock" element={<RutaStock />} />
          <Route path="gastos" element={<RutaGastos />} />
          <Route path="entregas" element={<RutaClientesEntregas />} />
          <Route path="perfil" element={<RutaPerfil />} />
        </Route>
        <Route path="/ruta/ventas/nueva" element={<RutaNuevaVenta />} />
        <Route path="/ruta/ventas/:id" element={<RutaVentaDetalle />} />
        <Route path="/ruta/cobros/nuevo" element={<RutaCobrar />} />
        <Route path="/ruta/clientes/nuevo" element={<RutaNuevoCliente />} />
        <Route path="/ruta/devolucion" element={<RutaDevolucion />} />
        <Route path="/ruta/descarga" element={<RutaDescarga />} />
        <Route path="/ruta/mapa" element={<RutaMapaPage />} />
        <Route path="/ruta/navegacion" element={<RutaNavegacionPage />} />
        <Route path="/ruta/sincronizar" element={<RutaSincronizarPage />} />
        <Route path="/conteo/:countId" element={<Suspense fallback={<PageLoader />}><ConteoFisicoPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/ruta" replace />} />
      </Routes>
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
        <Route index element={<RutaClientesEntregas />} />
        <Route path="dashboard" element={<RutaDashboard />} />
        <Route path="ventas" element={<RutaVentasTab />} />
        <Route path="carga" element={<RutaMiCarga />} />
        <Route path="cobros" element={<RutaCobros />} />
        <Route path="stock" element={<RutaStock />} />
        <Route path="gastos" element={<RutaGastos />} />
        <Route path="entregas" element={<RutaClientesEntregas />} />
        <Route path="perfil" element={<RutaPerfil />} />
      </Route>
      <Route path="/ruta/ventas/nueva" element={<RutaNuevaVenta />} />
      <Route path="/ruta/ventas/:id" element={<RutaVentaDetalle />} />
      <Route path="/ruta/cobros/nuevo" element={<RutaCobrar />} />
      <Route path="/ruta/clientes/nuevo" element={<RutaNuevoCliente />} />
      <Route path="/ruta/devolucion" element={<RutaDevolucion />} />
      <Route path="/ruta/descarga" element={<RutaDescarga />} />
      <Route path="/ruta/mapa" element={<RutaMapaPage />} />
      <Route path="/ruta/navegacion" element={<RutaNavegacionPage />} />
      <Route path="/ruta/sincronizar" element={<RutaSincronizarPage />} />

      {/* Desktop POS */}
      <Route path="/pos" element={<PuntoVentaPage />} />

      {/* Conteo físico — standalone mobile page */}
      <Route path="/conteo/:countId" element={<ConteoFisicoPage />} />

      <Route path="*" element={
        <AppLayout>
          <GuardedDesktopRoutes />
        </AppLayout>
      } />
    </>
  );
}

function GuardedDesktopRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<PageLoader />}>
      <PermissionGuard path={location.pathname}>
        <Routes>
          {desktopRoutes()}
        </Routes>
      </PermissionGuard>
    </Suspense>
  );
}

function desktopRoutes() {
  return (
    <>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/supervisor" element={<SupervisorDashboardPage />} />
      <Route path="/monitor-rutas" element={<MonitorRutasPage />} />
      <Route path="/productos" element={<ProductosListPage />} />
      <Route path="/catalogos/:catalog" element={<CatalogPage />} />
      <Route path="/productos/:id" element={<ProductoFormPage />} />
      <Route path="/productos/:productoId/tarifas/:id" element={<TarifaFormPage />} />
      <Route path="/tarifas" element={<Navigate to="/listas-precio" replace />} />
      <Route path="/tarifas/:id" element={<TarifaFormPage />} />
      <Route path="/listas-precio" element={<ListasPrecioListPage />} />
      <Route path="/proveedores" element={<ProveedoresListPage />} />
      <Route path="/proveedores/:id" element={<ProveedorFormPage />} />
      <Route path="/clientes" element={<ClientesListPage />} />
      <Route path="/clientes/:id" element={<GoogleMapsProvider><ClienteFormPage /></GoogleMapsProvider>} />
      <Route path="/ventas" element={<VentasListPage />} />
      <Route path="/ventas/reporte-diario" element={<ReporteDiarioPage />} />
      <Route path="/ventas/devoluciones" element={<DevolucionesListPage />} />
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
      <Route path="/ventas/rutas" element={<GoogleMapsProvider blocking><RutasMapPage /></GoogleMapsProvider>} />
      <Route path="/ventas/mapa-clientes" element={<GoogleMapsProvider blocking><MapaClientesPage /></GoogleMapsProvider>} />
      <Route path="/ventas/mapa-ventas" element={<GoogleMapsProvider blocking><MapaVentasPage /></GoogleMapsProvider>} />
      <Route path="/ventas/promociones" element={<PromocionesPage />} />
      <Route path="/logistica/dashboard" element={<LogisticaDashboardPage />} />
      <Route path="/logistica/orden-carga/:camionId" element={<OrdenCargaPage />} />
      <Route path="/ventas/:id" element={<VentaFormPage />} />
      <Route path="/almacen/inventario" element={<InventarioPage />} />
      <Route path="/almacen/almacenes" element={<AlmacenesPage />} />
      <Route path="/almacen/compras" element={<ComprasPage />} />
      <Route path="/almacen/compras/:id" element={<CompraFormPage />} />
      {/* Lotes removed — no longer used */}
      <Route path="/almacen/descargas" element={<DescargasPage />} />
      <Route path="/almacen/traspasos" element={<TraspasosListPage />} />
      <Route path="/almacen/traspasos/:id" element={<TraspasoFormPage />} />
      <Route path="/almacen/ajustes" element={<AjustesInventarioPage />} />
      <Route path="/almacen/auditorias" element={<AuditoriasPage />} />
      <Route path="/almacen/auditorias/:id/conteo" element={<AuditoriaConteoPage />} />
      <Route path="/almacen/auditorias/:id/resultados" element={<AuditoriaResultadosPage />} />
      <Route path="/almacen/conteos" element={<ConteosFisicosPage />} />
      <Route path="/finanzas/por-cobrar" element={<CuentasCobrarPage />} />
      <Route path="/finanzas/aplicar-pagos" element={<AplicarPagosPage />} />
      <Route path="/finanzas/por-pagar" element={<CuentasPagarPage />} />
      <Route path="/finanzas/saldos-cliente" element={<EstadoCuentaClientePage />} />
      <Route path="/finanzas/saldos-proveedor" element={<SaldosProveedorPage />} />
      <Route path="/finanzas/aplicar-pagos-proveedor" element={<AplicarPagosProveedorPage />} />
      <Route path="/finanzas/pagos-proveedores" element={<PagosProveedoresPage />} />
      <Route path="/finanzas/gastos" element={<GastosDesktopPage />} />
      <Route path="/finanzas/comisiones" element={<ComisionesPage />} />
      <Route path="/reportes" element={<ReportesPage />} />
      <Route path="/control" element={<ControlPage />} />
      <Route path="/configuracion" element={<ConfiguracionPage />} />
      <Route path="/configuracion-inicial" element={<ConfiguracionInicialPage />} />
      <Route path="/configuracion/whatsapp" element={<WhatsAppConfigPage />} />
      <Route path="/configuracion/usuarios" element={<UsuariosPage />} />
      <Route path="/facturacion" element={<FacturacionPage />} />
      <Route path="/mi-suscripcion" element={<MiSuscripcionPage />} />
      <Route path="/cancelar-suscripcion" element={<CancelSubscriptionPage />} />
      <Route path="/facturacion-cfdi" element={<FacturacionCfdiPage />} />
      <Route path="/facturacion-cfdi/catalogos" element={<FacturacionCfdiPage />} />
      <Route path="/facturacion-cfdi/:id" element={<CfdiFormPage />} />
      <Route path="/catalogo/:token" element={<CatalogoPublicoPage />} />
      <Route path="*" element={<NotFound />} />
    </>
  );
}

const App = () => (
  <GlobalErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ErrorModalProvider>
        <TooltipProvider>
          <Sonner />
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </ErrorModalProvider>
    </QueryClientProvider>
  </GlobalErrorBoundary>
);

export default App;
