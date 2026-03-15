import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { GoogleMapsProvider } from "@/hooks/useGoogleMapsKey";
import AppLayout from "@/components/AppLayout";
import MobileLayout from "@/components/MobileLayout";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const ProductosListPage = lazy(() => import("@/pages/ProductosListPage"));
const ProductoFormPage = lazy(() => import("@/pages/ProductoFormPage"));
const TarifasListPage = lazy(() => import("@/pages/TarifasListPage"));
const TarifaFormPage = lazy(() => import("@/pages/TarifaFormPage"));
const ClientesListPage = lazy(() => import("@/pages/ClientesListPage"));
const ClienteFormPage = lazy(() => import("@/pages/ClienteFormPage"));
const VentasListPage = lazy(() => import("@/pages/VentasListPage"));
const VentaFormPage = lazy(() => import("@/pages/VentaFormPage"));
const DemandaPage = lazy(() => import("@/pages/DemandaPage"));
const EntregasPage = lazy(() => import("@/pages/EntregasPage"));
const ReporteEntregasPage = lazy(() => import("@/pages/ReporteEntregasPage"));
const CobranzaPage = lazy(() => import("@/pages/CobranzaPage"));
const RutasMapPage = lazy(() => import("@/pages/RutasMapPage"));
const MapaClientesPage = lazy(() => import("@/pages/MapaClientesPage"));
const MapaVentasPage = lazy(() => import("@/pages/MapaVentasPage"));
const InventarioPage = lazy(() => import("@/pages/InventarioPage"));
const CargasListPage = lazy(() => import("@/pages/CargasListPage"));
const CargaFormPage = lazy(() => import("@/pages/CargaFormPage"));
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

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="text-muted-foreground text-sm">Cargando...</div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
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
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
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

        {/* Desktop ERP */}
        <Route path="*" element={
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/productos" element={<ProductosListPage />} />
                <Route path="/productos/:id" element={<ProductoFormPage />} />
                <Route path="/tarifas" element={<TarifasListPage />} />
                <Route path="/tarifas/:id" element={<TarifaFormPage />} />
                <Route path="/clientes" element={<ClientesListPage />} />
                <Route path="/clientes/:id" element={<GoogleMapsProvider><ClienteFormPage /></GoogleMapsProvider>} />
                <Route path="/ventas" element={<VentasListPage />} />
                <Route path="/ventas/demanda" element={<DemandaPage />} />
                <Route path="/ventas/entregas" element={<EntregasPage />} />
                <Route path="/ventas/reporte-entregas" element={<ReporteEntregasPage />} />
                <Route path="/ventas/cobranza" element={<CobranzaPage />} />
                <Route path="/ventas/rutas" element={<GoogleMapsProvider><RutasMapPage /></GoogleMapsProvider>} />
                <Route path="/ventas/mapa-clientes" element={<GoogleMapsProvider><MapaClientesPage /></GoogleMapsProvider>} />
                <Route path="/ventas/mapa-ventas" element={<GoogleMapsProvider><MapaVentasPage /></GoogleMapsProvider>} />
                <Route path="/ventas/:id" element={<VentaFormPage />} />
                <Route path="/almacen/inventario" element={<InventarioPage />} />
                <Route path="/almacen/cargas" element={<CargasListPage />} />
                <Route path="/almacen/cargas/:id" element={<CargaFormPage />} />
                <Route path="/almacen/almacenes" element={<AlmacenesPage />} />
                <Route path="/almacen/compras" element={<ComprasPage />} />
                <Route path="/almacen/compras/:id" element={<CompraFormPage />} />
                <Route path="/almacen/lotes" element={<LotesPage />} />
                <Route path="/almacen/descargas" element={<DescargasPage />} />
                <Route path="/finanzas/por-cobrar" element={<CuentasCobrarPage />} />
                <Route path="/finanzas/por-pagar" element={<CuentasPagarPage />} />
                <Route path="/finanzas/gastos" element={<GastosDesktopPage />} />
                <Route path="/reportes" element={<ReportesPage />} />
                <Route path="/configuracion" element={<ConfiguracionPage />} />
                <Route path="/configuracion/whatsapp" element={<WhatsAppConfigPage />} />
                <Route path="/configuracion/usuarios" element={<UsuariosPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppLayout>
        } />
      </Routes>
    </Suspense>
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
