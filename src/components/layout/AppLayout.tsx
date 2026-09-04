import { Outlet } from "react-router-dom";
import { Component, ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, useSidebarContext } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";
import { useAutoPrintPedidos } from "@/hooks/useAutoPrintPedidos";

// Error boundary para capturar erros de renderização nas páginas
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: error?.message || "Erro desconhecido" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "16px", textAlign: "center", padding: "32px" }}>
          <p style={{ fontSize: "18px", fontWeight: 600 }}>Erro ao carregar a página</p>
          <p style={{ fontSize: "14px", color: "#b3a69e" }}>{this.state.message}</p>
          <button
            style={{ padding: "8px 20px", border: "1px solid #4a3a33", borderRadius: "6px", cursor: "pointer", background: "transparent", color: "#f8f5f2" }}
            onClick={() => {
              this.setState({ hasError: false, message: "" });
              window.location.reload();
            }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppLayoutContent() {
  const { isCollapsed, isMobileOpen, setIsMobileOpen } = useSidebarContext();
  // Impressao automatica de pedidos novos (ativada por toggle; roda enquanto o painel esta aberto).
  useAutoPrintPedidos();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <AppSidebar />

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <main
        className={cn(
          "min-h-screen max-w-full overflow-x-hidden transition-all duration-300",
          isCollapsed ? "lg:ml-14" : "lg:ml-[220px]",
          "ml-0"
        )}
      >
        <div className="max-w-full overflow-x-hidden p-4 md:p-6">
          <PageErrorBoundary>
            <Outlet />
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppLayoutContent />
    </SidebarProvider>
  );
}
