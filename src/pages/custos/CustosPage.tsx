import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Coins, TrendingUp, TrendingDown, BarChart3, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import UnifiedPeriodFilter, { UnifiedPeriod, getRangeFromFilter } from "@/components/shared/UnifiedPeriodFilter";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CustosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const getAbaFromRoute = () => {
    const abaQuery = new URLSearchParams(location.search).get("aba");
    if (abaQuery) return abaQuery;
    if (location.pathname.endsWith("/produtos")) return "produtos";
    if (location.pathname.endsWith("/lancamentos")) return "movimentos";
    return "resumo";
  };
  const [aba, setAba] = useState(getAbaFromRoute());
  const [periodo, setPeriodo] = useState<UnifiedPeriod>("total");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>();
  const [operacionalForm, setOperacionalForm] = useState({
    titulo: "",
    descricao: "",
    valor: "",
    data: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    setAba(getAbaFromRoute());
  }, [location.pathname, location.search]);

  const range = getRangeFromFilter(periodo, selectedMonths, customRange);

  const { data: produtos = [] } = useQuery({
    queryKey: ["custos-produtos"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const { data: movimentacoes = [] } = useQuery({
    queryKey: ["custos-movimentacoes"],
    queryFn: () => api.get<any[]>("/api/estoque/movimentacoes"),
  });

  const movimentacoesFiltradas = useMemo(() => {
    return movimentacoes.filter((m: any) => {
      const d = new Date(m.criadoEm);
      return d >= range.from && d <= range.to && m.tipo === "ENTRADA" && Number(m.custoTotal ?? 0) > 0;
    });
  }, [movimentacoes, range.from, range.to]);

  const custoTotalEstoque = produtos.reduce((sum: number, p: any) => sum + ((p.custoMedio ?? 0) * (p.estoque ?? 0)), 0);
  const valorVendaEstoque = produtos.reduce((sum: number, p: any) => sum + ((p.preco ?? 0) * (p.estoque ?? 0)), 0);
  const margemBruta = valorVendaEstoque - custoTotalEstoque;
  const margemPct = custoTotalEstoque > 0 ? (margemBruta / custoTotalEstoque) * 100 : 0;
  const custoMedioGeral = produtos.length > 0
    ? produtos.reduce((sum: number, p: any) => sum + (p.custoMedio ?? 0), 0) / produtos.length
    : 0;

  const topCustoUnit = [...produtos]
    .sort((a: any, b: any) => (b.custoMedio ?? 0) - (a.custoMedio ?? 0))
    .slice(0, 8);

  const topCustoTotal = [...produtos]
    .sort((a: any, b: any) => ((b.custoMedio ?? 0) * (b.estoque ?? 0)) - ((a.custoMedio ?? 0) * (a.estoque ?? 0)))
    .slice(0, 8);

  const registrarOperacional = useMutation({
    mutationFn: (data: any) => api.post("/api/financeiro", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
      setOperacionalForm({
        titulo: "",
        descricao: "",
        valor: "",
        data: new Date().toISOString().split("T")[0],
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Custos</h1>
          <p className="text-muted-foreground text-sm mt-1">Custos por produto, estoque imobilizado e entradas com custo real</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/financeiro/lancamentos")}>
          Ver lançamentos financeiros
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      <UnifiedPeriodFilter
        value={periodo}
        onChange={setPeriodo}
        selectedMonths={selectedMonths}
        onMonthsChange={setSelectedMonths}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Custo do Estoque", value: fmt(custoTotalEstoque), icon: Coins, color: "bg-blue-100 text-blue-700" },
          { label: "Venda Potencial", value: fmt(valorVendaEstoque), icon: TrendingUp, color: "bg-emerald-100 text-emerald-700" },
          { label: "Margem Bruta", value: fmt(margemBruta), icon: TrendingDown, color: "bg-violet-100 text-violet-700" },
          { label: "Custo Médio Geral", value: fmt(custoMedioGeral), icon: BarChart3, color: "bg-amber-100 text-amber-700" },
        ].map((k) => (
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

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
          <TabsTrigger value="operacionais">Operacionais</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Produtos com maior custo unitário</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topCustoUnit.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.categoria}</p>
                    </div>
                    <Badge className="bg-violet-100 text-violet-700">{fmt(p.custoMedio ?? 0)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Produtos com maior custo total em estoque</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topCustoTotal.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.estoque} un. em estoque</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700">{fmt((p.custoMedio ?? 0) * (p.estoque ?? 0))}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="produtos" className="mt-4">
          <Card>
            <CardContent className="p-0">
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
                    produtos
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
                          <TableCell>{fmt(p.custoMedio ?? 0)}</TableCell>
                          <TableCell>{p.estoque}</TableCell>
                          <TableCell>{fmt((p.custoMedio ?? 0) * (p.estoque ?? 0))}</TableCell>
                          <TableCell>{fmt(p.preco ?? 0)}</TableCell>
                          <TableCell className={(p.preco ?? 0) - (p.custoMedio ?? 0) < 0 ? "text-red-600 font-medium" : "font-medium"}>
                            {fmt((p.preco ?? 0) - (p.custoMedio ?? 0))}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimentos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entradas de estoque com custo no período</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
                        <TableCell>{fmt(m.custoUnitario ?? 0)}</TableCell>
                        <TableCell className="font-medium">{fmt(m.custoTotal ?? 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.motivo ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operacionais" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Custos operacionais</CardTitle>
            </CardHeader>
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
    </div>
  );
}
