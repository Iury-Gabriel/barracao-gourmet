import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";

// Auth
import LoginPage from "./pages/auth/LoginPage";

// Cardápio público
import CardapioPage from "./pages/cardapio/CardapioPage";

// Site institucional público
import LandingPage from "./pages/site/LandingPage";

// Pedidos
import PedidosPage from "./pages/pedidos/PedidosPage";
import PedidoDetailPage from "./pages/pedidos/PedidoDetailPage";
import NovoPedidoPage from "./pages/pedidos/NovoPedidoPage";
import HistoricoPedidosPage from "./pages/pedidos/HistoricoPedidosPage";
import EntregaPage from "./pages/pedidos/EntregaPage";
import KpisPedidosPage from "./pages/pedidos/KpisPedidosPage";

// Estoque
import ProdutosPage from "./pages/estoque/ProdutosPage";
import MovimentacoesPage from "./pages/estoque/MovimentacoesPage";
import AlertasEstoquePage from "./pages/estoque/AlertasEstoquePage";
import CategoriasEstoquePage from "./pages/estoque/CategoriasEstoquePage";

// Clientes
import ClientesPage from "./pages/clientes/ClientesPage";
import ClienteDetailPage from "./pages/clientes/ClienteDetailPage";
import RecorrenciaPage from "./pages/clientes/RecorrenciaPage";
import InteracoesPage from "./pages/clientes/InteracoesPage";

// Financeiro
import FinanceiroPage from "./pages/financeiro/FinanceiroPage";
import LancamentosFinanceiroPage from "./pages/financeiro/LancamentosFinanceiroPage";

// Custos

// Gestão
import ReservasPage from "./pages/salao/ReservasPage";
import EntregadorPage from "./pages/entregador/EntregadorPage";
import OperacionalPage from "./pages/OperacionalPage";
import DashboardPage from "./pages/DashboardPage";
import AutomacoesPage from "./pages/AutomacoesPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import ProjecaoGestaoPage from "./pages/gestao/ProjecaoGestaoPage";

// WhatsApp
import AtendimentosPage from "./pages/whatsapp/AtendimentosPage";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <p className="text-muted-foreground animate-pulse">Carregando...</p>
    </div>
  );
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <Routes>
              {/* Rotas públicas */}
              <Route path="/site" element={<LandingPage />} />
              <Route path="/cardapio" element={<CardapioPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<Navigate to="/login" replace />} />

              {/* Rotas protegidas */}
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>

                  {/* Módulo Pedidos */}
                  <Route path="/pedidos" element={<ProtectedRoute permission="aba_pedidos_pipeline"><PedidosPage /></ProtectedRoute>} />
                  <Route path="/pedidos/novo" element={<ProtectedRoute permission="aba_pedidos_novo"><NovoPedidoPage /></ProtectedRoute>} />
                  <Route path="/pedidos/historico" element={<ProtectedRoute permission="aba_pedidos_historico"><HistoricoPedidosPage /></ProtectedRoute>} />
                  <Route path="/pedidos/kpis" element={<ProtectedRoute permission="aba_pedidos_kpis"><KpisPedidosPage /></ProtectedRoute>} />
                  <Route path="/pedidos/:id" element={<ProtectedRoute permission="aba_pedidos_pipeline"><PedidoDetailPage /></ProtectedRoute>} />
                  <Route path="/operacional" element={<ProtectedRoute permission="aba_pedidos_operacional"><OperacionalPage /></ProtectedRoute>} />
                  <Route path="/reservas" element={<ProtectedRoute permission="aba_salao_reservas"><ReservasPage /></ProtectedRoute>} />
                  <Route path="/entregador" element={<ProtectedRoute permission="aba_entregador_minhas"><EntregadorPage /></ProtectedRoute>} />
                  <Route path="/entrega" element={<ProtectedRoute permission="aba_pedidos_entrega"><EntregaPage /></ProtectedRoute>} />

                  {/* Módulo Estoque */}
                  <Route path="/estoque" element={<Navigate to="/estoque/produtos" replace />} />
                  <Route path="/estoque/produtos" element={<ProtectedRoute permission="aba_estoque_produtos"><ProdutosPage /></ProtectedRoute>} />
                  <Route path="/estoque/categorias" element={<ProtectedRoute permission="aba_estoque_categorias"><CategoriasEstoquePage /></ProtectedRoute>} />
                  <Route path="/estoque/movimentacoes" element={<ProtectedRoute permission="aba_estoque_movimentacoes"><MovimentacoesPage /></ProtectedRoute>} />
                  <Route path="/estoque/alertas" element={<ProtectedRoute permission="aba_estoque_alertas"><AlertasEstoquePage /></ProtectedRoute>} />

                  {/* Módulo Clientes */}
                  <Route path="/clientes" element={<ProtectedRoute permission="aba_clientes_base"><ClientesPage /></ProtectedRoute>} />
                  <Route path="/clientes/recorrencia" element={<ProtectedRoute permission="aba_clientes_recorrencia"><RecorrenciaPage /></ProtectedRoute>} />
                  <Route path="/clientes/interacoes" element={<ProtectedRoute permission="aba_clientes_interacoes"><InteracoesPage /></ProtectedRoute>} />
                  <Route path="/clientes/:id" element={<ProtectedRoute permission="aba_clientes_base"><ClienteDetailPage /></ProtectedRoute>} />

                  {/* Módulo Gestão */}
                  <Route path="/dashboard" element={<ProtectedRoute permission="aba_gestao_dashboard"><DashboardPage /></ProtectedRoute>} />
                  <Route path="/gestao" element={<Navigate to="/dashboard" replace />} />
                  {/* Duplicava a Base de Clientes; mantido como redirect para nao quebrar link salvo. */}
                  <Route path="/gestao/clientes" element={<Navigate to="/clientes" replace />} />
                  <Route path="/gestao/financeira" element={<ProtectedRoute permission="aba_gestao_financeira"><FinanceiroPage /></ProtectedRoute>} />
                  <Route path="/gestao/projecao" element={<ProtectedRoute permission="aba_gestao_projecao"><ProjecaoGestaoPage /></ProtectedRoute>} />
                  {/* KPIs & Indicadores foi absorvido pelo Dashboard. */}
                  <Route path="/gestao/kpis" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/financeiro" element={<ProtectedRoute permission="aba_financeiro_visao"><FinanceiroPage /></ProtectedRoute>} />
                  <Route path="/financeiro/lancamentos" element={<ProtectedRoute permission="aba_financeiro_lancamentos"><LancamentosFinanceiroPage /></ProtectedRoute>} />
                  {/* Custos virou sub-aba do Financeiro. */}
                  <Route path="/custos" element={<Navigate to="/gestao/financeira" replace />} />
                  <Route path="/custos/produtos" element={<Navigate to="/gestao/financeira?aba=custos-produto" replace />} />
                  <Route path="/custos/lancamentos" element={<Navigate to="/gestao/financeira?aba=custos-operacional" replace />} />
                  <Route path="/automacoes" element={<ProtectedRoute permission="aba_gestao_automacoes"><AutomacoesPage /></ProtectedRoute>} />
                  <Route path="/configuracoes" element={<ProtectedRoute permission="aba_gestao_configuracoes"><ConfiguracoesPage /></ProtectedRoute>} />

                  {/* Módulo WhatsApp */}
                  <Route path="/whatsapp/atendimentos" element={<ProtectedRoute permission="aba_whatsapp_atendimentos"><AtendimentosPage /></ProtectedRoute>} />

                  <Route path="/app" element={<Navigate to="/pedidos" replace />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
