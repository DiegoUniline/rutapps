import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import MobileLayout from "@/components/MobileLayout";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import ProductosListPage from "@/pages/ProductosListPage";
import ProductoFormPage from "@/pages/ProductoFormPage";
import TarifasListPage from "@/pages/TarifasListPage";
import TarifaFormPage from "@/pages/TarifaFormPage";
import ClientesListPage from "@/pages/ClientesListPage";
import ClienteFormPage from "@/pages/ClienteFormPage";
import VentasListPage from "@/pages/VentasListPage";
import VentaFormPage from "@/pages/VentaFormPage";
import DemandaPage from "@/pages/DemandaPage";
import EntregasPage from "@/pages/EntregasPage";
import CobranzaPage from "@/pages/CobranzaPage";
import RutasMapPage from "@/pages/RutasMapPage";
import InventarioPage from "@/pages/InventarioPage";
import CargasListPage from "@/pages/CargasListPage";
import CargaFormPage from "@/pages/CargaFormPage";
import AlmacenesPage from "@/pages/AlmacenesPage";
import ComprasPage from "@/pages/ComprasPage";
import LotesPage from "@/pages/LotesPage";
import CuentasCobrarPage from "@/pages/CuentasCobrarPage";
import CuentasPagarPage from "@/pages/CuentasPagarPage";
import GastosDesktopPage from "@/pages/GastosDesktopPage";
import ReportesPage from "@/pages/ReportesPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import NotFound from "@/pages/NotFound";
import RutaDashboard from "@/pages/ruta/RutaDashboard";
import RutaVentas from "@/pages/ruta/RutaVentas";
import RutaClientes from "@/pages/ruta/RutaClientes";
import RutaStock from "@/pages/ruta/RutaStock";
import RutaGastos from "@/pages/ruta/RutaGastos";
import RutaNuevaVenta from "@/pages/ruta/RutaNuevaVenta";
import RutaCobros from "@/pages/ruta/RutaCobros";
import RutaCobrar from "@/pages/ruta/RutaCobrar";
import RutaVentaDetalle from "@/pages/ruta/RutaVentaDetalle";
import RutaMiCarga from "@/pages/ruta/RutaMiCarga";
import RutaDevolucion from "@/pages/ruta/RutaDevolucion";
import RutaEntregas from "@/pages/ruta/RutaEntregas";

const queryClient = new QueryClient();

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
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Mobile route sales module */}
      <Route path="/ruta" element={<MobileLayout />}>
        <Route index element={<RutaDashboard />} />
        <Route path="ventas" element={<RutaVentas />} />
        <Route path="carga" element={<RutaMiCarga />} />
        <Route path="cobros" element={<RutaCobros />} />
        <Route path="clientes" element={<RutaClientes />} />
        <Route path="stock" element={<RutaStock />} />
        <Route path="gastos" element={<RutaGastos />} />
        <Route path="entregas" element={<RutaEntregas />} />
      </Route>
      <Route path="/ruta/ventas/nueva" element={<RutaNuevaVenta />} />
      <Route path="/ruta/ventas/:id" element={<RutaVentaDetalle />} />
      <Route path="/ruta/cobros/nuevo" element={<RutaCobrar />} />
      <Route path="/ruta/devolucion" element={<RutaDevolucion />} />

      {/* Desktop ERP */}
      <Route path="*" element={
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/ventas" replace />} />
            {/* Productos */}
            <Route path="/productos" element={<ProductosListPage />} />
            <Route path="/productos/:id" element={<ProductoFormPage />} />
            <Route path="/tarifas" element={<TarifasListPage />} />
            <Route path="/tarifas/:id" element={<TarifaFormPage />} />
            {/* Clientes */}
            <Route path="/clientes" element={<ClientesListPage />} />
            <Route path="/clientes/:id" element={<ClienteFormPage />} />
            {/* Ventas module */}
            <Route path="/ventas" element={<VentasListPage />} />
            <Route path="/ventas/demanda" element={<DemandaPage />} />
            <Route path="/ventas/entregas" element={<EntregasPage />} />
            <Route path="/ventas/cobranza" element={<CobranzaPage />} />
            <Route path="/ventas/rutas" element={<RutasMapPage />} />
            <Route path="/ventas/:id" element={<VentaFormPage />} />
            {/* Almacén module */}
            <Route path="/almacen/inventario" element={<InventarioPage />} />
            <Route path="/almacen/cargas" element={<CargasListPage />} />
            <Route path="/almacen/cargas/:id" element={<CargaFormPage />} />
            <Route path="/almacen/almacenes" element={<AlmacenesPage />} />
            <Route path="/almacen/compras" element={<ComprasPage />} />
            <Route path="/almacen/lotes" element={<LotesPage />} />
            {/* Finanzas module */}
            <Route path="/finanzas/por-cobrar" element={<CuentasCobrarPage />} />
            <Route path="/finanzas/por-pagar" element={<CuentasPagarPage />} />
            <Route path="/finanzas/gastos" element={<GastosDesktopPage />} />
            {/* Reportes */}
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      } />
    </Routes>
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
