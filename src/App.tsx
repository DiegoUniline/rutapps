import { lazy, Suspense, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation, Link } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { isSuperAdminEmail } from "@/lib/superAdminEmail";
import { GoogleMapsProvider } from "@/hooks/useGoogleMapsKey";
import { useSubscription } from "@/hooks/useSubscription";
import { useNeedsCardCapture } from "@/hooks/useNeedsCardCapture";
import { useFacturaPendiente } from "@/hooks/useFacturaPendiente";
import { PermissionGuard } from "@/components/PermissionGuard";
import { usePermisos } from "@/hooks/usePermisos";
import AppLayout from "@/components/AppLayout";
import MobileLayout from "@/components/MobileLayout";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import WhatsAppSuspendedBanner from "@/components/WhatsAppSuspendedBanner";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import FacturaPendienteModal from "@/components/FacturaPendienteModal";
import { ErrorModalProvider } from "@/components/ErrorModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { useGlobalErrorHandler } from "@/hooks/useGlobalErrorHandler";
import { useBootstrapPrefetch } from "@/hooks/useBootstrapPrefetch";
import { showAppError } from "@/lib/globalError";
import { usePartner } from "@/hooks/usePartner";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import BroadcastListener from "@/components/BroadcastListener";
import GlobalColumnResizer from "@/components/global/GlobalColumnResizer";
import GlobalColumnHider from "@/components/global/GlobalColumnHider";
import { TableAutoHeight } from "@/components/global/TableAutoHeight";


// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const ProductosListPage = lazy(() => import("@/pages/ProductosListPage"));
const MermasPage = lazy(() => import("@/pages/MermasPage"));
const MermaMotivosPage = lazy(() => import("@/pages/MermaMotivosPage"));
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
const CotizacionesListPage = lazy(() => import("@/pages/CotizacionesListPage"));
const CotizacionFormPage = lazy(() => import("@/pages/CotizacionFormPage"));
const CotizacionPublicaPage = lazy(() => import("@/pages/CotizacionPublicaPage"));
const DemandaPage = lazy(() => import("@/pages/DemandaPage"));
const PedidoPendienteDetailPage = lazy(() => import("@/pages/PedidoPendienteDetailPage"));
const EntregaListPage = lazy(() => import("@/pages/EntregaListPage"));
const ConcentradoSurtidoPage = lazy(() => import("@/pages/logistica/ConcentradoSurtidoPage"));
const EntregaFormPage = lazy(() => import("@/pages/EntregaFormPage"));
const EntregaCamionPage = lazy(() => import("@/pages/EntregaCamionPage"));
// EntregasPage removed — functionality consolidated into EntregaListPage under /logistica/entregas
// ReporteEntregasPage removed — reporte de entregas now lives as a tab inside /reportes
const CobranzaPage = lazy(() => import("@/pages/CobranzaPage"));

const MapaClientesPage = lazy(() => import("@/pages/MapaClientesPage"));
const MapaVentasPage = lazy(() => import("@/pages/MapaVentasPage"));
const InventarioPage = lazy(() => import("@/pages/InventarioPage"));
const InteligenciaAlmacenPage = lazy(() => import("@/pages/InteligenciaAlmacenPage"));
const AlmacenesPage = lazy(() => import("@/pages/AlmacenesPage"));
const LotesPage = lazy(() => import("@/pages/LotesPage"));
const KardexPage = lazy(() => import("@/pages/KardexPage"));
const ComprasPage = lazy(() => import("@/pages/ComprasPage"));
const CompraFormPage = lazy(() => import("@/pages/CompraForm"));
const ComprasSugeridasPage = lazy(() => import("@/pages/ComprasSugeridasPage"));

