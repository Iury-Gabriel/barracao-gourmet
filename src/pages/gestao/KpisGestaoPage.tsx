import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, ShoppingCart, Users, Clock,
  AlertTriangle, Package, DollarSign, UserCheck, UserX,
  BarChart3, Zap, Target,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function KpisGestaoPage() {
  const navigate = useNavigate();
  const hoje = new Date().toISOString().split("T")[0];
  const trintaDiasAtras = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const { data: kpisPedidos } = useQuery({
    queryKey: ["kpis-pedidos-gestao"],
    queryFn: () => api.get<any>(`/api/pedidos/kpis?dataInicio=${trintaDiasAtras}&dataFim=${hoje}`),
  });

  const { data: kpisClientes } = useQuery({
    queryKey: ["kpis-clientes-gestao"],
    queryFn: () => api.get<any>("/api/clientes/kpis"),
  });

  const { data: resumoFinanceiro } = useQuery({
    queryKey: ["kpis-financeiro-gestao"],
    queryFn: () => api.get<any>(`/api/financeiro/resumo?dataInicio=${trintaDiasAtras}&dataFim=${hoje}`),
  });

  const { data: alertasEstoque = [] } = useQuery({
    queryKey: ["kpis-alertas"],
    queryFn: () => api.get<any[]>("/api/estoque?alertas=true"),
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["kpis-produtos"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  // Top produtos mais vendidos (do kpisPedidos não temos, vamos usar pedidos)
  const { data: pedidosData } = useQuery({
    queryKey: ["kpis-pedidos-lista"],
    queryFn: () => api.get<any>(`/api/pedidos?dataInicio=${trintaDiasAtras}&dataFim=${hoje}&limit=500`),
  });

  const pedidos = pedidosData?.pedidos ?? [];
  const estoqueCustoTotal = produtos.reduce((sum: number, p: any) => sum + ((p.custoMedio ?? 0) * (p.estoque ?? 0)), 0);
  const estoqueValorVendaTotal = produtos.reduce((sum: number, p: any) => sum + ((p.preco ?? 0) * (p.estoque ?? 0)), 0);
  const estoqueMargemBruta = estoqueValorVendaTotal - estoqueCustoTotal;
  const estoqueMargemBrutaPct = estoqueCustoTotal > 0 ? (estoqueMargemBruta / estoqueCustoTotal) * 100 : 0;
  const produtosSemCusto = produtos.filter((p: any) => !(p.custoMedio > 0));
  const produtoVendas: Record<string, { nome: string; qtd: number; receita: number }> = {};
  for (const p of pedidos.filter((p: any) => p.status === "ENTREGUE")) {
    for (const item of p.itens ?? []) {
      const nome = item.produto?.nome ?? "Desconhecido";
      if (!produtoVendas[nome]) produtoVendas[nome] = { nome, qtd: 0, receita: 0 };
      produtoVendas[nome].qtd += item.quantidade;
      produtoVendas[nome].receita += item.subtotal;
    }
  }
  const topProdutos = Object.values(produtoVendas).sort((a, b) => b.qtd - a.qtd).slice(0, 5);

  // Dados para gráfico de pizza de origens
  const origemData = Object.entries(kpisPedidos?.porOrigem ?? {}).map(([k, v], i) => ({
    name: k === "CARDAPIO_DIGITAL" ? "Cardápio" : k === "MANUAL" ? "Manual" : k,
    value: v as number,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KPIs & Indicadores Estratégicos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visão gerencial completa — {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* Indicadores principais */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Volume Operacional (30d)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Pedidos Recebidos",  value: kpisPedidos?.total ?? 0,                        icon: ShoppingCart, color: "bg-blue-100 text-blue-700",    trend: null },
            { label: "Pedidos Entregues",  value: kpisPedidos?.entregues ?? 0,                     icon: Target,       color: "bg-emerald-100 text-emerald-700", trend: null },
            { label: "Ticket Médio",       value: fmt(kpisPedidos?.ticketMedio ?? 0),              icon: TrendingUp,   color: "bg-violet-100 text-violet-700", trend: null },
            { label: "Tempo Médio (min)",  value: `${kpisPedidos?.tempoMedioAtendimento ?? 0}min`, icon: Clock,        color: "bg-amber-100 text-amber-700",   trend: null },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-3">
                <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                  <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Indicadores financeiros */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Financeiro (30d)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Receita Total",  value: fmt(resumoFinanceiro?.receita ?? 0),  icon: TrendingUp,   color: "bg-emerald-100 text-emerald-700" },
            { label: "Custos Totais",  value: fmt(resumoFinanceiro?.custos ?? 0),   icon: TrendingDown, color: "bg-red-100 text-red-700" },
            { label: "Margem Líquida", value: fmt(resumoFinanceiro?.margem ?? 0),   icon: DollarSign,   color: "bg-blue-100 text-blue-700" },
            { label: "Margem %",       value: `${(resumoFinanceiro?.margemPct ?? 0).toFixed(1)}%`, icon: BarChart3, color: "bg-violet-100 text-violet-700" },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-3">
                <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                  <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
                </div>
                <p className={`text-2xl font-bold ${k.label === "Margem Líquida" && (resumoFinanceiro?.margem ?? 0) < 0 ? "text-red-600" : ""}`}>
                  {k.value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Custos de estoque */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Custos de Estoque</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Custo do Estoque", value: fmt(estoqueCustoTotal), icon: Package, color: "bg-blue-100 text-blue-700" },
            { label: "Venda Potencial", value: fmt(estoqueValorVendaTotal), icon: TrendingUp, color: "bg-emerald-100 text-emerald-700" },
            { label: "Margem Bruta", value: fmt(estoqueMargemBruta), icon: DollarSign, color: "bg-violet-100 text-violet-700" },
            { label: "Margem Bruta %", value: `${estoqueMargemBrutaPct.toFixed(1)}%`, icon: BarChart3, color: "bg-amber-100 text-amber-700" },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-3">
                <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                  <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Indicadores de clientes */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Base de Clientes</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Cadastrados", value: kpisClientes?.total ?? 0,       icon: Users,      color: "bg-blue-100 text-blue-700" },
            { label: "Recorrentes (3+)",  value: kpisClientes?.recorrentes ?? 0, icon: UserCheck,  color: "bg-emerald-100 text-emerald-700" },
            { label: "Inativos (+30d)",   value: kpisClientes?.inativos ?? 0,    icon: UserX,      color: "bg-red-100 text-red-700" },
            { label: "Novos (30d)",       value: kpisClientes?.novos30dias ?? 0, icon: Zap,        color: "bg-amber-100 text-amber-700" },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-3">
                <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                  <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top produtos */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 Produtos Mais Vendidos</CardTitle></CardHeader>
          <CardContent>
            {topProdutos.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados de vendas</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topProdutos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(v: any, name: string) => [name === "qtd" ? `${v} un.` : fmt(v), name === "qtd" ? "Qtd" : "Receita"]} />
                  <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="qtd" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Origem dos pedidos */}
        <Card>
          <CardHeader><CardTitle className="text-base">Origem dos Pedidos</CardTitle></CardHeader>
          <CardContent>
            {origemData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={origemData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {origemData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alertas e gargalos */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Alertas & Gargalos</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Estoque crítico */}
          <Card className={alertasEstoque.length > 0 ? "border-amber-200" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${alertasEstoque.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                Estoque Crítico
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alertasEstoque.length === 0 ? (
                <p className="text-sm text-emerald-600 font-medium">✓ Todos os produtos OK</p>
              ) : (
                <div className="space-y-1">
                  {alertasEstoque.slice(0, 4).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{p.nome}</span>
                      <Badge className="bg-amber-100 text-amber-700 ml-2">{p.estoque} un.</Badge>
                    </div>
                  ))}
                  {alertasEstoque.length > 4 && (
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/estoque/alertas")}>
                      +{alertasEstoque.length - 4} mais
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Taxa de cancelamento */}
          <Card className={(kpisPedidos?.taxaCancelamento ?? 0) > 10 ? "border-red-200" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Performance Operacional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Taxa cancelamento</span>
                <Badge className={(kpisPedidos?.taxaCancelamento ?? 0) > 10 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}>
                  {(kpisPedidos?.taxaCancelamento ?? 0).toFixed(1)}%
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tempo médio</span>
                <Badge className="bg-blue-100 text-blue-700">{kpisPedidos?.tempoMedioAtendimento ?? 0} min</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Em andamento</span>
                <Badge className="bg-amber-100 text-amber-700">{kpisPedidos?.ativos ?? 0}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Clientes inativos */}
          <Card className={(kpisClientes?.inativos ?? 0) > 5 ? "border-red-200" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserX className="h-4 w-4 text-muted-foreground" />
                Retenção de Clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Inativos (+30d)</span>
                <Badge className={(kpisClientes?.inativos ?? 0) > 5 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}>
                  {kpisClientes?.inativos ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Recorrentes</span>
                <Badge className="bg-emerald-100 text-emerald-700">{kpisClientes?.recorrentes ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Taxa recorrência</span>
                <Badge className="bg-blue-100 text-blue-700">
                  {kpisClientes?.total > 0 ? ((kpisClientes.recorrentes / kpisClientes.total) * 100).toFixed(0) : 0}%
                </Badge>
              </div>
              {(kpisClientes?.inativos ?? 0) > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/clientes/recorrencia")}>
                  Ver clientes inativos →
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className={produtosSemCusto.length > 0 ? "border-amber-200" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className={`h-4 w-4 ${produtosSemCusto.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                Custos Não Informados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {produtosSemCusto.length === 0 ? (
                <p className="text-sm text-emerald-600 font-medium">✓ Todos os produtos com custo definido</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {produtosSemCusto.length} produto(s) ainda sem custo médio.
                  </p>
                  <div className="space-y-1">
                    {produtosSemCusto.slice(0, 4).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="truncate">{p.nome}</span>
                        <Badge className="bg-amber-100 text-amber-700 ml-2">Sem custo</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
