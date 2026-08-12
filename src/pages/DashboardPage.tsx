import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, DollarSign, TrendingUp, Package, Users,
  AlertTriangle, BarChart3, Clock, Eye, ArrowUpRight,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import UnifiedPeriodFilter, { UnifiedPeriod, getRangeFromFilter } from "@/components/shared/UnifiedPeriodFilter";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<UnifiedPeriod>("total");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>();
  const [rankingOpen, setRankingOpen] = useState(false);

  const range = getRangeFromFilter(periodo, selectedMonths, customRange);
  const paramsString = useMemo(() => {
    if (periodo === "total") return "";
    return new URLSearchParams({
      dataInicio: format(range.from, "yyyy-MM-dd"),
      dataFim: format(range.to, "yyyy-MM-dd"),
    }).toString();
  }, [periodo, range.from, range.to]);

  const { data: resumo } = useQuery({
    queryKey: ["dashboard-resumo", periodo, selectedMonths.join(","), customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: () => api.get<any>(`/api/financeiro/resumo${paramsString ? `?${paramsString}` : ""}`),
  });

  const { data: pedidosData } = useQuery({
    queryKey: ["dashboard-pedidos", periodo, selectedMonths.join(","), customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: () => api.get<any>(`/api/pedidos${paramsString ? `?${paramsString}&limit=100000` : "?limit=100000"}`),
  });

  const { data: alertasData } = useQuery({
    queryKey: ["dashboard-alertas"],
    queryFn: () => api.get<any[]>("/api/estoque?alertas=true"),
  });

  const { data: clientesData } = useQuery({
    queryKey: ["dashboard-clientes"],
    queryFn: () => api.get<any[]>("/api/clientes"),
  });

  const { data: produtosData } = useQuery({
    queryKey: ["dashboard-produtos"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const pedidos = pedidosData?.pedidos ?? [];
  const alertas = alertasData ?? [];
  const clientes = clientesData ?? [];
  const produtos = produtosData ?? [];

  const pedidosAtivos = pedidos.filter((p: any) => !["ENTREGUE", "CANCELADO"].includes(p.status));
  const pedidosHoje = pedidos.filter((p: any) => format(new Date(p.criadoEm), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"));

  const produtoVendas: Record<string, { nome: string; qtd: number; receita: number }> = {};
  for (const p of pedidos.filter((p: any) => p.status === "ENTREGUE")) {
    for (const item of p.itens ?? []) {
      const nome = item.produto?.nome ?? item.produtoId;
      if (!produtoVendas[item.produtoId]) produtoVendas[item.produtoId] = { nome, qtd: 0, receita: 0 };
      produtoVendas[item.produtoId].qtd += item.quantidade;
      produtoVendas[item.produtoId].receita += item.subtotal;
    }
  }

  const topProdutos = Object.values(produtoVendas).sort((a, b) => b.qtd - a.qtd);
  const top5Produtos = topProdutos.slice(0, 5);

  const recorrentes = clientes.filter((c: any) => c.totalPedidos >= 3).length;
  const inativos = clientes.filter((c: any) => {
    if (!c.ultimoPedido) return c.totalPedidos > 0;
    return (Date.now() - new Date(c.ultimoPedido).getTime()) / (1000 * 60 * 60 * 24) > 30;
  }).length;

  const receitaPeriodo = resumo?.graficoDiario ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Executivo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral do período selecionado
          </p>
        </div>
        <UnifiedPeriodFilter
          value={periodo}
          onChange={setPeriodo}
          selectedMonths={selectedMonths}
          onMonthsChange={setSelectedMonths}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Receita", value: fmt(resumo?.receita ?? 0), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-100" },
          { title: "Pedidos", value: pedidosData?.total ?? pedidos.length, icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-100" },
          { title: "Ticket Médio", value: fmt(resumo?.ticketMedio ?? 0), icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-100" },
          { title: "Pedidos Ativos", value: pedidosAtivos.length, icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
        ].map((kpi) => (
          <Card key={kpi.title}>
            <CardContent className="pt-5 pb-4">
              <div className={`rounded-xl p-2 ${kpi.bg} inline-flex mb-2`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Receita por período</CardTitle>
            <Badge variant="outline" className="text-xs">
              {periodo === "total" ? "Todo o periodo" : `${format(range.from, "dd/MM")} - ${format(range.to, "dd/MM")}`}
            </Badge>
          </CardHeader>
          <CardContent>
            {receitaPeriodo.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={receitaPeriodo}>
                  <defs>
                    <linearGradient id="dashboardReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} tickFormatter={(v) => format(new Date(v + "T12:00:00"), "dd/MM")} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmt(v)} labelFormatter={(v) => format(new Date(v + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} />
                  <Area type="monotone" dataKey="valor" stroke="hsl(var(--primary))" fill="url(#dashboardReceita)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados de receita</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Top 5 Produtos Mais Vendidos</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setRankingOpen(true)}>
              <Eye className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {top5Produtos.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados de vendas</div>
            ) : (
              <div className="space-y-3">
                {top5Produtos.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.nome}</p>
                      <div className="h-1.5 bg-muted rounded-full mt-1">
                        <div
                          className="h-1.5 bg-primary rounded-full"
                          style={{ width: `${(p.qtd / (top5Produtos[0]?.qtd || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold">{p.qtd} un.</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Clientes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total cadastrados</span>
              <span className="font-bold">{clientes.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Recorrentes (3+ pedidos)</span>
              <Badge className="bg-emerald-100 text-emerald-700">{recorrentes}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Inativos (+30 dias)</span>
              <Badge className="bg-red-100 text-red-700">{inativos}</Badge>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/clientes")}>
              Ver todos os clientes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Estoque</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total de produtos</span>
              <span className="font-bold">{produtos.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Disponíveis</span>
              <Badge className="bg-emerald-100 text-emerald-700">{produtos.filter((p: any) => p.disponivel).length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Em alerta de estoque</span>
              <Badge className={alertas.length > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}>
                {alertas.length}
              </Badge>
            </div>
            {alertas.length > 0 && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/estoque/alertas")}>
                <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />
                Ver alertas
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Financeiro</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Receita</span>
              <span className="font-bold text-emerald-600">{fmt(resumo?.receita ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Custos</span>
              <span className="font-bold text-red-600">{fmt(resumo?.custos ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-medium">Margem</span>
              <span className={`font-bold ${(resumo?.margem ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {fmt(resumo?.margem ?? 0)}
              </span>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/financeiro")}>
              Ver financeiro completo
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={rankingOpen} onOpenChange={setRankingOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ranking completo de produtos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {topProdutos.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados de vendas</div>
            ) : (
              topProdutos.map((p, i) => (
                <div key={p.nome} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.qtd} pedidos atendidos · {fmt(p.receita)}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