const CuentasCobrarPage = lazy(() => import("@/pages/CuentasCobrarPage"));
const CuentasPagarPage = lazy(() => import("@/pages/CuentasPagarPage"));
const EstadoCuentaClientePage = lazy(() => import("@/pages/EstadoCuentaClientePage"));
const SaldosProveedorPage = lazy(() => import("@/pages/SaldosProveedorPage"));
const GastosDesktopPage = lazy(() => import("@/pages/GastosDesktopPage"));
const ReportesPage = lazy(() => import("@/pages/ReportesPage"));
const ReportesPersonalizadosPage = lazy(() => import("@/pages/ReportesPersonalizadosPage"));
const ConfiguracionPage = lazy(() => import("@/pages/ConfiguracionPage"));
const SaldosInicialesPage = lazy(() => import("@/pages/SaldosInicialesPage"));
const UsuariosPage = lazy(() => import("@/pages/UsuariosPage"));
const MetasConfigPage = lazy(() => import("@/pages/MetasConfigPage"));
const MetasSeguimientoPage = lazy(() => import("@/pages/MetasSeguimientoPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const DescargasPage = lazy(() => import("@/pages/DescargasPage"));
const WhatsAppConfigPage = lazy(() => import("@/pages/WhatsAppConfigPage"));
const WhatsAppBotPage = lazy(() => import("@/pages/WhatsAppBotPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const ModulosMktPage = lazy(() => import("@/pages/marketing/ModulosPage"));
const PreciosMktPage = lazy(() => import("@/pages/marketing/PreciosPage"));
const GirosMktIndexPage = lazy(() => import("@/pages/marketing/GirosIndexPage"));
const GiroMktDetallePage = lazy(() => import("@/pages/marketing/GiroDetallePage"));
const LandingV2Page = lazy(() => import("@/pages/LandingV2Page"));
const GirosIndexPage = lazy(() => import("@/pages/landing/GirosIndexPage"));
const PreciosLandingPage = lazy(() => import("@/pages/landing/PreciosPage"));
const AbarrotesPage = lazy(() => import("@/pages/landing/giros/AbarrotesPage"));
const RefresquerasPage = lazy(() => import("@/pages/landing/giros/RefresquerasPage"));
const PanaderiasPage = lazy(() => import("@/pages/landing/giros/PanaderiasPage"));
const LimpiezaPage = lazy(() => import("@/pages/landing/giros/LimpiezaPage"));
const LacteosPage = lazy(() => import("@/pages/landing/giros/LacteosPage"));
const BotanasPage = lazy(() => import("@/pages/landing/giros/BotanasPage"));
const AguaPage = lazy(() => import("@/pages/landing/giros/AguaPage"));
const PromocionesPage = lazy(() => import("@/pages/PromocionesPage"));
const TraspasosListPage = lazy(() => import("@/pages/TraspasosListPage"));
const TraspasoFormPage = lazy(() => import("@/pages/TraspasoFormPage"));
const AjustesInventarioPage = lazy(() => import("@/pages/AjustesInventarioPage"));
const AjustesMermasPage = lazy(() => import("@/pages/AjustesMermasPage"));
const AuditoriasPage = lazy(() => import("@/pages/AuditoriasPage"));
const AuditoriaConteoPage = lazy(() => import("@/pages/AuditoriaConteoPage"));
const AuditoriaResultadosPage = lazy(() => import("@/pages/AuditoriaResultadosPage"));
const ConteosFisicosPage = lazy(() => import("@/pages/ConteosFisicosPage"));
const ConteoFisicoPage = lazy(() => import("@/pages/ConteoFisicoPage"));
const SupervisorDashboardPage = lazy(() => import("@/pages/SupervisorDashboardPage"));
const MonitorRutasPage = lazy(() => import("@/pages/MonitorRutasPage"));
const PuntoVentaPage = lazy(() => import("@/pages/PuntoVentaPage"));
const PosAdminPage = lazy(() => import("@/pages/PosAdminPage"));
const ReporteDiarioPage = lazy(() => import("@/pages/ReporteDiarioPage"));
const SuperAdminPage = lazy(() => import("@/pages/SuperAdminPage"));
const SuperAdminPartnersPage = lazy(() => import("@/pages/SuperAdminPartnersPage"));
const PartnerLayout = lazy(() => import("@/pages/partner/PartnerLayout"));
const PartnerDashboard = lazy(() => import("@/pages/partner/PartnerDashboard"));
const PartnerEmpresas = lazy(() => import("@/pages/partner/PartnerEmpresas"));
const PartnerCupones = lazy(() => import("@/pages/partner/PartnerCupones"));
const PartnerComisiones = lazy(() => import("@/pages/partner/PartnerComisiones"));
const PartnerPerfil = lazy(() => import("@/pages/partner/PartnerPerfil"));
const DatabaseHealthPage = lazy(() => import("@/pages/DatabaseHealthPage"));
const SyncHealthPage = lazy(() => import("@/pages/SyncHealthPage"));
const SubscriptionBlockedPage = lazy(() => import("@/pages/SubscriptionBlockedPage"));
const FacturacionPage = lazy(() => import("@/pages/FacturacionPage"));
const MiSuscripcionPage = lazy(() => import("@/pages/MiSuscripcionPage"));
const FacturacionCfdiPage = lazy(() => import("@/pages/FacturacionCfdiPage"));
const CfdiFormPage = lazy(() => import("@/pages/CfdiFormPage"));
const FacturacionAvanzadaPage = lazy(() => import("@/pages/FacturacionAvanzadaPage"));

const ComisionesLayoutPage = lazy(() => import("@/pages/comisiones/ComisionesLayoutPage"));
const ComisionesAvancePage = lazy(() => import("@/pages/comisiones/ComisionesAvancePage"));
const ComisionesEsquemasPage = lazy(() => import("@/pages/comisiones/ComisionesEsquemasPage"));
const ComisionesReglasPage = lazy(() => import("@/pages/comisiones/ComisionesReglasPage"));
const ComisionesGeneradasPage = lazy(() => import("@/pages/comisiones/ComisionesGeneradasPage"));
const ComisionesVolumenPage = lazy(() => import("@/pages/comisiones/ComisionesVolumenPage"));
const ComisionesPorPagarPage = lazy(() => import("@/pages/comisiones/ComisionesPorPagarPage"));
const ComisionesRecibosPage = lazy(() => import("@/pages/comisiones/ComisionesRecibosPage"));
const ConfiguracionInicialPage = lazy(() => import("@/pages/ConfiguracionInicialPage"));
const HomologacionCatalogoPage = lazy(() => import("@/pages/configuracion/HomologacionCatalogoPage"));
const ConsumoDatosPage = lazy(() => import("@/pages/configuracion/ConsumoDatosPage"));
const TerminosPage = lazy(() => import("@/pages/TerminosPage"));
const PrivacidadPage = lazy(() => import("@/pages/PrivacidadPage"));
const CancelSubscriptionPage = lazy(() => import("@/pages/CancelSubscriptionPage"));
const CompletarRegistroPage = lazy(() => import("@/pages/CompletarRegistroPage"));
const CatalogoPublicoPage = lazy(() => import("@/pages/CatalogoPublicoPage"));
const PagarPage = lazy(() => import("@/pages/PagarPage"));
const FacturaRedirectPage = lazy(() => import("@/pages/FacturaRedirectPage"));
const EstadoCuentaPublicoPage = lazy(() => import("@/pages/EstadoCuentaPublicoPage"));
const UnsubscribePage = lazy(() => import("@/pages/UnsubscribePage"));
const PartnersLandingPage = lazy(() => import("@/pages/PartnersLandingPage"));
const AuditoriaMobilePage = lazy(() => import("@/pages/AuditoriaMobilePage"));
const DevolucionesListPage = lazy(() => import("@/pages/DevolucionesListPage"));
const ControlPage = lazy(() => import("@/pages/ControlPage"));
const TutorialesPage = lazy(() => import("@/pages/TutorialesPage"));
const ActualizacionesPage = lazy(() => import("@/pages/ActualizacionesPage"));
const SoportePage = lazy(() => import("@/pages/SoportePage"));
const PerfilPage = lazy(() => import("@/pages/PerfilPage"));
const AplicarPagosPage = lazy(() => import("@/pages/AplicarPagosPage"));
const AplicarPagosProveedorPage = lazy(() => import("@/pages/AplicarPagosProveedorPage"));
const PagosProveedoresPage = lazy(() => import("@/pages/PagosProveedoresPage"));


// Logistica pages
const LogisticaDashboardPage = lazy(() => import("@/pages/logistica/LogisticaDashboardPage"));
// PedidosPendientesPage removed — consolidated into DemandaPage under /logistica/pedidos
const OrdenCargaPage = lazy(() => import("@/pages/logistica/OrdenCargaPage"));
const LogisticaReportesPage = lazy(() => import("@/pages/logistica/LogisticaReportesPage"));

// Mobile ruta pages — eagerly loaded so they work fully offline
import RutaDashboard from "@/pages/ruta/RutaDashboard";
import RutaVentas from "@/pages/ruta/RutaVentas";
import RutaVentasTab from "@/pages/ruta/RutaVentasTab";
import RutaClientesEntregas from "@/pages/ruta/RutaClientesEntregas";
import RutaStock from "@/pages/ruta/RutaStock";
import RutaGastos from "@/pages/ruta/RutaGastos";
import RutaPromociones from "@/pages/ruta/RutaPromociones";
import RutaInicio from "@/pages/ruta/RutaInicio";
import RutaNuevaVenta from "@/pages/ruta/RutaNuevaVenta/index";
import RutaCobros from "@/pages/ruta/RutaCobros";
import RutaCobrar from "@/pages/ruta/RutaCobrar";
import RutaVentaDetalle from "@/pages/ruta/RutaVentaDetalle/index";
import RutaMiCarga from "@/pages/ruta/RutaMiCarga";
import RutaDevolucion from "@/pages/ruta/RutaDevolucion";
import RutaEntregas from "@/pages/ruta/RutaEntregas";
import RutaEntregaDetalle from "@/pages/ruta/RutaEntregaDetalle";
import RutaDescarga from "@/pages/ruta/RutaDescarga";
import RutaMapaPage from "@/pages/ruta/RutaMapaPage";
import RutaNavegacionPage from "@/pages/ruta/RutaNavegacionPage";
import RutaPerfil from "@/pages/ruta/RutaPerfil";
import RutaSincronizarPage from "@/pages/ruta/RutaSincronizarPage";
import PendientesSincronizarPage from "@/pages/ruta/PendientesSincronizarPage";

import RutaNuevoCliente from "@/pages/ruta/RutaNuevoCliente";
import RutaClienteDetalle from "@/pages/ruta/RutaClienteDetalle";
import RutaIniciarPage from "@/pages/ruta/RutaIniciarPage";
const VehiculosPage = lazy(() => import("@/pages/VehiculosPage"));
const JornadasRutaPage = lazy(() => import("@/pages/JornadasRutaPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 3 min de frescura: como las tablas clave ya tienen Realtime (que refresca
      // al instante cuando algo cambia de verdad), no necesitamos re-consultar en
      // cada navegación/remonta. Esto corta el "volumen de llamadas" (N+1) que
      // domina el costo de la base de datos, SIN mostrar datos viejos: un cambio
      // real invalida el caché por Realtime aunque el staleTime no haya vencido.
      staleTime: 3 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      onError: (error: any) => {
        if (error?.handled) return;
        showAppError(error);
      },
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 80 50"
        className="w-16 h-auto text-primary opacity-70 animate-bounce"
        style={{ animationDuration: '2s' }}
        fill="currentColor"
      >
        <path d="M64 20c-1 0-2 .1-3 .3C59.5 14.3 53.3 10 46 10c-6.1 0-11.4 3.2-14.4 8C30.4 17.4 29 17 27.5 17 21.7 17 17 21.7 17 27.5S21.7 38 27.5 38h36.5C70.3 38 76 32.3 76 25.5S70.3 20 64 20z"/>
      </svg>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-primary"
            style={{
              animation: 'pulse 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
              opacity: 0.4,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const ForceChangePasswordPage = lazy(() => import("@/pages/ForceChangePasswordPage"));

// Tienda en línea (público)
const TiendaHomePage = lazy(() => import("@/pages/tienda/TiendaHomePage"));
const TiendaProductosPage = lazy(() => import("@/pages/tienda/TiendaProductosPage"));
const TiendaProductoPage = lazy(() => import("@/pages/tienda/TiendaProductoPage"));
const TiendaCarritoPage = lazy(() => import("@/pages/tienda/TiendaCarritoPage"));
const TiendaLoginPage = lazy(() => import("@/pages/tienda/TiendaLoginPage"));
const TiendaMisPedidosPage = lazy(() => import("@/pages/tienda/TiendaMisPedidosPage"));
const TiendaCambiarPasswordPage = lazy(() => import("@/pages/tienda/TiendaCambiarPasswordPage"));
const TiendaConfigPage = lazy(() => import("@/pages/configuracion/TiendaConfigPage"));

function TiendaPublicRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/tienda/:slug" element={<TiendaHomePage />} />
        <Route path="/tienda/:slug/productos" element={<TiendaProductosPage />} />
        <Route path="/tienda/:slug/producto/:productoId" element={<TiendaProductoPage />} />
        <Route path="/tienda/:slug/carrito" element={<TiendaCarritoPage />} />
        <Route path="/tienda/:slug/login" element={<TiendaLoginPage />} />
        <Route path="/tienda/:slug/mis-pedidos" element={<TiendaMisPedidosPage />} />
        <Route path="/tienda/:slug/cambiar-password" element={<TiendaCambiarPasswordPage />} />
      </Routes>
    </Suspense>
  );
}

function AppRoutes() {
  // Tienda en línea pública: siempre disponible sin importar auth/loading
  const location = useLocation();
  if (location.pathname.startsWith("/tienda/")) {
    return <TiendaPublicRoutes />;
  }

  return <AuthenticatedAppRoutes />;
}

function AuthenticatedAppRoutes() {
  const { user, profile, loading, signOut, overrideEmpresaId, setOverrideEmpresaId, empresa } = useAuth();
  const queryClient = useQueryClient();
  const subscription = useSubscription();
  const cardCapture = useNeedsCardCapture();
  const facturaPendiente = useFacturaPendiente();
  // Bloqueo combinado: suscripción suspendida O factura pendiente vencida
  const isBlockedTotal = subscription.isBlocked || (!subscription.isSuperAdmin && facturaPendiente.shouldBlock);
  
  const { hasPermiso, loading: permisosLoading } = usePermisos();
  
  // Global unhandled rejection → error modal
  useGlobalErrorHandler();
  
  // Pre-warm React Query cache with base catalogs on login
  useBootstrapPrefetch();

  const isSoloMovil = user && !permisosLoading && hasPermiso('solo_movil', 'ver');
  // POS-only: user that can ONLY access the POS (no admin desktop, no mobile route)
  const canDashboard = user && !permisosLoading && hasPermiso('dashboard', 'ver');
  const canPos = user && !permisosLoading && hasPermiso('pos', 'ver');
  const isSoloPos = !!(user && !permisosLoading && canPos && !canDashboard && !isSoloMovil);

  const [loadingTooLong, setLoadingTooLong] = useState(false);
  useEffect(() => {
    if (!(loading || subscription.loading)) { setLoadingTooLong(false); return; }
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [loading, subscription.loading]);

  useEffect(() => {
    if (!user?.id || subscription.loading || subscription.status !== 'active') return;
    // Limpia TODAS las variantes del cache de suscripción para este usuario
    // (la clave real es `uniline_subscription_state:userId:empresaId`).
    try {
      const prefix = `uniline_subscription_state:${user.id}`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
    queryClient.invalidateQueries({ queryKey: ['factura-pendiente', profile?.empresa_id] });
  }, [user?.id, profile?.empresa_id, subscription.loading, subscription.status, queryClient]);

  // Registrar el Service Worker SOLO cuando hay un usuario autenticado.
  // Las páginas públicas (landing, /partners, etc.) nunca instalan SW para
  // que las publicaciones nuevas se vean al instante sin limpiar caché.
  useEffect(() => {
    if (!user) return;
    import('@/pwa/registerSW').then(({ registerAppSW }) => registerAppSW());
  }, [user]);

  // Partner-only user (tiene partner row pero NO profile de empresa) → solo panel /partner
  const partnerQ = usePartner();
  const isPartnerOnly = !!user && !profile && !loading && !!partnerQ.data;
  if (isPartnerOnly) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/partner" element={<PartnerLayout />}>
            <Route index element={<PartnerDashboard />} />
            <Route path="empresas" element={<PartnerEmpresas />} />
            <Route path="cupones" element={<PartnerCupones />} />
            <Route path="comisiones" element={<PartnerComisiones />} />
            <Route path="perfil" element={<PartnerPerfil />} />
          </Route>
          <Route path="/tutoriales" element={<TutorialesPage />} />
          <Route path="/soporte" element={<SoportePage />} />
          <Route path="*" element={<Navigate to="/partner" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (loading || subscription.loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-6">
        <div className="relative flex flex-col items-center gap-5">
          <img
            src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png"
            alt="Rutapp"
            className="h-14 w-14 rounded-2xl object-contain shadow-lg"
          />
          <div className="flex flex-col items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 80 50"
              className="w-20 h-auto text-primary opacity-80 animate-bounce"
              style={{ animationDuration: '2s' }}
              fill="currentColor"
            >
              <path d="M64 20c-1 0-2 .1-3 .3C59.5 14.3 53.3 10 46 10c-6.1 0-11.4 3.2-14.4 8C30.4 17.4 29 17 27.5 17 21.7 17 17 21.7 17 27.5S21.7 38 27.5 38h36.5C70.3 38 76 32.3 76 25.5S70.3 20 64 20z"/>
            </svg>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary"
                  style={{
                    animation: 'pulse 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                    opacity: 0.4,
                  }}
                />
              ))}
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground tracking-wide">Cargando Rutapp...</p>
        </div>
        {loadingTooLong && user && (
          <button
            onClick={() => signOut()}
            className="text-xs text-destructive underline hover:text-destructive/80 mt-2"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/modulos" element={<ModulosMktPage />} />
          <Route path="/precios" element={<PreciosMktPage />} />
          <Route path="/giros" element={<GirosMktIndexPage />} />
          <Route path="/giros/:slug" element={<GiroMktDetallePage />} />
          <Route path="/landing-nueva" element={<LandingV2Page />} />
          <Route path="/landing-nueva/giros" element={<GirosIndexPage />} />
          <Route path="/landing-nueva/precios" element={<PreciosLandingPage />} />
          <Route path="/landing-nueva/giros/distribuidoras-de-abarrotes" element={<AbarrotesPage />} />
          <Route path="/landing-nueva/giros/refresqueras-y-bebidas" element={<RefresquerasPage />} />
          <Route path="/landing-nueva/giros/panaderias-y-reparto" element={<PanaderiasPage />} />
          <Route path="/landing-nueva/giros/productos-de-limpieza" element={<LimpiezaPage />} />
          <Route path="/landing-nueva/giros/lacteos-y-cremerias" element={<LacteosPage />} />
          <Route path="/landing-nueva/giros/botanas-y-dulces" element={<BotanasPage />} />
          <Route path="/landing-nueva/giros/agua-purificada" element={<AguaPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/terminos" element={<TerminosPage />} />
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="/catalogo/:token" element={<CatalogoPublicoPage />} />
          <Route path="/pagar/:token" element={<PagarPage />} />
          <Route path="/factura/:folio" element={<FacturaRedirectPage />} />
          <Route path="/cliente/:token" element={<EstadoCuentaPublicoPage />} />
          <Route path="/cotizacion/:token" element={<CotizacionPublicaPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="/partners" element={<PartnersLandingPage />} />
          <Route path="/tutoriales" element={<TutorialesPage />} />
          <Route path="/soporte" element={<SoportePage />} />
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

  // Trial owners without captured card MUST complete registration before using the app.
  if (cardCapture.needs) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/completar-registro" element={<CompletarRegistroPage />} />
          <Route path="/terminos" element={<TerminosPage />} />
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="*" element={<Navigate to="/completar-registro" replace />} />
        </Routes>
      </Suspense>
    );
  }


  // Blocked users — only billing access + sign-out header
  // Also applies to super admin when overriding to a suspended empresa
  const isSuperAdminOverride = subscription.isSuperAdmin && !!overrideEmpresaId;
  const isOwnerOfEmpresa = !!empresa?.owner_user_id && empresa.owner_user_id === user?.id;
  const isBillingOwner = isSuperAdminEmail(user?.email) || isOwnerOfEmpresa;
  if (isBlockedTotal && (!subscription.isSuperAdmin || isSuperAdminOverride)) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        <WhatsAppSuspendedBanner /><SubscriptionBanner />
      <OnboardingGate />
        <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg text-foreground">RutApp</span>
            <Badge variant="destructive" className="text-xs">Suspendida</Badge>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdminOverride ? (
              <Button variant="default" size="sm" onClick={() => { setOverrideEmpresaId(null); window.location.href = '/super-admin'; }}>
                ← Volver a Panel Master
              </Button>
            ) : (
              <>
                {isBillingOwner && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/mi-suscripcion">Mi Suscripción</Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => signOut()}>
                  Cerrar sesión
                </Button>
              </>
            )}
          </div>
        </header>
        <div className="flex-1">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {isBillingOwner && <Route path="/facturacion" element={<FacturacionPage />} />}
              {isBillingOwner && <Route path="/mi-suscripcion" element={<MiSuscripcionPage />} />}
              <Route path="*" element={
                <div className="min-h-[60vh] flex items-center justify-center p-6 text-center">
                  <div className="max-w-md space-y-3">
                    <h2 className="text-xl font-semibold">Cuenta suspendida</h2>
                    <p className="text-sm text-muted-foreground">Tu suscripción está suspendida. Contacta a tu administrador para reactivarla.</p>
                  </div>
                </div>
              } />
            </Routes>
          </Suspense>
        </div>
      </div>
    );
  }

  // Super admin always has access (when not overriding to a blocked empresa)
  if (subscription.isSuperAdmin) {
    return (
      <>
        <WhatsAppSuspendedBanner /><SubscriptionBanner />
      <OnboardingGate />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/super-admin" element={<SuperAdminPage />} />
            <Route path="/super-admin/partners" element={<SuperAdminPartnersPage />} />
            <Route path="/super-admin/database-health" element={<DatabaseHealthPage />} />
            <Route path="/admin/database-health" element={<DatabaseHealthPage />} />
            <Route path="/super-admin/sync-health" element={<SyncHealthPage />} />
            <Route path="/partner" element={<PartnerLayout />}>
              <Route index element={<PartnerDashboard />} />
              <Route path="empresas" element={<PartnerEmpresas />} />
              <Route path="cupones" element={<PartnerCupones />} />
              <Route path="comisiones" element={<PartnerComisiones />} />
              <Route path="perfil" element={<PartnerPerfil />} />
            </Route>
            {renderAuthenticatedRoutes()}
          </Routes>
        </Suspense>
      </>
    );
  }

  // Regular blocked users
  if (isBlockedTotal) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        <WhatsAppSuspendedBanner /><SubscriptionBanner />
      <OnboardingGate />
        <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg text-foreground">RutApp</span>
            <Badge variant="destructive" className="text-xs">Suspendida</Badge>
          </div>
          <div className="flex items-center gap-2">
            {isBillingOwner && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/mi-suscripcion">Mi Suscripción</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              Cerrar sesión
            </Button>
          </div>
        </header>
        <div className="flex-1">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {isBillingOwner && <Route path="/facturacion" element={<FacturacionPage />} />}
              {isBillingOwner && <Route path="/mi-suscripcion" element={<MiSuscripcionPage />} />}
              <Route path="*" element={
                <div className="min-h-[60vh] flex items-center justify-center p-6 text-center">
                  <div className="max-w-md space-y-3">
                    <h2 className="text-xl font-semibold">Cuenta suspendida</h2>
                    <p className="text-sm text-muted-foreground">Tu suscripción está suspendida. Contacta a tu administrador para reactivarla.</p>
                  </div>
                </div>
              } />
            </Routes>
          </Suspense>
        </div>
      </div>
    );
  }

  // Solo móvil — user can only access /ruta routes
  if (isSoloMovil) {
    return (
      <>
      <WhatsAppSuspendedBanner /><SubscriptionBanner />
      <OnboardingGate />
      <Routes>
        <Route path="/ruta" element={<MobileLayout />}>
          <Route index element={<RutaClientesEntregas />} />
          <Route path="inicio" element={<RutaInicio />} />
          <Route path="dashboard" element={<RutaDashboard />} />
          <Route path="ventas" element={<RutaVentasTab />} />
          <Route path="pos" element={<Suspense fallback={<PageLoader />}><PuntoVentaPage /></Suspense>} />
          <Route path="carga" element={<RutaMiCarga />} />
          <Route path="cobros" element={<RutaCobros />} />
          <Route path="stock" element={<RutaStock />} />
          <Route path="gastos" element={<RutaGastos />} />
          <Route path="promociones" element={<RutaPromociones />} />
          <Route path="entregas" element={<RutaClientesEntregas />} />
          <Route path="perfil" element={<RutaPerfil />} />
        </Route>
        {/* Standalone ruta pages (outside MobileLayout) */}
        <Route path="/ruta/ventas/nueva" element={<RutaNuevaVenta />} />
        <Route path="/ruta/ventas/:id" element={<RutaVentaDetalle />} />
        <Route path="/ruta/entregas/:id" element={<RutaEntregaDetalle />} />
        <Route path="/ruta/cobros/nuevo" element={<RutaCobrar />} />
        <Route path="/ruta/clientes/nuevo" element={<RutaNuevoCliente />} />
        <Route path="/ruta/clientes/:id" element={<RutaClienteDetalle />} />
        <Route path="/ruta/devolucion" element={<RutaDevolucion />} />
        <Route path="/ruta/descarga" element={<RutaDescarga />} />
        <Route path="/ruta/mapa" element={<RutaMapaPage />} />
        <Route path="/ruta/navegacion" element={<RutaNavegacionPage />} />
        <Route path="/ruta/sincronizar" element={<RutaSincronizarPage />} />
        <Route path="/ruta/pendientes" element={<PendientesSincronizarPage />} />

        <Route path="/ruta/iniciar" element={<RutaIniciarPage />} />
        <Route path="/conteo/:countId" element={<Suspense fallback={<PageLoader />}><ConteoFisicoPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/ruta" replace />} />
      </Routes>
      </>
    );
  }

  // POS-only — user can only access /pos (kiosk mode)
  if (isSoloPos) {
    return (
      <>
        <WhatsAppSuspendedBanner /><SubscriptionBanner />
      <OnboardingGate />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/pos" element={<PuntoVentaPage />} />
            <Route path="*" element={<Navigate to="/pos" replace />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  return (
    <>
      <WhatsAppSuspendedBanner /><SubscriptionBanner />
      <OnboardingGate />
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
        <Route path="inicio" element={<RutaInicio />} />
        <Route path="dashboard" element={<RutaDashboard />} />
        <Route path="ventas" element={<RutaVentasTab />} />
        <Route path="pos" element={<Suspense fallback={<PageLoader />}><PuntoVentaPage /></Suspense>} />
        <Route path="carga" element={<RutaMiCarga />} />
        <Route path="cobros" element={<RutaCobros />} />
        <Route path="stock" element={<RutaStock />} />
      <Route path="gastos" element={<RutaGastos />} />
      <Route path="promociones" element={<RutaPromociones />} />
      <Route path="entregas" element={<RutaClientesEntregas />} />
      <Route path="perfil" element={<RutaPerfil />} />
      </Route>
      <Route path="/ruta/ventas/nueva" element={<RutaNuevaVenta />} />
      <Route path="/ruta/ventas/:id" element={<RutaVentaDetalle />} />
      <Route path="/ruta/entregas/:id" element={<RutaEntregaDetalle />} />
      <Route path="/ruta/cobros/nuevo" element={<RutaCobrar />} />
      <Route path="/ruta/clientes/nuevo" element={<RutaNuevoCliente />} />
      <Route path="/ruta/clientes/:id" element={<RutaClienteDetalle />} />
      <Route path="/ruta/devolucion" element={<RutaDevolucion />} />
      <Route path="/ruta/descarga" element={<RutaDescarga />} />
      <Route path="/ruta/mapa" element={<RutaMapaPage />} />
      <Route path="/ruta/navegacion" element={<RutaNavegacionPage />} />
      <Route path="/ruta/sincronizar" element={<RutaSincronizarPage />} />
      <Route path="/ruta/pendientes" element={<PendientesSincronizarPage />} />

      <Route path="/ruta/iniciar" element={<RutaIniciarPage />} />

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
  const { user, empresa } = useAuth();
  const isFacturacionAdmin = isSuperAdminEmail(user?.email);
  const isBillingOwner = isFacturacionAdmin || (!!empresa?.owner_user_id && empresa.owner_user_id === user?.id);

  return (
    <Suspense fallback={<PageLoader />}>
      <PermissionGuard path={location.pathname}>
        <Routes>
          {desktopRoutes(isBillingOwner, isFacturacionAdmin)}
        </Routes>
      </PermissionGuard>
    </Suspense>
  );
}


function HomeRedirect() {
  const { firstAccessibleRoute, loading } = usePermisos();
  if (loading) return null;
  return <Navigate to={firstAccessibleRoute} replace />;
}

function desktopRoutes(isBillingOwner: boolean, isFacturacionAdmin: boolean) {
  return (
    <>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<HomeRedirect />} />
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
      <Route path="/logistica/concentrado" element={<ConcentradoSurtidoPage />} />
      <Route path="/logistica/entregas/nuevo" element={<Navigate to="/logistica/entregas" replace />} />
      <Route path="/logistica/entregas/camion/:vendedorId" element={<EntregaCamionPage />} />
      <Route path="/logistica/entregas/:id" element={<EntregaFormPage />} />
      <Route path="/entregas" element={<Navigate to="/logistica/entregas" replace />} />
      <Route path="/entregas/nuevo" element={<Navigate to="/logistica/entregas" replace />} />
      <Route path="/entregas/:id" element={<EntregaFormPage />} />
      <Route path="/logistica/pedidos-pendientes" element={<Navigate to="/logistica/pedidos" replace />} />
      <Route path="/ventas/entregas" element={<Navigate to="/logistica/entregas" replace />} />
      <Route path="/ventas/reporte-entregas" element={<Navigate to="/reportes" replace />} />
      <Route path="/reportes/entregas" element={<Navigate to="/reportes" replace />} />
      <Route path="/ventas/cobranza" element={<CobranzaPage />} />
      <Route path="/ventas/rutas" element={<MapaClientesPage />} />
      <Route path="/ventas/mapa-clientes" element={<MapaClientesPage />} />
      <Route path="/ventas/mapa-ventas" element={<MapaVentasPage />} />

      <Route path="/ventas/promociones" element={<PromocionesPage />} />
      <Route path="/pos/admin" element={<Suspense fallback={<PageLoader />}><PosAdminPage /></Suspense>} />
      <Route path="/logistica/dashboard" element={<LogisticaDashboardPage />} />
      <Route path="/logistica/orden-carga/:camionId" element={<OrdenCargaPage />} />
      <Route path="/logistica/reportes" element={<LogisticaReportesPage />} />
      <Route path="/ventas/:id" element={<VentaFormPage />} />
      <Route path="/cotizaciones" element={<CotizacionesListPage />} />
      <Route path="/cotizaciones/:id" element={<CotizacionFormPage />} />
      <Route path="/cotizacion/:token" element={<CotizacionPublicaPage />} />
      {/* Parent menu redirects (avoid 404 when clicking parent group) */}
      <Route path="/almacen" element={<Navigate to="/almacen/inventario" replace />} />
      <Route path="/finanzas" element={<Navigate to="/finanzas/por-cobrar" replace />} />
      <Route path="/logistica" element={<Navigate to="/logistica/dashboard" replace />} />
      <Route path="/catalogos" element={<Navigate to="/proveedores" replace />} />
      <Route path="/almacen/inventario" element={<InventarioPage />} />
      <Route path="/almacen/inteligencia" element={<InteligenciaAlmacenPage />} />
      <Route path="/almacen/almacenes" element={<AlmacenesPage />} />
      <Route path="/almacen/lotes" element={<LotesPage />} />
      <Route path="/almacen/kardex" element={<KardexPage />} />
      <Route path="/almacen/compras" element={<ComprasPage />} />
      <Route path="/almacen/compras/sugeridas" element={<ComprasSugeridasPage />} />
      <Route path="/almacen/compras/:id" element={<CompraFormPage />} />
      {/* Lotes removed — no longer used */}
      <Route path="/almacen/descargas" element={<DescargasPage />} />
      <Route path="/almacen/traspasos" element={<TraspasosListPage />} />
      <Route path="/almacen/traspasos/:id" element={<TraspasoFormPage />} />
      <Route path="/almacen/ajustes" element={<AjustesInventarioPage />} />
      <Route path="/almacen/ajustes-mermas" element={<AjustesMermasPage />} />
      <Route path="/almacen/auditorias" element={<AuditoriasPage />} />
      <Route path="/almacen/auditorias/:id/conteo" element={<AuditoriaConteoPage />} />
      <Route path="/almacen/auditorias/:id/resultados" element={<AuditoriaResultadosPage />} />
      <Route path="/almacen/conteos" element={<ConteosFisicosPage />} />
      <Route path="/almacen/mermas" element={<MermasPage />} />
      <Route path="/almacen/mermas/motivos" element={<MermaMotivosPage />} />
      <Route path="/finanzas/por-cobrar" element={<CuentasCobrarPage />} />
      <Route path="/finanzas/aplicar-pagos" element={<AplicarPagosPage />} />
      <Route path="/finanzas/por-pagar" element={<CuentasPagarPage />} />
      <Route path="/finanzas/saldos-cliente" element={<EstadoCuentaClientePage />} />
      <Route path="/finanzas/saldos-proveedor" element={<SaldosProveedorPage />} />
      <Route path="/finanzas/aplicar-pagos-proveedor" element={<AplicarPagosProveedorPage />} />
      <Route path="/finanzas/pagos-proveedores" element={<PagosProveedoresPage />} />
      <Route path="/finanzas/gastos" element={<GastosDesktopPage />} />
      <Route path="/comisiones" element={<ComisionesLayoutPage />}>
        <Route index element={<ComisionesAvancePage />} />
        <Route path="avance" element={<ComisionesAvancePage />} />
        <Route path="esquemas" element={<ComisionesEsquemasPage />} />
        <Route path="reglas" element={<ComisionesReglasPage />} />
        <Route path="generadas" element={<ComisionesGeneradasPage />} />
        <Route path="por-volumen" element={<ComisionesVolumenPage />} />
        <Route path="por-pagar" element={<ComisionesPorPagarPage />} />
        <Route path="recibos" element={<ComisionesRecibosPage />} />
      </Route>
      <Route path="/reportes" element={<ReportesPage />} />
      <Route path="/reportes/personalizados" element={<ReportesPersonalizadosPage />} />
      <Route path="/control" element={<ControlPage />} />
      <Route path="/tutoriales" element={<TutorialesPage />} />
      <Route path="/actualizaciones" element={<ActualizacionesPage />} />
          <Route path="/soporte" element={<SoportePage />} />
      <Route path="/perfil" element={<PerfilPage />} />
      <Route path="/configuracion" element={<ConfiguracionPage />} />
      <Route path="/configuracion-inicial" element={<ConfiguracionInicialPage />} />
      <Route path="/configuracion/whatsapp" element={<WhatsAppConfigPage />} />
      <Route path="/configuracion/wa-bot" element={<WhatsAppBotPage />} />
      <Route path="/configuracion/saldos-iniciales" element={<SaldosInicialesPage />} />
      <Route path="/configuracion/usuarios" element={<UsuariosPage />} />
      <Route path="/administracion/usuarios" element={<UsuariosPage />} />
      <Route path="/administracion/metas" element={<MetasConfigPage />} />
      <Route path="/administracion/metas/seguimiento" element={<MetasSeguimientoPage />} />
      <Route path="/configuracion/vehiculos" element={<VehiculosPage />} />
      <Route path="/configuracion/homologacion" element={<HomologacionCatalogoPage />} />
      <Route path="/configuracion/tienda" element={<TiendaConfigPage />} />
      <Route path="/configuracion/consumo-datos" element={<ConsumoDatosPage />} />
      <Route path="/logistica/jornadas" element={<JornadasRutaPage />} />
      {isBillingOwner && <Route path="/facturacion" element={<FacturacionPage />} />}
      {isBillingOwner && <Route path="/mi-suscripcion" element={<MiSuscripcionPage />} />}
      {isBillingOwner && <Route path="/cancelar-suscripcion" element={<CancelSubscriptionPage />} />}
      {isBillingOwner && <Route path="/completar-registro" element={<CompletarRegistroPage />} />}
      {isFacturacionAdmin && <Route path="/facturacion-cfdi" element={<FacturacionCfdiPage />} />}
      {isFacturacionAdmin && <Route path="/facturacion-cfdi/catalogos" element={<FacturacionCfdiPage />} />}
      {isFacturacionAdmin && <Route path="/facturacion-cfdi/avanzado" element={<FacturacionAvanzadaPage />} />}
      {isFacturacionAdmin && <Route path="/facturacion-cfdi/avanzado/:section" element={<FacturacionAvanzadaPage />} />}
      {isFacturacionAdmin && <Route path="/facturacion-cfdi/:id" element={<CfdiFormPage />} />}


      <Route path="/catalogo/:token" element={<CatalogoPublicoPage />} />
      <Route path="/cliente/:token" element={<EstadoCuentaPublicoPage />} />
      <Route path="/unsubscribe" element={<UnsubscribePage />} />
      <Route path="/partner" element={<PartnerLayout />}>
        <Route index element={<PartnerDashboard />} />
        <Route path="empresas" element={<PartnerEmpresas />} />
        <Route path="cupones" element={<PartnerCupones />} />
        <Route path="comisiones" element={<PartnerComisiones />} />
        <Route path="perfil" element={<PartnerPerfil />} />
      </Route>
      {/* Nested context-preserving routes for product/client detail */}
      <Route path="/:a/productos/:id" element={<ProductoFormPage />} />
      <Route path="/:a/:b/productos/:id" element={<ProductoFormPage />} />
      <Route path="/:a/:b/:c/productos/:id" element={<ProductoFormPage />} />
      <Route path="/:a/clientes/:id" element={<GoogleMapsProvider><ClienteFormPage /></GoogleMapsProvider>} />
      <Route path="/:a/:b/clientes/:id" element={<GoogleMapsProvider><ClienteFormPage /></GoogleMapsProvider>} />
      <Route path="/:a/:b/:c/clientes/:id" element={<GoogleMapsProvider><ClienteFormPage /></GoogleMapsProvider>} />
      <Route path="*" element={<NotFound />} />
    </>
  );
}

import { useReconnectRefresh } from "@/hooks/useReconnectRefresh";

function ReconnectRefreshMount() {
  useReconnectRefresh();
  return null;
}

const App = () => (
  <GlobalErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ReconnectRefreshMount />
      <ErrorModalProvider>
        <TooltipProvider>
          <Sonner position="top-right" />
          <AuthProvider>
            <GlobalColumnResizer />
            <GlobalColumnHider />
            <TableAutoHeight />
            <BrowserRouter>
              <AppRoutes />
              <FacturaPendienteModal />
              <PWAUpdatePrompt />
              <BroadcastListener />
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </ErrorModalProvider>
    </QueryClientProvider>
  </GlobalErrorBoundary>
);

export default App;
