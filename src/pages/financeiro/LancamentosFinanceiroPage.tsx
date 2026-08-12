import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import UnifiedPeriodFilter, { UnifiedPeriod, getRangeFromFilter } from "@/components/shared/UnifiedPeriodFilter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CATEGORIAS_RECEITA = ["Venda", "Delivery", "Outros"];
const CATEGORIAS_CUSTO = ["Estoque", "Fornecedor", "Aluguel", "Funcionários", "Marketing", "Operacional", "Outros"];

export default function LancamentosFinanceiroPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<UnifiedPeriod>("total");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "RECEITA", categoria: "", descricao: "", valor: "", data: new Date().toISOString().split("T")[0] });

  const range = getRangeFromFilter(periodo, selectedMonths, customRange);
  const params = new URLSearchParams({
    dataInicio: format(range.from, "yyyy-MM-dd"),
    dataFim: format(range.to, "yyyy-MM-dd"),
  });

  const { data: lancamentosData } = useQuery({
    queryKey: ["financeiro-lancamentos-page", periodo, selectedMonths.join(","), customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: () => api.get<any>(`/api/financeiro?${params.toString()}&limit=200`),
  });

  const { data: resumo } = useQuery({
    queryKey: ["financeiro-lancamentos-resumo", periodo, selectedMonths.join(","), customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: () => api.get<any>(`/api/financeiro/resumo?${params.toString()}`),
  });

  const criar = useMutation({
    mutationFn: (data: any) => api.post("/api/financeiro", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro-lancamentos-page"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-lancamentos-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-resumo"] });
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Lançamentos</h1>
          <p className="text-muted-foreground text-sm mt-1">Histórico completo de receitas e custos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/financeiro")}>
            <ArrowRight className="h-4 w-4 mr-2" />
            Ir para resumo
          </Button>
          <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo Lançamento</Button>
        </div>
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
        <Card><CardContent className="pt-4 pb-3"><p className="text-2xl font-bold">{fmt(resumo?.receita ?? 0)}</p><p className="text-xs text-muted-foreground mt-0.5">Receita</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-2xl font-bold">{fmt(resumo?.custos ?? 0)}</p><p className="text-xs text-muted-foreground mt-0.5">Custos</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className={`text-2xl font-bold ${(resumo?.margem ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(resumo?.margem ?? 0)}</p><p className="text-xs text-muted-foreground mt-0.5">Margem</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-2xl font-bold">{(resumo?.margemPct ?? 0).toFixed(1)}%</p><p className="text-xs text-muted-foreground mt-0.5">Margem %</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lançamentos no período</CardTitle></CardHeader>
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
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum lançamento encontrado</TableCell></TableRow>
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
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(l.data), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
