import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import ProductosListPage from "@/pages/ProductosListPage";
import ProductoFormPage from "@/pages/ProductoFormPage";
import TarifasListPage from "@/pages/TarifasListPage";
import TarifaFormPage from "@/pages/TarifaFormPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import NotFound from "@/pages/NotFound";

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

  if (!user) return <LoginPage />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/productos" replace />} />
        <Route path="/productos" element={<ProductosListPage />} />
        <Route path="/productos/:id" element={<ProductoFormPage />} />
        <Route path="/tarifas" element={<TarifasListPage />} />
        <Route path="/tarifas/:id" element={<TarifaFormPage />} />
        <Route path="/clientes" element={<PlaceholderPage title="Clientes" />} />
        <Route path="/rutas" element={<PlaceholderPage title="Rutas" />} />
        <Route path="/pedidos" element={<PlaceholderPage title="Pedidos" />} />
        <Route path="/facturacion" element={<PlaceholderPage title="Facturación" />} />
        <Route path="/reportes" element={<PlaceholderPage title="Reportes" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
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
