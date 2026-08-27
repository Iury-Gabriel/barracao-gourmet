import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ShoppingCart, Package, Users, BarChart3,
  Settings, PanelLeftClose, PanelLeft, Menu, X,
  Plus, History, Activity, AlertTriangle, ArrowUpDown,
  DollarSign, Truck, TrendingUp, Tag,
  UserCheck, MessageSquare, MessageCircle,
  CalendarDays,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarContext } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { TabPermissionKey } from "@/data/usersData";
import { ThemeToggle } from "@/components/ThemeProvider";
import { useMemo } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: TabPermissionKey;
}

const pedidosItems: NavItem[] = [
  { to: "/pedidos",           label: "Pipeline",            icon: ShoppingCart,  permission: "aba_pedidos_pipeline" },
  { to: "/pedidos/novo",      label: "Novo Pedido",         icon: Plus,          permission: "aba_pedidos_novo" },
  { to: "/pedidos/novo?tipo=LOCAL", label: "Venda no Balcão", icon: Store,     permission: "aba_pedidos_novo" },
  { to: "/pedidos/historico", label: "Histórico",           icon: History,       permission: "aba_pedidos_historico" },
  { to: "/operacional",       label: "Painel Operacional",  icon: Activity,      permission: "aba_pedidos_operacional" },
  { to: "/entrega",           label: "Controle de Entrega", icon: Truck,         permission: "aba_pedidos_entrega" },
  { to: "/pedidos/kpis",      label: "KPIs de Pedidos",     icon: TrendingUp,    permission: "aba_pedidos_kpis" },
  { to: "/reservas",          label: "Reservas de Mesa",    icon: CalendarDays,  permission: "aba_salao_reservas" },
];

const estoqueItems: NavItem[] = [
  { to: "/estoque/produtos",      label: "Produtos",      icon: Package,       permission: "aba_estoque_produtos" },
  { to: "/estoque/categorias",    label: "Por Categoria", icon: Tag,           permission: "aba_estoque_categorias" },
  { to: "/estoque/movimentacoes", label: "Movimentações", icon: ArrowUpDown,   permission: "aba_estoque_movimentacoes" },
  { to: "/estoque/alertas",       label: "Alertas",       icon: AlertTriangle, permission: "aba_estoque_alertas" },
];

const clientesItems: NavItem[] = [
  { to: "/clientes",             label: "Base de Clientes", icon: Users,         permission: "aba_clientes_base" },
  { to: "/clientes/recorrencia", label: "Recorrência",      icon: UserCheck,     permission: "aba_clientes_recorrencia" },
  { to: "/clientes/interacoes",  label: "Interações",       icon: MessageSquare, permission: "aba_clientes_interacoes" },
];

const gestaoItems: NavItem[] = [
  // Dashboard absorve "KPIs & Indicadores" (o unico grafico exclusivo dele, Origem
  // dos Pedidos, foi para la; o resto ja se repetia aqui ou em /pedidos/kpis).
  // Financeiro funde "Gestao Financeira" + "Custos" em sub-abas.
  // "Clientes Ativos" saiu por duplicar a Base de Clientes do modulo Clientes.
  { to: "/dashboard",           label: "Dashboard",           icon: BarChart3,      permission: "aba_gestao_dashboard" },
  { to: "/gestao/financeira",   label: "Financeiro",          icon: DollarSign,     permission: "aba_gestao_financeira" },
  { to: "/gestao/projecao",     label: "Projeção",            icon: TrendingUp,     permission: "aba_gestao_projecao" },
  // Configuracoes tambem tem a engrenagem no rodape, mas o rodape e facil de nao
  // achar. Aqui aparece como item normal, no modulo em que a rota ja era
  // classificada pelo resolvedModuleId.
  { to: "/configuracoes",       label: "Configurações",       icon: Settings,       permission: "aba_gestao_configuracoes" },
];

const whatsappItems: NavItem[] = [
  { to: "/whatsapp/atendimentos", label: "Atendimentos", icon: MessageSquare, permission: "aba_whatsapp_atendimentos" },
];

interface ModuleDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionModule: 'pedidos' | 'estoque' | 'clientes' | 'gestao' | 'whatsapp';
  defaultRoute: string;
  items: NavItem[];
}

// Caminhos que aparecem no menu tanto puros quanto com query string
// (ex: /pedidos/novo e /pedidos/novo?tipo=LOCAL). Serve para o item sem query
// nao roubar o destaque do item com query.
const mod_items_com_query = new Set(
  [pedidosItems, estoqueItems, clientesItems, gestaoItems, whatsappItems]
    .flat()
    .filter((i) => i.to.includes('?'))
    .map((i) => i.to.split('?')[0]),
);

