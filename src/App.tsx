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
import CargasListPage from "@/pages/CargasListPage";
import CargaFormPage from "@/pages/CargaFormPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import DemandaPage from "@/pages/DemandaPage";
import InventarioPage from "@/pages/InventarioPage";
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
      </Route>
      <Route path="/ruta/ventas/nueva" element={<RutaNuevaVenta />} />
      <Route path="/ruta/ventas/:id" element={<RutaVentaDetalle />} />
      <Route path="/ruta/cobros/nuevo" element={<RutaCobrar />} />
      <Route path="/ruta/devolucion" element={<RutaDevolucion />} />

      {/* Desktop ERP */}
      <Route path="*" element={
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/productos" replace />} />
            <Route path="/productos" element={<ProductosListPage />} />
            <Route path="/productos/:id" element={<ProductoFormPage />} />
            <Route path="/tarifas" element={<TarifasListPage />} />
            <Route path="/tarifas/:id" element={<TarifaFormPage />} />
            <Route path="/clientes" element={<ClientesListPage />} />
            <Route path="/clientes/:id" element={<ClienteFormPage />} />
            <Route path="/ventas" element={<VentasListPage />} />
            <Route path="/ventas/:id" element={<VentaFormPage />} />
            <Route path="/demanda" element={<DemandaPage />} />
            <Route path="/inventario" element={<InventarioPage />} />
            <Route path="/cargas" element={<CargasListPage />} />
            <Route path="/cargas/:id" element={<CargaFormPage />} />
            <Route path="/rutas" element={<PlaceholderPage title="Rutas" />} />
            <Route path="/facturacion" element={<PlaceholderPage title="Facturación" />} />
            <Route path="/reportes" element={<PlaceholderPage title="Reportes" />} />
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
