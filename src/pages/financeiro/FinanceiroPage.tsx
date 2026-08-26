import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Percent, Plus, Coins, BarChart3, Package } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import UnifiedPeriodFilter, { UnifiedPeriod, getRangeFromFilter } from "@/components/shared/UnifiedPeriodFilter";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CATEGORIAS_RECEITA = ["Venda", "Delivery", "Outros"];
const CATEGORIAS_CUSTO = ["Estoque", "Fornecedor", "Aluguel", "Funcionários", "Marketing", "Operacional", "Outros"];

/**
 * Financeiro unificado: além das receitas/custos lançados, absorve o antigo
 * módulo de Custos (custo imobilizado em estoque, custo por produto, entradas
 * com custo real e custos operacionais fixos). Sub-abas:
 * Resumo · Gráfico · Lançamentos · Custos de Produto · Custos Operacionais.
 */
export default function FinanceiroPage() {
  const queryClient = useQueryClient();
  const location = useLocation();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "RECEITA", categoria: "", descricao: "", valor: "", data: new Date().toISOString().split("T")[0] });
  const [periodo, setPeriodo] = useState<UnifiedPeriod>("total");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>(undefined);
  const [operacionalForm, setOperacionalForm] = useState({
    titulo: "",
    descricao: "",
    valor: "",
    data: new Date().toISOString().split("T")[0],
  });

  // A aba pode vir por ?aba= (usado pelos redirects das rotas antigas de Custos).
  const [aba, setAba] = useState(() => new URLSearchParams(location.search).get("aba") || "resumo");
  useEffect(() => {
    const a = new URLSearchParams(location.search).get("aba");
    if (a) setAba(a);
  }, [location.search]);

  const range = getRangeFromFilter(periodo, selectedMonths, customRange);
  const params = new URLSearchParams({
    dataInicio: format(range.from, "yyyy-MM-dd"),
    dataFim: format(range.to, "yyyy-MM-dd"),
  });

  const { data: resumo } = useQuery({
    queryKey: ["financeiro-resumo", periodo, selectedMonths.join(","), customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: () => api.get<any>(`/api/financeiro/resumo?${params.toString()}`),
  });

  const { data: lancamentosData } = useQuery({
    queryKey: ["financeiro-lancamentos", periodo, selectedMonths.join(","), customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: () => api.get<any>(`/api/financeiro?${params.toString()}&limit=50`),
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["custos-produtos"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const { data: movimentacoes = [] } = useQuery({
    queryKey: ["custos-movimentacoes"],
    queryFn: () => api.get<any[]>("/api/estoque/movimentacoes"),
  });

  const criar = useMutation({
    mutationFn: (data: any) => api.post("/api/financeiro", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
      toast.success("Lançamento registrado");
      setModalOpen(false);
      setForm({ tipo: "RECEITA", categoria: "", descricao: "", valor: "", data: new Date().toISOString().split("T")[0] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const registrarOperacional = useMutation({
    mutationFn: (data: any) => api.post("/api/financeiro", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
      toast.success("Custo operacional cadastrado");
      setOperacionalForm({ titulo: "", descricao: "", valor: "", data: new Date().toISOString().split("T")[0] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const lancamentos = lancamentosData?.lancamentos ?? [];
  const categorias = form.tipo === "RECEITA" ? CATEGORIAS_RECEITA : CATEGORIAS_CUSTO;

  // --- Métricas de custo de estoque (do antigo módulo Custos) ---
  const movimentacoesFiltradas = useMemo(() => {
    return movimentacoes.filter((m: any) => {
      const d = new Date(m.criadoEm);
      return d >= range.from && d <= range.to && m.tipo === "ENTRADA" && Number(m.custoTotal ?? 0) > 0;
    });
  }, [movimentacoes, range.from, range.to]);

  const custoTotalEstoque = produtos.reduce((sum: number, p: any) => sum + ((p.custoMedio ?? 0) * (p.estoque ?? 0)), 0);
  const valorVendaEstoque = produtos.reduce((sum: number, p: any) => sum + ((p.preco ?? 0) * (p.estoque ?? 0)), 0);
  const margemBruta = valorVendaEstoque - custoTotalEstoque;
  const custoMedioGeral = produtos.length > 0
    ? produtos.reduce((sum: number, p: any) => sum + (p.custoMedio ?? 0), 0) / produtos.length
    : 0;

  const topCustoUnit = [...produtos].sort((a: any, b: any) => (b.custoMedio ?? 0) - (a.custoMedio ?? 0)).slice(0, 5);
  const topCustoTotal = [...produtos].sort((a: any, b: any) => ((b.custoMedio ?? 0) * (b.estoque ?? 0)) - ((a.custoMedio ?? 0) * (a.estoque ?? 0))).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-muted-foreground text-sm mt-1">Receitas, custos, custo de estoque e custos operacionais</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo Lançamento</Button>
      </div>

      <UnifiedPeriodFilter
        value={periodo}
        onChange={setPeriodo}
        selectedMonths={selectedMonths}
        onMonthsChange={setSelectedMonths}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
      />

      {/* KPIs financeiros do período */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-emerald-500/15"><TrendingUp className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /></div></div>
            <p className="kpi-value">{fmt(resumo?.receita ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Receita</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-red-500/15"><TrendingDown className="h-4 w-4 text-red-700 dark:text-red-300" /></div></div>
            <p className="kpi-value">{fmt(resumo?.custos ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Custos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-blue-500/15"><DollarSign className="h-4 w-4 text-blue-700 dark:text-blue-300" /></div></div>
            <p className={`kpi-value ${(resumo?.margem ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{fmt(resumo?.margem ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Margem</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-violet-500/15"><Percent className="h-4 w-4 text-violet-700 dark:text-violet-300" /></div></div>
            <p className="kpi-value">{(resumo?.margemPct ?? 0).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Margem %</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="grafico">Gráfico</TabsTrigger>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="custos-produto">Custos de Produto</TabsTrigger>
          <TabsTrigger value="custos-operacional">Custos Operacionais</TabsTrigger>
        </TabsList>

        {/* RESUMO — custo imobilizado em estoque + rankings */}
        <TabsContent value="resumo" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Custo do Estoque", value: fmt(custoTotalEstoque), icon: Coins, color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
              { label: "Venda Potencial", value: fmt(valorVendaEstoque), icon: TrendingUp, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
              { label: "Margem Bruta", value: fmt(margemBruta), icon: TrendingDown, color: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
              { label: "Custo Médio Geral", value: fmt(custoMedioGeral), icon: BarChart3, color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-4 pb-3">
                  <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                    <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
                  </div>
                  <p className="kpi-value">{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Produtos com maior custo unitário</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topCustoUnit.length === 0 && <p className="text-sm text-muted-foreground">Sem produtos.</p>}
                {topCustoUnit.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.categoria}</p>
                    </div>
                    <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300">{fmt(p.custoMedio ?? 0)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Produtos com maior custo total em estoque</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topCustoTotal.length === 0 && <p className="text-sm text-muted-foreground">Sem produtos.</p>}
                {topCustoTotal.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.estoque} un. em estoque</p>
                    </div>
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{fmt((p.custoMedio ?? 0) * (p.estoque ?? 0))}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* GRÁFICO — receita diária */}
        <TabsContent value="grafico" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Receita Diária (últimos 30 dias)</CardTitle></CardHeader>
            <CardContent>
              {resumo?.graficoDiario?.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={resumo.graficoDiario}>
                    <defs>
                      <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} tickFormatter={v => format(new Date(v + "T12:00:00"), "dd/MM", { locale: ptBR })} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmt(v)} labelFormatter={v => format(new Date(v + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} />
                    <Area type="monotone" dataKey="valor" stroke="hsl(var(--primary))" fill="url(#colorReceita)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-muted-foreground">Sem dados para exibir</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LANÇAMENTOS — ledger */}
        <TabsContent value="lancamentos" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum lançamento</TableCell></TableRow>
                  )}
                  {lancamentos.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Badge className={l.tipo === "RECEITA" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}>
                          {l.tipo === "RECEITA" ? "Receita" : "Custo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{l.categoria}</TableCell>
                      <TableCell className="text-sm">{l.descricao}</TableCell>
                      <TableCell className={`font-bold ${l.tipo === "RECEITA" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                        {l.tipo === "RECEITA" ? "+" : "-"}{fmt(l.valor)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(l.data), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CUSTOS DE PRODUTO — tabela de custo por produto + entradas com custo */}
        <TabsContent value="custos-produto" className="mt-4 space-y-6">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Custo unit.</TableHead>
                    <TableHead>Estoque</TableHead>
                    <TableHead>Custo total</TableHead>
                    <TableHead>Preço venda</TableHead>
                    <TableHead>Margem/un.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtos.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum produto encontrado</TableCell></TableRow>
                  ) : (
                    [...produtos]
                      .sort((a: any, b: any) => ((b.custoMedio ?? 0) * (b.estoque ?? 0)) - ((a.custoMedio ?? 0) * (a.estoque ?? 0)))
                      .map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              {p.nome}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{p.categoria}</Badge></TableCell>
                          <TableCell className="font-medium text-red-600 dark:text-red-400">{fmt(p.custoMedio ?? 0)}</TableCell>
                          <TableCell>{p.estoque}</TableCell>
                          <TableCell className="font-medium text-red-600 dark:text-red-400">{fmt((p.custoMedio ?? 0) * (p.estoque ?? 0))}</TableCell>
                          <TableCell>{fmt(p.preco ?? 0)}</TableCell>
                          <TableCell className={(p.preco ?? 0) - (p.custoMedio ?? 0) < 0 ? "text-red-700 dark:text-red-300 font-medium" : "font-medium"}>
                            {fmt((p.preco ?? 0) - (p.custoMedio ?? 0))}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Entradas de estoque com custo no período</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Custo unit.</TableHead>
                    <TableHead>Custo total</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentacoesFiltradas.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma entrada com custo no período</TableCell></TableRow>
                  ) : (
                    movimentacoesFiltradas.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(m.criadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                        <TableCell className="font-medium">{m.produto?.nome}</TableCell>
                        <TableCell>{m.quantidade}</TableCell>
                        <TableCell className="text-red-600 dark:text-red-400">{fmt(m.custoUnitario ?? 0)}</TableCell>
                        <TableCell className="font-medium text-red-600 dark:text-red-400">{fmt(m.custoTotal ?? 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.motivo ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CUSTOS OPERACIONAIS — custos fixos */}
        <TabsContent value="custos-operacional" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Custos operacionais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cadastre salários, aluguel, apps de entrega, manutenção e demais custos fixos da operação.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {[
                  { titulo: "Salário", descricao: "Salário da equipe / funcionária" },
                  { titulo: "Entrega", descricao: "Apps, motoboy, frete e logística" },
                  { titulo: "Operacional", descricao: "Aluguel, energia, internet, manutenção" },
                ].map((item) => (
                  <button
                    key={item.titulo}
                    type="button"
                    className="rounded-xl border p-4 text-left hover:border-primary/50 transition-colors"
                    onClick={() => setOperacionalForm((f) => ({ ...f, titulo: item.titulo, descricao: item.descricao }))}
                  >
                    <p className="font-semibold">{item.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.descricao}</p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input
                    value={operacionalForm.titulo}
                    onChange={(e) => setOperacionalForm((f) => ({ ...f, titulo: e.target.value }))}
                    placeholder="Ex: Salário da funcionária"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={operacionalForm.valor}
                    onChange={(e) => setOperacionalForm((f) => ({ ...f, valor: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Textarea
                  rows={3}
                  value={operacionalForm.descricao}
                  onChange={(e) => setOperacionalForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Explique o custo e o contexto..."
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input
                    type="date"
                    value={operacionalForm.data}
                    onChange={(e) => setOperacionalForm((f) => ({ ...f, data: e.target.value }))}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={() => registrarOperacional.mutate({
                      tipo: "CUSTO",
                      categoria: "Operacional",
                      descricao: `${operacionalForm.titulo} - ${operacionalForm.descricao}`,
                      valor: Number(operacionalForm.valor),
                      data: operacionalForm.data,
                    })}
                    disabled={!operacionalForm.titulo || !operacionalForm.descricao || !operacionalForm.valor || registrarOperacional.isPending}
                  >
                    Cadastrar custo operacional
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v, categoria: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEITA">Receita</SelectItem>
                  <SelectItem value="CUSTO">Custo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Categoria *</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Descrição *</Label><Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Data *</Label><Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => criar.mutate({ ...form, valor: Number(form.valor) })} disabled={!form.categoria || !form.descricao || !form.valor || criar.isPending}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
