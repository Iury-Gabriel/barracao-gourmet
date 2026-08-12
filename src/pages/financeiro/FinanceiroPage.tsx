import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Percent, Plus } from "lucide-react";
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

export default function FinanceiroPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "RECEITA", categoria: "", descricao: "", valor: "", data: new Date().toISOString().split("T")[0] });
  const [periodo, setPeriodo] = useState<UnifiedPeriod>("total");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>(undefined);

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

  const lancamentos = lancamentosData?.lancamentos ?? [];
  const categorias = form.tipo === "RECEITA" ? CATEGORIAS_RECEITA : CATEGORIAS_CUSTO;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-muted-foreground text-sm mt-1">Controle de receitas e custos</p>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-emerald-100"><TrendingUp className="h-4 w-4 text-emerald-600" /></div></div>
            <p className="text-2xl font-bold">{fmt(resumo?.receita ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Receita</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-red-100"><TrendingDown className="h-4 w-4 text-red-600" /></div></div>
            <p className="text-2xl font-bold">{fmt(resumo?.custos ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Custos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-blue-100"><DollarSign className="h-4 w-4 text-blue-600" /></div></div>
            <p className={`text-2xl font-bold ${(resumo?.margem ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(resumo?.margem ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Margem</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2"><div className="rounded-xl p-2 bg-violet-100"><Percent className="h-4 w-4 text-violet-600" /></div></div>
            <p className="text-2xl font-bold">{(resumo?.margemPct ?? 0).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Margem %</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="grafico">
        <TabsList>
          <TabsTrigger value="grafico">Gráfico</TabsTrigger>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
        </TabsList>

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

        <TabsContent value="lancamentos" className="mt-4">
          <Card>
            <CardContent className="p-0">
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
                        <Badge className={l.tipo === "RECEITA" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                          {l.tipo === "RECEITA" ? "Receita" : "Custo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{l.categoria}</TableCell>
                      <TableCell className="text-sm">{l.descricao}</TableCell>
                      <TableCell className={`font-bold ${l.tipo === "RECEITA" ? "text-emerald-600" : "text-red-600"}`}>
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