const modules: ModuleDef[] = [
  { id: 'pedidos',  label: 'Pedidos',  icon: ShoppingCart, permissionModule: 'pedidos',  defaultRoute: '/pedidos',          items: pedidosItems },
  { id: 'estoque',  label: 'Estoque',  icon: Package,      permissionModule: 'estoque',  defaultRoute: '/estoque/produtos', items: estoqueItems },
  { id: 'clientes', label: 'Clientes', icon: Users,        permissionModule: 'clientes', defaultRoute: '/clientes',         items: clientesItems },
  { id: 'gestao',   label: 'Gestão',   icon: BarChart3,    permissionModule: 'gestao',   defaultRoute: '/dashboard',        items: gestaoItems },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, permissionModule: 'whatsapp', defaultRoute: '/whatsapp/atendimentos', items: whatsappItems },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebarContext();
  const { currentUser, canAccess, hasModule } = useAuth();

  const resolvedModuleId = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith('/estoque'))     return 'estoque';
    if (p.startsWith('/clientes'))    return 'clientes';
    if (p.startsWith('/whatsapp'))    return 'whatsapp';
    if (p.startsWith('/custos'))      return 'gestao';
    if (p.startsWith('/financeiro'))  return 'gestao';
    if (p.startsWith('/dashboard') ||
        p.startsWith('/automacoes') || p.startsWith('/configuracoes') ||
        p.startsWith('/gestao'))      return 'gestao';
    return 'pedidos';
  }, [location.pathname]);

  const accessibleModules = modules.filter(m => hasModule(m.permissionModule));
  const activeModule = modules.find(m => m.id === resolvedModuleId) || accessibleModules[0] || modules[0];
  const filteredNavItems = activeModule.items.filter(item => !item.permission || canAccess(item.permission));

  const handleNavClick = () => { if (isMobileOpen) setIsMobileOpen(false); };

  const handleModuleClick = (mod: ModuleDef) => {
    const first = mod.items.find(i => !i.permission || canAccess(i.permission));
    navigate(first?.to || mod.defaultRoute);
    if (isMobileOpen) setIsMobileOpen(false);
  };

  const isNavActive = (item: NavItem) => {
    // Itens com query string (ex: /pedidos/novo?tipo=LOCAL) precisam casar tambem
    // pela query, senao "Novo Pedido" e "Venda no Balcao" apontam para o mesmo
    // caminho e o menu acende o item errado.
    const [caminho, query] = item.to.split('?');
    if (query) {
      if (location.pathname !== caminho) return false;
      const alvo = new URLSearchParams(query);
      const atual = new URLSearchParams(location.search);
      for (const [chave, valor] of alvo.entries()) {
        if (atual.get(chave) !== valor) return false;
      }
      return true;
    }

    // Sem query no item: uma rota com query na barra de enderecos pertence ao
    // item especifico, nao a este.
    if (location.pathname === caminho) {
      const temIrmaoComQuery = mod_items_com_query.has(location.pathname);
      if (temIrmaoComQuery && location.search) return false;
      return true;
    }

    // exact-only routes — don't highlight parent for sub-routes
    const exactOnly = ['/pedidos', '/clientes', '/estoque/produtos', '/dashboard', '/financeiro', '/custos'];
    if (exactOnly.includes(caminho)) return false;
    return location.pathname.startsWith(caminho);
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Barracão Gourmet" className="h-6 w-6 rounded object-contain" />
          <span className="text-sm font-bold text-sidebar-foreground">Barracão Gourmet</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="h-10 w-10 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>
      <div className="h-14 lg:hidden" />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col",
          "hidden lg:flex",
          isCollapsed ? "lg:w-14" : "lg:w-[220px]",
          isMobileOpen && "!flex w-[220px] shadow-2xl"
        )}
        style={{
          top: isMobileOpen ? "56px" : "0",
          height: isMobileOpen ? "calc(100vh - 56px)" : "100vh",
        }}
      >
        {/* Logo + Toggle */}
        <div className={cn(
          "flex items-center justify-between border-b border-sidebar-border flex-shrink-0",
          isCollapsed ? "h-14 px-2 justify-center" : "h-20 px-3"
        )}>
          {!isCollapsed && (
            <>
              <div className="flex items-center gap-2 flex-1 min-w-0 px-1">
                <img src="/logo.png" alt="Barracão Gourmet" className="h-7 w-7 rounded object-contain flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-sidebar-foreground leading-tight truncate">Barracão Gourmet</p>
                  <p className="text-[10px] text-sidebar-muted leading-tight">Sistema de Gestão</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(!isCollapsed)}
                className="h-8 w-8 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex-shrink-0 hidden lg:flex">
                <PanelLeftClose className="h-5 w-5" />
              </Button>
            </>
          )}
          {isCollapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)}
                  className="h-10 w-10 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <PanelLeft className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir menu</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Module dock */}
        <div className={cn(
          "flex items-center border-b border-sidebar-border flex-shrink-0",
          isCollapsed ? "flex-col gap-1 py-2 px-1" : "flex-row gap-1 px-2 py-2"
        )}>
          {accessibleModules.map(mod => {
            const isActive = resolvedModuleId === mod.id;
            const btn = (
              <button
                key={mod.id}
                onClick={() => handleModuleClick(mod)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors flex-shrink-0",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <mod.icon className="h-[18px] w-[18px]" />
              </button>
            );
            return (
              <Tooltip key={mod.id}>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side={isCollapsed ? "right" : "bottom"} className="font-medium">
                  {mod.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Nav items */}
        {isCollapsed && !isMobileOpen ? null : (
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {activeModule.label}
              </span>
            </div>

            <nav className="flex flex-col gap-0.5 px-2 flex-1 overflow-y-auto pb-2">
              {filteredNavItems.map(item => {
                const active = isNavActive(item);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* Footer - User Info */}
            <div className="border-t border-sidebar-border p-2 flex-shrink-0">
              <div className="flex w-full items-center gap-2.5 rounded-lg p-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground flex-shrink-0">
                  {currentUser?.nome.split(" ").map(n => n[0]).join("").slice(0, 2) ?? "?"}
                </div>
                <div className="flex-1 overflow-hidden text-left">
                  <p className="truncate text-xs font-semibold text-sidebar-accent-foreground">{currentUser?.nome ?? ""}</p>
                  <p className="truncate text-[10px] text-sidebar-muted">{currentUser?.perfil ?? ""}</p>
                </div>
                <ThemeToggle className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate("/configuracoes?aba=perfil")}
                      className="h-8 w-8 flex-shrink-0 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Configuracoes</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
